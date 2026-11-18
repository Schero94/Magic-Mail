'use strict';

// Integration tests for the Brevo adapter through the real services: the
// email router (normal and provider-template sends), provider-template sync,
// the account connection check and the delivery webhooks. Every Brevo request
// goes to a fake HTTP server (tests/helpers/fake-brevo.js) that validates it,
// and its own responses, against the pinned official OpenAPI documents.
// Synthetic data only; every other host is blocked.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  brevoTemplate,
  createBrevoState,
  redirectBrevoFetch,
  startFakeBrevo,
} = require('./helpers/fake-brevo');
const { createStrapi } = require('./helpers/provider-template-strapi');
const {
  BREVO_WEBHOOK_TOKEN,
  accountFor,
  createHarness,
} = require('./helpers/provider-send-harness');
const {
  classifyDeliveryError,
  retryLowerBoundMs,
} = require('../server/src/utils/delivery-outcome');
const { toClientSendResult } = require('../server/src/utils/client-errors');

let fake;
let state;
let restoreFetch;
let previousKey;

test.before(async () => {
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'b'.repeat(32);
  state = createBrevoState();
  fake = await startFakeBrevo(state);
  restoreFetch = redirectBrevoFetch(fake.port);
});

test.after(async () => {
  restoreFetch();
  await fake.close();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
});

/** Resets the fake Brevo state between tests. */
function reset() {
  const fresh = createBrevoState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

const sends = () =>
  state.requests.filter((r) => r.method === 'POST' && r.path === '/v3/smtp/email');

/**
 * Brevo account for the provider-template harness.
 *
 * @param {string} documentId
 * @param {object} [overrides]
 * @returns {object}
 */
function brevoAccount(documentId, overrides = {}) {
  return { ...accountFor('brevo'), documentId, name: documentId, ...overrides };
}

// ── normal sends through the router ─────────────────────────────────────────

test('router.send reaches Brevo with a spec-valid body and returns the Brevo message id', async () => {
  reset();
  const { router } = createHarness([accountFor('brevo')]);
  const result = await router.send({
    to: 'Ada <ada@example.test>',
    cc: 'bob@example.test',
    subject: 'Receipt',
    html: '<p>Thanks</p>',
    text: 'Thanks',
    replyTo: 'help@example.test',
    headers: { 'X-Campaign': 'c1', 'X-Sib-Sandbox': 'drop' },
    attachments: [{ filename: 'receipt.pdf', content: 'PDF', contentType: 'application/pdf' }],
  });
  assert.deepEqual(state.violations, []);
  assert.equal(sends().length, 1);
  const request = sends()[0];
  assert.equal(request.apiKey, 'present');
  assert.equal(request.authorization, null, 'the key goes in api-key, never Authorization');
  assert.equal(request.apiKeyValue, 'xkeysib-fake-synthetic-key');
  assert.equal(request.json.headers['X-Sib-Sandbox'], undefined, 'callers can not use sandbox');
  assert.equal(request.json.headers['X-Mailin-custom'], 'magicmail_id=logdoc123');
  assert.deepEqual(request.json.replyTo, { email: 'help@example.test' });
  assert.equal(result.success, true);
  assert.equal(result.messageId, '202611181200.1@smtp-relay.mailin.fr');
});

test('errors 400/401/403/429/5xx: fixed message, status, hint, classification, no body leakage', async () => {
  const cases = [
    {
      status: 400,
      body: { code: 'invalid_parameter', message: 'bad leak@example.test' },
      hint: null,
      cls: 'permanent',
    },
    {
      status: 400,
      body: {
        code: 'invalid_parameter',
        message:
          'Sending has been rejected because the sender you used leak@example.test is not valid. Validate your sender or authenticate your domain',
      },
      hint: 'BREVO_SENDER_NOT_VERIFIED',
      cls: 'permanent',
    },
    {
      status: 400,
      body: { code: 'not_enough_credits', message: 'x leak@example.test' },
      hint: 'BREVO_NO_CREDITS',
      cls: 'permanent',
    },
    {
      status: 401,
      body: { code: 'unauthorized', message: 'Key not found leak@example.test' },
      hint: 'BREVO_INVALID_KEY',
      cls: 'transient',
    },
    {
      status: 401,
      body: {
        code: 'unauthorized',
        message:
          'We have detected you are using an unrecognised IP address 192.0.2.7 leak@example.test',
      },
      hint: 'BREVO_IP_NOT_AUTHORIZED',
      cls: 'transient',
    },
    {
      status: 403,
      body: { code: 'permission_denied', message: 'leak@example.test' },
      hint: 'BREVO_FORBIDDEN',
      cls: 'transient',
    },
    {
      status: 429,
      body: { code: 'too_many_requests', message: 'leak@example.test' },
      headers: { 'x-sib-ratelimit-reset': '30' },
      hint: 'PROVIDER_RATE_LIMITED',
      cls: 'transient',
    },
    {
      status: 500,
      body: { message: 'leak@example.test' },
      hint: 'BREVO_UNAVAILABLE',
      cls: 'ambiguous',
    },
    {
      status: 503,
      body: { message: 'leak@example.test' },
      hint: 'BREVO_UNAVAILABLE',
      cls: 'transient',
    },
  ];
  for (const entry of cases) {
    reset();
    state.failures.push({
      method: 'POST',
      pathPrefix: '/v3/smtp/email',
      status: entry.status,
      body: entry.body,
      headers: entry.headers,
      times: 1,
    });
    const account = accountFor('brevo');
    const { router, logs } = createHarness([account]);
    const error = await router
      .sendViaAccount(account, { to: 'a@example.test', subject: 's', text: 't' })
      .catch((e) => e);
    const label = `${entry.status} ${entry.hint}`;
    assert.equal(error.message, `Brevo API request failed: ${entry.status}`, label);
    assert.equal(error.status, entry.status, label);
    assert.equal(error.provider, 'brevo', label);
    const client = toClientSendResult(error);
    assert.equal(client.hintCode ?? null, entry.hint, label);
    assert.equal(classifyDeliveryError(error), entry.cls, label);
    if (entry.status === 429) {
      assert.equal(error.retryAfterMs, 30_000);
      assert.equal(retryLowerBoundMs(error), 30_000);
    }
    const serialized = JSON.stringify({
      error: { ...error, message: error.message },
      client,
      logs,
    });
    assert.ok(!serialized.includes('leak@example.test'), `${label}: no provider text`);
    assert.ok(!serialized.includes('192.0.2.7'), `${label}: no provider text`);
    assert.ok(!serialized.includes('xkeysib'), `${label}: no key`);
  }
});

test('HTTP 413 maps to MAGIC_MAIL_MESSAGE_TOO_LARGE with the Brevo size hint', async () => {
  reset();
  state.failures.push({ method: 'POST', pathPrefix: '/v3/smtp/email', status: 413, times: 1 });
  const account = accountFor('brevo');
  const { router } = createHarness([account]);
  const error = await router
    .sendViaAccount(account, { to: 'a@example.test', subject: 's', text: 't' })
    .catch((e) => e);
  assert.equal(error.code, 'MAGIC_MAIL_MESSAGE_TOO_LARGE');
  assert.equal(toClientSendResult(error).hintCode, 'BREVO_TOO_LARGE');
});

test('a message of 20 MB or more never reaches Brevo', async () => {
  reset();
  const account = accountFor('brevo');
  const { router } = createHarness([account]);
  const error = await router
    .sendViaAccount(account, {
      to: 'a@example.test',
      subject: 's',
      text: 't',
      attachments: [{ filename: 'big.pdf', content: Buffer.alloc(16 * 1024 * 1024, 1) }],
    })
    .catch((e) => e);
  assert.equal(error.code, 'MAGIC_MAIL_MESSAGE_TOO_LARGE');
  assert.match(error.message, /20 MB/);
  assert.equal(sends().length, 0);
});

test('an account without a usable key fails before any request (failover-safe)', async () => {
  reset();
  for (const config of [{ apiKey: '' }, { apiKey: '********' }]) {
    const account = accountFor('brevo', config);
    const { router } = createHarness([account]);
    const error = await router
      .sendViaAccount(account, { to: 'a@example.test', subject: 's', text: 't' })
      .catch((e) => e);
    assert.equal(error.code, 'MAGIC_MAIL_ACCOUNT_CONFIG');
  }
  assert.equal(state.requests.length, 0);
});

test('a network failure surfaces as a fetch error, never with the key', async () => {
  const account = accountFor('brevo');
  const { router, logs } = createHarness([account]);
  const original = global.fetch;
  global.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  try {
    const error = await router
      .sendViaAccount(account, { to: 'a@example.test', subject: 's', text: 't' })
      .catch((e) => e);
    assert.equal(error.name, 'TypeError');
    assert.ok(!JSON.stringify(logs).includes('xkeysib'));
  } finally {
    global.fetch = original;
  }
});

// ── provider templates ─────────────────────────────────────────────────────

test('template sync pages with limit/offset, keeps inactive templates as unpublished', async () => {
  reset();
  state.templates = [
    ...Array.from({ length: 58 }, (_, i) => brevoTemplate(i + 1, `Template ${i + 1}`)),
    brevoTemplate(100, 'Welcome Email'),
    brevoTemplate(101, 'Draft mail', { isActive: false }),
  ];
  const h = createStrapi({ accounts: [brevoAccount('br1')] });
  const overview = await h.service('provider-templates').sync({ force: true });
  assert.deepEqual(state.violations, []);
  const lists = state.requests.filter((r) => r.path === '/v3/smtp/templates');
  assert.deepEqual(
    lists.map((r) => [r.query.limit, r.query.offset, r.query.sort]),
    [
      ['50', '0', 'asc'],
      ['50', '50', 'asc'],
    ]
  );
  assert.equal(overview.accounts[0].error, null);
  const byKey = Object.fromEntries(overview.templates.map((t) => [t.key, t]));
  assert.equal(overview.templates.length, 60);
  assert.equal(byKey['brevo:welcome-email'].status, 'ok');
  assert.equal(byKey['brevo:draft-mail'].status, 'unpublished');
  assert.equal(byKey['brevo:welcome-email'].updatedAtProvider, '2026-11-11T09:00:00.000Z');
});

test('template sync errors: 401, 429 and 5xx become account error codes', async () => {
  for (const [status, code] of [
    [401, 'AUTH'],
    [429, 'RATE_LIMITED'],
    [502, 'UNAVAILABLE'],
  ]) {
    reset();
    state.failures.push({ method: 'GET', pathPrefix: '/v3/smtp/templates', status, times: 1 });
    const h = createStrapi({ accounts: [brevoAccount('br1')] });
    const overview = await h.service('provider-templates').sync({ force: true });
    assert.equal(overview.accounts[0].error, code, String(status));
    assert.equal(overview.templates.length, 0);
  }
});

test('templates.list stops after 10 pages and warns; 404 is NOT_FOUND', async () => {
  reset();
  state.templates = Array.from({ length: 25 }, (_, i) => brevoTemplate(i + 1, `T${i + 1}`));
  const brevo = require('../server/src/providers/brevo');
  const listed = await brevo.__test__.listTemplates(
    { apiKey: 'xkeysib-fake-synthetic-key' },
    { pageSize: 2 }
  );
  assert.equal(listed.templates.length, 20);
  assert.equal(listed.warning, 'TRUNCATED');
  assert.deepEqual(state.violations, []);
  state.failures.push({ method: 'GET', pathPrefix: '/v3/smtp/templates', status: 404, times: 1 });
  await assert.rejects(
    brevo.templates.list({ apiKey: 'xkeysib-fake-synthetic-key' }),
    (error) => error.name === 'ProviderApiError' && error.code === 'NOT_FOUND'
  );
  await assert.rejects(brevo.templates.list({ apiKey: '********' }), { code: 'CREDENTIALS' });
});

test('provider-template send: templateId + params from data, template subject, spec-valid', async () => {
  reset();
  state.templates = [brevoTemplate(100, 'Welcome Email')];
  const h = createStrapi({ accounts: [brevoAccount('br1')] });
  await h.service('provider-templates').sync({ force: true });
  const detail = await h.service('provider-templates').detail('brevo:welcome-email');
  assert.ok(detail, 'synced template detail');

  await h.service('email-router').send({
    to: 'ada@example.test',
    providerTemplate: 'brevo:welcome-email',
    data: { name: 'Ada', vip: true, when: new Date('2026-11-18T10:00:00Z') },
  });
  assert.deepEqual(state.violations, []);
  const request = sends()[0].json;
  assert.equal(request.templateId, 100);
  assert.deepEqual(request.params, { name: 'Ada', vip: true, when: '2026-11-18T10:00:00.000Z' });
  assert.equal(request.subject, undefined, 'the Brevo template subject applies');
  assert.equal(request.htmlContent, undefined);
  assert.match(request.headers['X-Mailin-custom'], /^magicmail_id=logdoc\d+$/);

  await h.service('email-router').send({
    to: 'ada@example.test',
    subject: 'Explicit',
    providerTemplate: 'brevo:welcome-email',
    data: { name: 'Ada' },
  });
  assert.equal(sends()[1].json.subject, 'Explicit');
});

// ── connection check ───────────────────────────────────────────────────────

test('connection check: GET /v3/account, details without personal data', async () => {
  reset();
  const h = createStrapi({ accounts: [brevoAccount('br1')] });
  const manager = require('../server/src/services/account-manager')({ strapi: h.strapi });
  const result = await manager.checkConnection('br1');
  assert.deepEqual(state.violations, []);
  assert.deepEqual(result, {
    ok: true,
    provider: 'brevo',
    details: {
      transactionalEnabled: true,
      enterprise: false,
      plans: [{ type: 'free', creditsType: 'sendLimit', credits: 300 }],
    },
  });
  const text = JSON.stringify(result);
  for (const personal of [
    'owner@example.test',
    'Synthetic',
    'Street',
    'org-synthetic',
    'smtp-relay',
  ]) {
    assert.ok(!text.includes(personal), `no ${personal}`);
  }
});

test('connection check failures map to codes and hints (401 key, 401 IP, 403, 429, 5xx)', async () => {
  const cases = [
    [401, { code: 'unauthorized', message: 'Key not found' }, 'AUTH', 'BREVO_INVALID_KEY'],
    [
      401,
      {
        code: 'unauthorized',
        message: 'We have detected you are using an unrecognised IP address 192.0.2.7',
      },
      'BREVO_IP_NOT_AUTHORIZED',
      'BREVO_IP_NOT_AUTHORIZED',
    ],
    [403, { code: 'permission_denied', message: 'no' }, 'BREVO_FORBIDDEN', 'BREVO_FORBIDDEN'],
    [429, { message: 'slow down' }, 'RATE_LIMITED', 'BREVO_RATE_LIMITED'],
    [500, { message: 'oops' }, 'UNAVAILABLE', 'BREVO_UNAVAILABLE'],
  ];
  for (const [status, body, code, hintCode] of cases) {
    reset();
    state.failures.push({ method: 'GET', pathPrefix: '/v3/account', status, body, times: 1 });
    const h = createStrapi({ accounts: [brevoAccount('br1')] });
    const manager = require('../server/src/services/account-manager')({ strapi: h.strapi });
    const result = await manager.checkConnection('br1');
    assert.equal(result.ok, false);
    assert.equal(result.code, code, String(status));
    assert.equal(result.hintCode, hintCode, String(status));
    assert.equal(typeof result.hint, 'string');
    assert.ok(!JSON.stringify(result).includes('192.0.2.7'));
  }
});

test('connection check with an unreadable or missing key is CREDENTIALS without a request', async () => {
  reset();
  const h = createStrapi({
    accounts: [brevoAccount('br1', { config: accountFor('brevo', { apiKey: '' }).config })],
  });
  const manager = require('../server/src/services/account-manager')({ strapi: h.strapi });
  const result = await manager.checkConnection('br1');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CREDENTIALS');
  assert.equal(state.requests.length, 0);
});

// ── account create/update through account-manager ──────────────────────────

test('account create stores a generated webhook token; update keeps masked secrets', async () => {
  reset();
  const h = createStrapi({ accounts: [] });
  const manager = require('../server/src/services/account-manager')({ strapi: h.strapi });
  const { decryptCredentials } = require('../server/src/utils/encryption');
  const created = await manager.createAccount({
    name: 'Brevo',
    provider: 'brevo',
    fromEmail: 'noreply@brevo.example.test',
    config: { apiKey: ' xkeysib-created-synthetic-key ', region: 'eu' },
  });
  const row = h.tables['plugin::magic-mail.email-account'].find(
    (r) => r.documentId === created.documentId
  );
  const stored = decryptCredentials(row.config);
  assert.equal(stored.apiKey, 'xkeysib-created-synthetic-key');
  assert.match(stored.webhookToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(stored.region, undefined, 'unknown keys are dropped');

  await manager.updateAccount(created.documentId, {
    config: { apiKey: '********', webhookToken: '********' },
  });
  const after = decryptCredentials(
    h.tables['plugin::magic-mail.email-account'].find((r) => r.documentId === created.documentId)
      .config
  );
  assert.deepEqual(after, stored, 'masks keep the stored secrets');

  await assert.rejects(
    manager.createAccount({
      name: 'Brevo 2',
      provider: 'brevo',
      fromEmail: 'noreply@brevo.example.test',
      config: { apiKey: '' },
    }),
    (error) => error.name === 'ValidationError'
  );
});

// ── delivery webhooks through the real service ─────────────────────────────

const deliveryService = require('../server/src/services/delivery-webhooks');
const EVENTS = require('./fixtures/webhooks/brevo-events.json');

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && Array.isArray(condition.$in)) {
      return condition.$in.includes(row[key]);
    }
    return row[key] === condition;
  });

/**
 * In-memory Strapi double for the delivery-webhooks service with one Brevo
 * account and the given email logs.
 *
 * @param {object[]} logs
 * @param {object} [settings]
 * @returns {object}
 */
function webhookHost(logs, settings = {}) {
  const account = { ...accountFor('brevo'), documentId: 'acc1' };
  const tables = {
    'plugin::magic-mail.email-log': logs.map((log, index) => ({
      id: index + 1,
      accountId: 'acc1',
      deliveryStatus: 'sent',
      deliveredAt: new Date('2026-01-01T00:00:00Z'),
      bounced: false,
      complained: false,
      unsubscribed: false,
      openCount: 0,
      clickCount: 0,
      ...log,
    })),
    'plugin::magic-mail.email-event': [],
    'plugin::magic-mail.suppressed-recipient': [],
  };
  const emitted = [];
  let nextId = 1000;
  const strapi = {
    log: { debug() {}, info() {}, warn() {}, error() {} },
    config: { get: (_key, fallback) => fallback },
    eventHub: { emit: async (name, payload) => emitted.push({ name, payload }) },
    documents(uid) {
      return {
        findOne: async ({ documentId }) =>
          uid.endsWith('email-account') && documentId === account.documentId ? account : null,
        update: async ({ documentId, data }) => {
          const row = tables[uid].find((r) => r.documentId === documentId);
          Object.assign(row, data);
          return row;
        },
        create: async ({ data }) => {
          const row = { id: (nextId += 1), ...data };
          tables[uid].push(row);
          return row;
        },
      };
    },
    db: {
      query(uid) {
        const rows = () => tables[uid];
        return {
          findOne: async ({ where }) => rows().find((row) => matches(row, where)) || null,
          findMany: async ({ where }) => rows().filter((row) => matches(row, where)),
          update: async ({ where, data }) => {
            const row = rows().find((r) => matches(r, where));
            Object.assign(row, data);
            return row;
          },
          create: async ({ data }) => {
            const row = { id: (nextId += 1), documentId: `doc${nextId}`, ...data };
            rows().push(row);
            return row;
          },
          count: async ({ where } = {}) => rows().filter((row) => matches(row, where)).length,
        };
      },
    },
    plugin: () => ({
      service: (name) => {
        if (name === 'plugin-settings') return { getSettings: async () => settings };
        if (name === 'bounce-monitor') return monitor;
        throw new Error(`unexpected service ${name}`);
      },
    }),
  };
  const monitor = require('../server/src/services/bounce-monitor')({ strapi });
  const service = deliveryService({ strapi });
  return {
    service,
    emitted,
    log: (id = 'log1') => tables['plugin::magic-mail.email-log'].find((r) => r.documentId === id),
    events: () => tables['plugin::magic-mail.email-event'],
    suppressed: () => tables['plugin::magic-mail.suppressed-recipient'],
  };
}

const MESSAGE_ID = '201798300811.5787683@relay.example.test';
const brevoLog = (extra = {}) => ({
  documentId: 'log1',
  providerMessageId: MESSAGE_ID,
  recipient: 'recipient@example.test',
  ...extra,
});
const post = (host, payload, headers = { authorization: `Bearer ${BREVO_WEBHOOK_TOKEN}` }) =>
  host.service.handleWebhook({
    provider: 'brevo',
    accountId: 'acc1',
    rawBody: Buffer.from(JSON.stringify(payload)),
    headers,
  });

test('webhook: hard bounce marks the log bounced and feeds suppression when enabled', async () => {
  deliveryService.__test__.resetSeen();
  const host = webhookHost([brevoLog()], { suppressHardBounces: true });
  const result = await post(host, EVENTS['Hard bounced']);
  assert.deepEqual(result, { status: 200, processed: 1, unmatched: 0 });
  assert.equal(host.log().deliveryStatus, 'bounced');
  assert.equal(host.log().bounceReason, 'BREVO_HARD_BOUNCE');
  assert.equal(host.suppressed().length, 1);
  assert.deepEqual(
    host.emitted.map((e) => e.name),
    ['magic-mail.delivery.bounced']
  );
});

test('webhook: a replayed request is acknowledged without work; an identical event once', async () => {
  deliveryService.__test__.resetSeen();
  const host = webhookHost([brevoLog()]);
  assert.equal((await post(host, EVENTS.Delivered)).processed, 1);
  assert.deepEqual(await post(host, EVENTS.Delivered), { status: 200, processed: 0, unmatched: 0 });
  // The same event inside another batch body: de-duplicated by event id.
  const again = await post(host, [EVENTS.Delivered, EVENTS.Sent]);
  assert.equal(again.processed, 0);
  assert.equal(host.events().length, 1);
});

test('webhook: correlation by X-Mailin-custom when the message id is unknown', async () => {
  deliveryService.__test__.resetSeen();
  const host = webhookHost([brevoLog({ providerMessageId: 'other@relay.example.test' })]);
  const result = await post(host, { ...EVENTS.Spam, 'X-Mailin-custom': 'magicmail_id=log1' });
  assert.equal(result.processed, 1);
  assert.equal(host.log().complained, true);
});

test('webhook: wrong or missing token is 401 and changes nothing', async () => {
  deliveryService.__test__.resetSeen();
  const host = webhookHost([brevoLog()]);
  for (const headers of [{}, { authorization: 'Bearer wrong-token-value-0000000000000000' }]) {
    const result = await post(host, EVENTS['Hard bounced'], headers);
    assert.equal(result.status, 401);
  }
  assert.equal(host.log().deliveryStatus, 'sent');
});

test('webhook: opens and clicks count only for provider-tracked logs', async () => {
  deliveryService.__test__.resetSeen();
  const tracked = webhookHost([brevoLog({ providerTracking: true })]);
  await post(tracked, [EVENTS.Opened, EVENTS['First opening'], EVENTS.Clicked]);
  assert.equal(tracked.log().openCount, 1, 'unique_opened is not counted twice');
  assert.equal(tracked.log().clickCount, 1);
  const click = tracked.events().find((e) => e.type === 'click');
  assert.equal(click.linkUrl, 'https://shop.example.test/product');

  deliveryService.__test__.resetSeen();
  const untracked = webhookHost([brevoLog()]);
  await post(untracked, [EVENTS.Opened, EVENTS.Clicked]);
  assert.equal(untracked.log().openCount, 0);
  assert.equal(untracked.events().length, 0);
});
