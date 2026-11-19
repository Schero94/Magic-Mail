'use strict';

/**
 * Fake Brevo API server for integration tests, plus a fetch redirect that
 * sends requests for https://api.brevo.com to it and blocks every other host.
 *
 * Implements the documented operations Magic Mail calls (pinned OpenAPI:
 * tests/fixtures/openapi/brevo-email.json and brevo-account.json):
 * - POST /v3/smtp/email -> 201 { messageId }
 * - GET /v3/smtp/templates?limit&offset&sort -> { count, templates }
 * - GET /v3/account -> account object
 *
 * Every request the plugin sends and every success response this fake
 * returns is checked against the pinned spec; violations are collected in
 * `state.violations`, so a test can assert that there are none. Forced
 * failures (`state.failures`) answer with a Brevo-style `{ code, message }`
 * body that contains a synthetic address, to prove bodies never leak.
 * Synthetic data only.
 */

const http = require('node:http');
const { OpenApiContract } = require('./openapi-contract');

const BREVO_HOST = 'api.brevo.com';
const emailContract = new OpenApiContract('brevo-email');
const accountContract = new OpenApiContract('brevo-account');

/** @returns {object} Empty fake state */
function createBrevoState() {
  return {
    requests: [],
    violations: [],
    failures: [],
    templates: [],
    account: {
      organization_id: 'org-synthetic',
      user_id: 1,
      enterprise: false,
      companyName: 'Synthetic Company',
      email: 'owner@example.test',
      firstName: 'Synthetic',
      lastName: 'Owner',
      address: { city: 'Town', country: 'Nowhere', street: '1 Example Street', zipCode: '00000' },
      plan: [{ type: 'free', creditsType: 'sendLimit', credits: '300' }],
      relay: {
        enabled: true,
        data: { userName: 'owner@example.test', relay: 'smtp-relay.example.test', port: 587 },
      },
    },
    nextMessage: 1,
  };
}

/**
 * Validates and records one request; returns the matching contract.
 *
 * @param {object} state
 * @param {object} entry
 * @returns {OpenApiContract}
 */
function check(state, entry) {
  const contract = entry.path === '/v3/account' ? accountContract : emailContract;
  const url = `https://${BREVO_HOST}${entry.path}${entry.search}`;
  const errors = contract.checkRequest({ method: entry.method, url, json: entry.json });
  if (entry.apiKey !== 'present') errors.push('api-key header missing');
  if (entry.authorization) errors.push('unexpected Authorization header');
  for (const error of errors) state.violations.push(`${entry.method} ${entry.path}: ${error}`);
  return contract;
}

/**
 * Starts the fake server.
 *
 * @param {object} state - From createBrevoState()
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
async function startFakeBrevo(state) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, `https://${BREVO_HOST}`);
    const entry = {
      method: req.method,
      path: url.pathname,
      search: url.search,
      query: Object.fromEntries(url.searchParams),
      apiKey: req.headers['api-key'] ? 'present' : 'missing',
      apiKeyValue: req.headers['api-key'],
      authorization: req.headers.authorization || null,
      json: raw ? JSON.parse(raw) : undefined,
    };
    state.requests.push(entry);
    const contract = check(state, entry);

    const reply = (status, body, headers = {}) => {
      if (status < 300) {
        for (const error of contract.checkResponse({
          method: entry.method,
          url: `https://${BREVO_HOST}${entry.path}`,
          status,
          json: body,
        })) {
          state.violations.push(`response ${entry.method} ${entry.path}: ${error}`);
        }
      }
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };

    const forced = state.failures.find(
      (f) => f.times > 0 && f.method === req.method && entry.path.startsWith(f.pathPrefix)
    );
    if (forced) {
      forced.times -= 1;
      return reply(
        forced.status,
        forced.body || {
          code: 'invalid_parameter',
          message: 'synthetic failure for leak@example.test',
        },
        forced.headers || {}
      );
    }

    if (req.method === 'POST' && entry.path === '/v3/smtp/email') {
      const id = state.nextMessage;
      state.nextMessage += 1;
      return reply(201, { messageId: `<202611181200.${id}@smtp-relay.mailin.fr>` });
    }
    if (req.method === 'GET' && entry.path === '/v3/smtp/templates') {
      const limit = Number(entry.query.limit ?? 50);
      const offset = Number(entry.query.offset ?? 0);
      const sorted = [...state.templates].sort((a, b) =>
        entry.query.sort === 'desc' ? b.id - a.id : a.id - b.id
      );
      return reply(200, {
        count: sorted.length,
        templates: sorted.slice(offset, offset + limit),
      });
    }
    if (req.method === 'GET' && entry.path === '/v3/account') {
      return reply(200, state.account);
    }
    return reply(404, { code: 'document_not_found', message: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Redirects fetch() for api.brevo.com to the fake server; every other host
 * is blocked.
 *
 * @param {number} port
 * @returns {() => void} restore
 */
function redirectBrevoFetch(port) {
  const original = global.fetch;
  global.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname !== BREVO_HOST || url.protocol !== 'https:') {
      return Promise.reject(new TypeError(`blocked host ${url.hostname}`));
    }
    return original(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init);
  };
  return () => {
    global.fetch = original;
  };
}

/**
 * A template list item in the documented getSmtpTemplateOverview shape.
 *
 * @param {number} id
 * @param {string} name
 * @param {{isActive?: boolean, subject?: string, htmlContent?: string}} [options]
 * @returns {object}
 */
function brevoTemplate(id, name, { isActive = true, subject, htmlContent } = {}) {
  return {
    id,
    name,
    subject: subject ?? 'Hello {{ params.name }}',
    isActive,
    testSent: false,
    sender: { name: 'Synthetic', email: 'noreply@brevo.example.test', id: '1' },
    replyTo: 'reply@example.test',
    toField: '',
    tag: '',
    htmlContent:
      htmlContent ??
      '<html><body><h1>Hi {{ params.name }}</h1>{% if params.vip %}VIP{% endif %}</body></html>',
    createdAt: '2026-11-10T08:30:00.000Z',
    modifiedAt: '2026-11-11T09:00:00.000Z',
  };
}

module.exports = {
  BREVO_HOST,
  brevoTemplate,
  createBrevoState,
  redirectBrevoFetch,
  startFakeBrevo,
};
