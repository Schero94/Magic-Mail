'use strict';

// A SendGrid key without the Mail Send scope gets 401 from POST /v3/mail/send
// (observed live 2026-11-18), the same answer as a wrong key. On a 401/403 in
// the account connection test Magic Mail makes one read-only GET /v3/scopes:
// 200 means the key is valid, so a missing `mail.send` scope is reported
// with its own hint; 401/403 means the key really is invalid. Provider text
// never reaches the client. Synthetic data only; fetch is faked.

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Replaces global fetch.
 *
 * @param {(url: URL, init: object) => Response|Promise<Response>} respond
 * @returns {{calls: {url: URL, init: object}[], restore: () => void}}
 */
function fakeFetch(respond) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, restore: () => (global.fetch = original) };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const providerError = (status) =>
  Object.assign(new Error(`SendGrid API request failed: ${status}`), {
    status,
    provider: 'sendgrid',
  });

test('checkSendGridKeyScopes classifies the key with one read-only GET /v3/scopes', async () => {
  const { checkSendGridKeyScopes } = require('../server/src/utils/sendgrid-key-check');
  const cases = [
    [() => json(200, { scopes: ['templates.read', 'scopes.read'] }), 'missing-mail-send'],
    [() => json(200, { scopes: ['mail.send'] }), 'has-mail-send'],
    [() => json(401, { errors: [{ message: 'authorization required' }] }), 'invalid'],
    [() => json(403, { errors: [{ message: 'access forbidden' }] }), 'invalid'],
    [() => json(500, {}), 'unknown'],
    [() => json(200, { scopes: 'mail.send' }), 'unknown'],
    [() => new Response('not json', { status: 200 }), 'unknown'],
    [() => json(200, { scopes: ['x'.repeat(300_000)] }), 'unknown'],
    [
      () => {
        throw new TypeError('fetch failed');
      },
      'unknown',
    ],
  ];
  for (const [respond, expected] of cases) {
    const fake = fakeFetch(respond);
    try {
      assert.equal(
        await checkSendGridKeyScopes({ apiKey: 'SG.synthetic', region: 'us' }),
        expected
      );
      assert.equal(fake.calls.length, 1);
      const [{ url, init }] = fake.calls;
      assert.equal(url.href, 'https://api.sendgrid.com/v3/scopes');
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer SG.synthetic');
      assert.ok(init.signal, 'bounded by a timeout');
    } finally {
      fake.restore();
    }
  }
});

test('checkSendGridKeyScopes uses the EU host for EU accounts and never another host', async () => {
  const { checkSendGridKeyScopes } = require('../server/src/utils/sendgrid-key-check');
  const fake = fakeFetch(() => json(200, { scopes: ['mail.send'] }));
  try {
    assert.equal(await checkSendGridKeyScopes({ apiKey: 'SG.x', region: 'eu' }), 'has-mail-send');
    assert.equal(fake.calls[0].url.host, 'api.eu.sendgrid.com');
    assert.equal(await checkSendGridKeyScopes({ apiKey: 'SG.x', region: 'mars' }), 'unknown');
    assert.equal(await checkSendGridKeyScopes({ region: 'us' }), 'unknown');
    assert.equal(fake.calls.length, 1, 'no request without a valid region and key');
  } finally {
    fake.restore();
  }
});

test('providerErrorHint: the key check separates a missing Mail Send scope from a bad key', () => {
  const { providerErrorHint, PROVIDER_HINTS } = require('../server/src/utils/client-errors');
  const hint = (status, sendgridKeyCheck) =>
    providerErrorHint(providerError(status), { sendgridKeyCheck })?.code;
  assert.equal(hint(401, 'missing-mail-send'), 'SENDGRID_MISSING_MAIL_SEND');
  assert.equal(hint(403, 'missing-mail-send'), 'SENDGRID_MISSING_MAIL_SEND');
  assert.equal(hint(401, 'invalid'), 'SENDGRID_UNAUTHORIZED');
  assert.equal(hint(403, 'invalid'), 'SENDGRID_UNAUTHORIZED');
  assert.equal(hint(401, 'has-mail-send'), 'SENDGRID_UNAUTHORIZED');
  assert.equal(hint(403, 'has-mail-send'), 'SENDGRID_FORBIDDEN');
  assert.equal(hint(401, 'unknown'), 'SENDGRID_UNAUTHORIZED');
  assert.equal(hint(403, undefined), 'SENDGRID_FORBIDDEN');
  assert.equal(hint(413, 'missing-mail-send'), 'SENDGRID_PAYLOAD_TOO_LARGE');
  assert.match(PROVIDER_HINTS.SENDGRID_MISSING_MAIL_SEND, /Mail Send/);
});

/**
 * Account manager with one SendGrid account whose send fails with `failure`.
 */
async function managerWithSendGrid(failure, config = { apiKey: 'SG.synthetic', region: 'us' }) {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const accounts = [
    {
      documentId: 'sg1',
      name: 'SendGrid',
      provider: 'sendgrid',
      fromEmail: 'from@example.test',
      config: encryptCredentials(config),
    },
  ];
  const strapi = {
    log: quietLog,
    documents: () => ({
      findOne: async ({ documentId }) => accounts.find((r) => r.documentId === documentId) || null,
      findMany: async () => [],
    }),
    plugin: () => ({
      service: () => ({
        send: async () => {
          throw failure;
        },
      }),
    }),
  };
  delete require.cache[require.resolve('../server/src/services/account-manager')];
  const manager = require('../server/src/services/account-manager')({ strapi });
  manager.resolveDocumentId = async () => 'sg1';
  return manager;
}

async function withKey(fn) {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(64);
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  }
}

test('account test: a 401 from a valid key without mail.send gets the Mail Send hint', async () => {
  await withKey(async () => {
    const secretText = 'scope list for ceo@victim.example';
    const fake = fakeFetch(() => json(200, { scopes: ['templates.read'], note: secretText }));
    try {
      const manager = await managerWithSendGrid(providerError(401));
      const result = await manager.testAccount('sg1', 'to@example.test');
      assert.equal(result.success, false);
      assert.equal(result.message, 'SendGrid API request failed: 401');
      assert.equal(result.hintCode, 'SENDGRID_MISSING_MAIL_SEND');
      assert.match(result.hint, /Mail Send/);
      assert.doesNotMatch(JSON.stringify(result), /victim|templates\.read|SG\.synthetic/);
      assert.equal(fake.calls.length, 1);
      assert.equal(fake.calls[0].url.pathname, '/v3/scopes');
    } finally {
      fake.restore();
    }
  });
});

test('account test: a 401 confirmed by /v3/scopes keeps the invalid-key hint', async () => {
  await withKey(async () => {
    const fake = fakeFetch(() => json(401, { errors: [{ message: 'bad key' }] }));
    try {
      const manager = await managerWithSendGrid(providerError(401));
      const result = await manager.testAccount('sg1', 'to@example.test');
      assert.equal(result.hintCode, 'SENDGRID_UNAUTHORIZED');
      assert.equal(result.message, 'SendGrid API request failed: 401');
    } finally {
      fake.restore();
    }
  });
});

test('account test: a 403 with mail.send keeps the Sender Identity hint', async () => {
  await withKey(async () => {
    const fake = fakeFetch(() => json(200, { scopes: ['mail.send'] }));
    try {
      const manager = await managerWithSendGrid(providerError(403));
      const result = await manager.testAccount('sg1', 'to@example.test');
      assert.equal(result.hintCode, 'SENDGRID_FORBIDDEN');
    } finally {
      fake.restore();
    }
  });
});

test('account test: no follow-up call for other failures; a failing check keeps the old hint', async () => {
  await withKey(async () => {
    const fake = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    try {
      let manager = await managerWithSendGrid(providerError(413));
      let result = await manager.testAccount('sg1', 'to@example.test');
      assert.equal(result.hintCode, 'SENDGRID_PAYLOAD_TOO_LARGE');
      assert.equal(fake.calls.length, 0, 'no /v3/scopes call for a 413');

      manager = await managerWithSendGrid(providerError(401));
      result = await manager.testAccount('sg1', 'to@example.test');
      assert.equal(result.hintCode, 'SENDGRID_UNAUTHORIZED', 'network failure: unchanged hint');
      assert.equal(fake.calls.length, 1);
    } finally {
      fake.restore();
    }
  });
});
