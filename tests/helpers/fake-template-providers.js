'use strict';

/**
 * Fake SendGrid and Mailgun HTTP servers for provider-template tests, plus a
 * fetch redirect that sends requests for the fixed provider hosts to them.
 *
 * The servers implement the documented shapes (checked 2026-11-17):
 * - SendGrid GET /v3/templates?generations=dynamic&page_size=..&page_token=..
 *   ({ result, _metadata: { next } }), GET /v3/templates/{id}, POST /v3/mail/send.
 * - Mailgun GET /v3/{domain}/templates and /v4/templates (limit, page=next,
 *   p pivot; { items, paging }), GET .../templates/{name}?active=yes
 *   ({ template: { version } }), POST /v3/{domain}/messages (multipart).
 *
 * Synthetic data only.
 */

const http = require('node:http');

const PROVIDER_HOSTS = Object.freeze([
  'api.sendgrid.com',
  'api.eu.sendgrid.com',
  'api.mailgun.net',
  'api.eu.mailgun.net',
]);

/**
 * Starts one fake server for all four provider hosts. The `Host` the plugin
 * called is passed in `x-original-host` by the fetch redirect.
 *
 * @param {object} state - Mutable fake state (see createState())
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
async function startFakeProviders(state) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const host = req.headers['x-original-host'];
    const url = new URL(req.url, `https://${host}`);
    const entry = {
      host,
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: req.headers.authorization ? 'present' : 'missing',
      contentType: req.headers['content-type'] || '',
      body: raw,
    };
    state.requests.push(entry);

    const reply = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };

    const forced = state.failures.find(
      (f) =>
        f.times > 0 &&
        f.host === host &&
        entry.path.startsWith(f.pathPrefix) &&
        f.method === req.method
    );
    if (forced && forced.times > 0) {
      forced.times -= 1;
      return reply(forced.status, { errors: [{ message: 'synthetic failure' }] });
    }

    if (host.includes('sendgrid')) return handleSendGrid(state, entry, reply);
    return handleMailgun(state, entry, reply);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function handleSendGrid(state, entry, reply) {
  const region = entry.host === 'api.eu.sendgrid.com' ? 'eu' : 'us';
  const templates = state.sendgrid[region];
  if (entry.method === 'POST' && entry.path === '/v3/mail/send') {
    entry.json = JSON.parse(entry.body.toString('utf8'));
    return reply(202, undefined, { 'x-message-id': `sg-${state.requests.length}` });
  }
  if (entry.method === 'GET' && entry.path === '/v3/templates') {
    if (entry.query.generations !== 'dynamic') return reply(400, { errors: [] });
    const size = Number(entry.query.page_size);
    if (!Number.isInteger(size) || size < 1 || size > 200) return reply(400, { errors: [] });
    const pageSize = Math.min(size, state.sendgridPageSize || size);
    const start = entry.query.page_token ? Number(entry.query.page_token) : 0;
    const page = templates.slice(start, start + pageSize);
    const next = start + pageSize < templates.length ? String(start + pageSize) : null;
    return reply(200, {
      result: page.map((t) => ({
        id: t.id,
        name: t.name,
        generation: 'dynamic',
        updated_at: t.updated_at,
        versions: t.versions.map((v) => ({ id: v.id, active: v.active, name: v.name })),
      })),
      _metadata: {
        self: `https://${entry.host}/v3/templates?page_token=${start}`,
        ...(next
          ? { next: `https://${entry.host}/v3/templates?page_size=${size}&page_token=${next}` }
          : {}),
        count: templates.length,
      },
    });
  }
  const match = entry.path.match(/^\/v3\/templates\/([^/]+)$/);
  if (entry.method === 'GET' && match) {
    const template = templates.find((t) => t.id === decodeURIComponent(match[1]));
    if (!template) return reply(404, { errors: [{ message: 'not found' }] });
    return reply(200, {
      id: template.id,
      name: template.name,
      generation: 'dynamic',
      updated_at: template.updated_at,
      versions: template.versions,
    });
  }
  return reply(404, { errors: [] });
}

function handleMailgun(state, entry, reply) {
  const region = entry.host === 'api.eu.mailgun.net' ? 'eu' : 'us';
  const store = state.mailgun[region];
  const messages = entry.path.match(/^\/v3\/([^/]+)\/messages$/);
  if (entry.method === 'POST' && messages) {
    entry.form = parseMultipart(entry.body, entry.contentType);
    return reply(200, { id: `<mg-${state.requests.length}@mg.example.test>`, message: 'Queued' });
  }
  const list =
    entry.path.match(/^\/v3\/([^/]+)\/templates$/) || entry.path.match(/^\/v4\/templates$/);
  if (entry.method === 'GET' && list) {
    const scope = entry.path.startsWith('/v4/') ? 'account' : 'domain';
    if (scope === 'account' && state.mailgunAccountScopeStatus) {
      return reply(state.mailgunAccountScopeStatus, { message: 'forbidden' });
    }
    const all =
      scope === 'account' ? store.account : store.domains[decodeURIComponent(list[1])] || [];
    const limit = Number(entry.query.limit || 100);
    if (limit > 100) return reply(400, { message: 'limit' });
    const pageLimit = Math.min(limit, state.mailgunPageSize || limit);
    const start = entry.query.page === 'next' && entry.query.p ? Number(entry.query.p) : 0;
    const items = all.slice(start, start + pageLimit);
    const pivot = String(start + pageLimit);
    return reply(200, {
      items: items.map((t) => ({
        name: t.name,
        id: t.id,
        createdAt: t.createdAt,
        description: '',
      })),
      paging: {
        first: `https://${entry.host}${entry.path}?page=first&limit=${limit}`,
        last: `https://${entry.host}${entry.path}?page=last&limit=${limit}`,
        next: `https://${entry.host}${entry.path}?page=next&p=${pivot}&limit=${limit}`,
        previous: `https://${entry.host}${entry.path}?page=previous&limit=${limit}`,
      },
    });
  }
  const one =
    entry.path.match(/^\/v3\/([^/]+)\/templates\/([^/]+)$/) ||
    entry.path.match(/^\/v4\/templates\/([^/]+)$/);
  if (entry.method === 'GET' && one) {
    const accountScope = entry.path.startsWith('/v4/');
    const name = decodeURIComponent(accountScope ? one[1] : one[2]);
    const all = accountScope ? store.account : store.domains[decodeURIComponent(one[1])] || [];
    const template = all.find((t) => t.name === name);
    if (!template) return reply(404, { message: 'template not found' });
    return reply(200, {
      template: {
        name: template.name,
        id: template.id,
        createdAt: template.createdAt,
        ...(entry.query.active === 'yes' && template.version ? { version: template.version } : {}),
      },
    });
  }
  return reply(404, { message: 'not found' });
}

/**
 * Minimal multipart/form-data parser for the fake Mailgun messages route.
 *
 * @param {Buffer} body
 * @param {string} contentType
 * @returns {Array<[string, string]>}
 */
function parseMultipart(body, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  if (!boundary) return [];
  const parts = body.toString('utf8').split(`--${boundary}`);
  const out = [];
  for (const part of parts) {
    const nameMatch = /name="([^"]+)"/.exec(part);
    if (!nameMatch) continue;
    const valueStart = part.indexOf('\r\n\r\n');
    out.push([nameMatch[1], part.slice(valueStart + 4).replace(/\r\n$/, '')]);
  }
  return out;
}

/**
 * Redirects fetch() calls for the provider hosts to the fake server and
 * blocks every other non-loopback host.
 *
 * @param {number} port
 * @returns {() => void} restore
 */
function redirectProviderFetch(port) {
  const original = global.fetch;
  global.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!PROVIDER_HOSTS.includes(url.hostname)) {
      return Promise.reject(new TypeError(`blocked host ${url.hostname}`));
    }
    const target = `http://127.0.0.1:${port}${url.pathname}${url.search}`;
    const headers = new Headers(init.headers || {});
    headers.set('x-original-host', url.hostname);
    return original(target, { ...init, headers });
  };
  return () => {
    global.fetch = original;
  };
}

/** @returns {object} Empty fake provider state */
function createState() {
  return {
    requests: [],
    failures: [],
    sendgrid: { us: [], eu: [] },
    mailgun: { us: { domains: {}, account: [] }, eu: { domains: {}, account: [] } },
    mailgunAccountScopeStatus: null,
    sendgridPageSize: null,
    mailgunPageSize: null,
  };
}

module.exports = { PROVIDER_HOSTS, createState, redirectProviderFetch, startFakeProviders };
