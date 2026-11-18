'use strict';

/**
 * Test harness for the SendGrid, Mailgun and Brevo send paths: a minimal fake
 * Strapi with the real email-router service, in-memory accounts, a
 * deterministic delivery log and tracking, and a recording fake `fetch`.
 * Synthetic data only; nothing leaves the process.
 */

const ROUTER_PATH = '../../server/src/services/email-router';
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Sets a throw-away encryption key for account configs.
 *
 * @returns {() => void} restores the previous value
 */
function withEncryptionKey() {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 's'.repeat(32);
  return () => {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  };
}

/** Synthetic Brevo webhook token used by accountFor('brevo'). */
const BREVO_WEBHOOK_TOKEN = 'brevo-webhook-token-synthetic-0123456789abcdef';

/** Synthetic Amazon SES config (fake key pair, not real AWS credentials). */
const SES_TEST_CONFIG = Object.freeze({
  region: 'eu-west-1',
  credentialSource: 'keys',
  accessKeyId: 'FAKEKEYIDFORTESTS001',
  secretAccessKey: 'fakeSecretForMagicMailTests/0123456789abc',
});

/**
 * Builds a SendGrid, Mailgun, Brevo or Amazon SES account with an encrypted config.
 *
 * @param {'sendgrid'|'mailgun'|'brevo'|'ses'} provider
 * @param {object} [config] - Extra plain config (region, domain, ...)
 * @returns {object}
 */
function accountFor(provider, config = {}) {
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  let plain;
  if (provider === 'sendgrid') plain = { apiKey: 'SG.fake', ...config };
  else if (provider === 'brevo') {
    plain = { apiKey: 'xkeysib-fake-synthetic-key', webhookToken: BREVO_WEBHOOK_TOKEN, ...config };
  } else if (provider === 'ses') plain = { ...SES_TEST_CONFIG, ...config };
  else plain = { apiKey: 'key-fake', domain: 'mg.example.test', ...config };
  return {
    documentId: `acc${provider}`,
    name: `test-${provider}`,
    provider,
    fromEmail: `noreply@${provider}.example.test`,
    fromName: 'Test Sender',
    isActive: true,
    isPrimary: true,
    priority: 5,
    config: encryptCredentials(plain),
  };
}

/**
 * Fake Strapi with the real router.
 *
 * @param {object[]} accounts
 * @param {{logDocumentId?: string|null, tracking?: 'all'|'opens'|'none'}} [options]
 *   `tracking`: what the fake analytics service really applies
 * @returns {{router: object, logs: string[], accountManager: object}}
 */
function createHarness(accounts, { logDocumentId = 'logdoc123', tracking = 'all' } = {}) {
  const logs = [];
  const log = {
    debug() {},
    info() {},
    warn: (message) => logs.push(String(message)),
    error: (message) => logs.push(String(message)),
  };
  const services = {};
  const strapi = {
    log,
    config: { get: (key, fallback) => fallback },
    plugin(name) {
      if (name !== 'magic-mail') return null;
      return { service: (serviceName) => services[serviceName] };
    },
    documents(uid) {
      return {
        findMany: async ({ filters = {} } = {}) => {
          if (uid.endsWith('routing-rule')) return [];
          const excluded = filters.documentId?.$notIn || [];
          return accounts
            .filter((a) => a.isActive !== false && !excluded.includes(a.documentId))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
        },
        findOne: async ({ documentId }) =>
          accounts.find((a) => a.documentId === documentId) || null,
        findFirst: async () => null,
        update: async ({ data }) => data,
      };
    },
  };
  services['plugin-settings'] = { getSettings: async () => ({}) };
  services.analytics = {
    createEmailLog: async () =>
      logDocumentId === null ? null : { documentId: logDocumentId, emailId: 'emailtest1' },
    updateEmailLog: async () => {},
    generateRecipientHash: () => 'hash',
    addTracking: async (html, emailId, hash, { openTracking, linkTracking, applied }) => {
      if (tracking === 'none') return html;
      let out = html;
      if (linkTracking && tracking === 'all' && out.includes('https://shop.example.test/')) {
        out = out.replace('https://shop.example.test/', 'https://track.example.test/c/1?u=');
        if (applied) applied.clicks = true;
      }
      if (openTracking) {
        out = `${out}<img src="https://track.example.test/o/${emailId}">`;
        if (applied) applied.opens = true;
      }
      return out;
    },
  };
  delete require.cache[require.resolve(ROUTER_PATH)];
  const router = require(ROUTER_PATH)({ strapi });
  router.updateAccountStats = async () => {};
  router.reserveQuota = async () => 'unlimited';
  router.releaseQuota = async () => {};
  router.markLog = async () => {};
  router.queueService = () => null;
  services['email-router'] = router;
  delete require.cache[require.resolve('../../server/src/services/account-manager')];
  services['account-manager'] = require('../../server/src/services/account-manager')({ strapi });
  return { router, logs, accountManager: services['account-manager'] };
}

/**
 * Replaces global fetch with a recorder.
 *
 * @param {(call: object) => (object|Promise<object>)} [respond] - fake Response factory
 * @returns {{calls: object[], restore: () => void}}
 */
function fakeFetch(respond) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const call = { url: String(url), method: opts.method, headers: { ...(opts.headers || {}) } };
    if (opts.body instanceof FormData) {
      call.form = [];
      call.files = [];
      for (const [key, value] of opts.body.entries()) {
        if (typeof value === 'string') call.form.push([key, value]);
        else {
          call.form.push([key, '<file>']);
          call.files.push({ field: key, filename: value.name, type: value.type, size: value.size });
        }
      }
    } else if (typeof opts.body === 'string') {
      call.json = JSON.parse(opts.body);
      call.bodyBytes = Buffer.byteLength(opts.body);
    }
    calls.push(call);
    if (respond) return respond(call);
    if (call.url.startsWith('https://api.brevo.com/')) {
      return jsonResponse(201, { messageId: '<202611181200.12345678901@smtp-relay.mailin.fr>' });
    }
    return call.url.includes('mailgun')
      ? jsonResponse(200, { id: '<20261118.abc@mg.example.test>', message: 'Queued. Thank you.' })
      : jsonResponse(202, undefined, { 'x-message-id': 'sg-message-1' });
  };
  return { calls, restore: () => (global.fetch = original) };
}

/**
 * Builds a real WHATWG Response.
 *
 * @param {number} status
 * @param {unknown} [body] - JSON value, a string (sent as text) or undefined
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function jsonResponse(status, body, headers = {}) {
  if (body === undefined) return new Response(null, { status, headers });
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      'content-type': typeof body === 'string' ? 'text/plain' : 'application/json',
      ...headers,
    },
  });
}

/** 1x1 transparent PNG (synthetic inline image), base64. */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

module.exports = {
  BREVO_WEBHOOK_TOKEN,
  PIXEL_PNG,
  SES_TEST_CONFIG,
  accountFor,
  createHarness,
  fakeFetch,
  jsonResponse,
  quietLog,
  withEncryptionKey,
};
