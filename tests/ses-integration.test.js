'use strict';

// Amazon SES end to end against a fake SES HTTP server (tests/helpers/fake-ses.js)
// that verifies every SigV4 signature and validates every request against the
// Smithy model: sends through the real router, failover on auth errors,
// environment credentials, template sync with paging and provider-template
// sends, the connection check, and SNS-signed delivery webhooks through the
// real delivery-webhooks service. Nothing leaves 127.0.0.1.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FAKE_CREDENTIALS,
  createSesState,
  redirectAwsFetch,
  signSnsMessage,
  startFakeSes,
} = require('./helpers/fake-ses');
const { SES_TEST_CONFIG, accountFor, createHarness } = require('./helpers/provider-send-harness');
const { createStrapi } = require('./helpers/provider-template-strapi');
const { createSelfSignedCertificate } = require('./helpers/test-certificate');
const { clearCertificateCache } = require('../server/src/utils/sns-verify');
const deliveryService = require('../server/src/services/delivery-webhooks');
const bounceMonitorService = require('../server/src/services/bounce-monitor');
const EXAMPLES = require('./fixtures/ses/aws-doc-examples.json');

let fake;
let state;
let restoreFetch;
let previousKey;
const snsRoutes = new Map();
const snsCalls = [];

test.before(async () => {
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 's'.repeat(32);
  state = createSesState();
  fake = await startFakeSes(state);
  restoreFetch = redirectAwsFetch(fake.port, { snsRoutes, snsCalls });
});

test.after(async () => {
  restoreFetch();
  await fake.close();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
});

/** Resets the fake SES data between tests. */
function reset() {
  const fresh = createSesState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

const sends = () =>
  state.requests.filter((r) => r.method === 'POST' && r.path === '/v2/email/outbound-emails');
const assertCleanRequests = () => {
  for (const request of state.requests) {
    assert.equal(request.signatureOk, true, `${request.method} ${request.path} signature`);
    assert.deepEqual(request.contractErrors, [], `${request.method} ${request.path} contract`);
    assert.match(request.host, /^email\.[a-z0-9-]+\.amazonaws\.com$/);
  }
};

const sesAccount = (documentId, config = {}, overrides = {}) => ({
  ...accountFor('ses', config),
  documentId,
  name: documentId,
  ...overrides,
});

// ── Send ───────────────────────────────────────────────────────────────────

test('send: signed, model-valid request; the SES MessageId is returned', async () => {
  reset();
  const account = sesAccount('ses1', { configurationSetName: 'magicmail-events' });
  const { router } = createHarness([account]);
  const result = await router.send({
    to: 'Ada <ada@example.test>',
    cc: 'cc@example.test',
    subject: 'Grüße',
    html: '<p>Hallo</p>',
    text: 'Hallo',
    attachments: [{ filename: 'a.txt', content: 'hello' }],
  });
  assert.equal(result.success, true);
  assert.equal(result.messageId, '0100019a00000001-fake-000000');
  assertCleanRequests();
  const [request] = sends();
  assert.equal(request.host, 'email.eu-west-1.amazonaws.com');
  assert.equal(request.json.ConfigurationSetName, 'magicmail-events');
  assert.deepEqual(request.json.Destination.CcAddresses, ['cc@example.test']);
});

test('send: a wrong secret is a 403 with the signature hint and fails over', async () => {
  reset();
  const broken = sesAccount(
    'ses-bad',
    { secretAccessKey: 'thisIsNotTheRightSecretForTheKey/0000000' },
    { priority: 9 }
  );
  const good = sesAccount('ses-good', { region: 'us-east-1' }, { priority: 1 });
  const { router } = createHarness([broken, good]);
  const result = await router.send({ to: 'a@example.test', subject: 'x', text: 'y' });
  assert.equal(result.accountUsed, 'ses-good');
  assert.deepEqual(
    state.requests.map((r) => [r.host, r.signatureOk]),
    [
      ['email.eu-west-1.amazonaws.com', false],
      ['email.us-east-1.amazonaws.com', true],
    ]
  );
  const error = await router
    .sendViaAccount(broken, { to: 'a@example.test', subject: 'x', text: 'y' })
    .catch((err) => err);
  assert.equal(error.status, 403);
  assert.equal(error.code, 'SES_SIGNATURE_MISMATCH');
  assert.equal(error.providerReason, 'InvalidSignatureException');
});

test('send: an unknown access key gives SES_INVALID_CREDENTIALS', async () => {
  reset();
  const account = sesAccount('ses1', { accessKeyId: 'FAKEUNKNOWNKEYID0001' });
  const { router } = createHarness([account]);
  const error = await router
    .sendViaAccount(account, { to: 'a@example.test', subject: 'x', text: 'y' })
    .catch((err) => err);
  assert.equal(error.code, 'SES_INVALID_CREDENTIALS');
});

test('send: environment credentials with a session token pass the server check', async () => {
  reset();
  state.keys.set('FAKEROLEKEYFORTESTS1', {
    secret: 'fakeRoleSecretForMagicMailTests/abcdef0',
    token: 'FakeSessionTokenForTests==',
  });
  const saved = { ...process.env };
  process.env.AWS_ACCESS_KEY_ID = 'FAKEROLEKEYFORTESTS1';
  process.env.AWS_SECRET_ACCESS_KEY = 'fakeRoleSecretForMagicMailTests/abcdef0';
  process.env.AWS_SESSION_TOKEN = 'FakeSessionTokenForTests==';
  try {
    const account = sesAccount('ses-env', {
      credentialSource: 'environment',
      accessKeyId: '',
      secretAccessKey: '',
    });
    const { router } = createHarness([account]);
    const result = await router.send({ to: 'a@example.test', subject: 'x', text: 'y' });
    assert.equal(result.success, true);
    assertCleanRequests();
  } finally {
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('send: an unknown configuration set is a 404 with the not-found hint', async () => {
  reset();
  const account = sesAccount('ses1', { configurationSetName: 'missing-set' });
  const { router } = createHarness([account]);
  const error = await router
    .sendViaAccount(account, { to: 'a@example.test', subject: 'x', text: 'y' })
    .catch((err) => err);
  assert.equal(error.status, 404);
  assert.equal(error.code, 'SES_NOT_FOUND');
});

// ── Templates ──────────────────────────────────────────────────────────────

const addTemplates = (count) => {
  for (let i = 0; i < count; i += 1) {
    state.templates.set(`bulk-${String(i).padStart(3, '0')}`, {
      Subject: `Subject ${i}`,
      Html: `<p>{{name}} ${i}</p>`,
      Text: `{{name}} ${i}`,
      CreatedTimestamp: 1763460000 + i,
    });
  }
};

test('templates: sync follows NextToken pages and reads every template', async () => {
  reset();
  addTemplates(150);
  state.templates.set('welcome', {
    Subject: 'Hi {{name}}',
    Html: '<h1>Hello {{name}}</h1>{{#each items}}<li>{{label}}</li>{{/each}}',
    Text: 'Hello {{name}}',
    CreatedTimestamp: 1763460000,
  });
  const ses = require('../server/src/providers/ses');
  const config = ses.normalizeConfig(SES_TEST_CONFIG, { creating: true });
  const { templates, warning } = await ses.templates.list(config);
  assert.equal(warning, null);
  assert.equal(templates.length, 151);
  const lists = state.requests.filter((r) => r.path === '/v2/email/templates');
  assert.deepEqual(
    lists.map((r) => r.query.get('PageSize')),
    ['100', '100']
  );
  assert.equal(lists[0].query.get('NextToken'), null);
  assert.ok(lists[1].query.get('NextToken'));
  const welcome = templates.find((t) => t.remoteId === 'welcome');
  assert.deepEqual(
    { ...welcome, activeVersion: welcome.activeVersion.slice(0, 7) },
    {
      remoteId: 'welcome',
      name: 'welcome',
      scope: 'default',
      activeVersion: 'sha256-',
      subject: 'Hi {{name}}',
      html: '<h1>Hello {{name}}</h1>{{#each items}}<li>{{label}}</li>{{/each}}',
      text: 'Hello {{name}}',
      updatedAt: '2025-11-18T10:00:00.000Z',
    }
  );
  assertCleanRequests();

  // Paging with a small page size and a stable hash.
  const again = await ses.templates.list(config, { pageSize: 50 });
  assert.equal(
    again.templates.find((t) => t.remoteId === 'welcome').activeVersion,
    welcome.activeVersion
  );
  state.templates.get('welcome').Html = '<h1>Changed</h1>';
  const changed = await ses.templates.list(config);
  assert.notEqual(
    changed.templates.find((t) => t.remoteId === 'welcome').activeVersion,
    welcome.activeVersion
  );
});

test('templates: throttling and auth failures surface as ProviderApiError codes', async () => {
  reset();
  addTemplates(2);
  const ses = require('../server/src/providers/ses');
  state.failures.push({ status: 400, type: 'ThrottlingException', path: '/v2/email/templates' });
  await assert.rejects(ses.templates.list(SES_TEST_CONFIG), { code: 'RATE_LIMITED' });
  await assert.rejects(
    ses.templates.list({ ...SES_TEST_CONFIG, secretAccessKey: 'wrongwrongwrongwrongwrong' }),
    { code: 'AUTH', status: 403 }
  );
  await assert.rejects(ses.templates.list({ ...SES_TEST_CONFIG, region: 'cn-north-1' }), {
    code: 'CREDENTIALS',
  });
  // A template deleted between list and get is skipped.
  state.failures.push({
    status: 404,
    type: 'NotFoundException',
    path: '/v2/email/templates/bulk-000',
  });
  const { templates } = await ses.templates.list(SES_TEST_CONFIG);
  assert.deepEqual(
    templates.map((t) => t.remoteId),
    ['bulk-001']
  );
});

test('provider template: synced, routed and sent with the same data as TemplateData', async () => {
  reset();
  state.templates.set('welcome', {
    Subject: 'Hi {{name}}',
    Html: '<h1>Hello {{name}}</h1>',
    Text: 'Hello {{name}}',
    CreatedTimestamp: 1763460000,
  });
  const smtp = {
    documentId: 'smtp1',
    name: 'smtp1',
    provider: 'smtp',
    fromEmail: 'noreply@smtp.example.test',
    isActive: true,
    isPrimary: true,
    priority: 100,
    config: require('../server/src/utils/encryption').encryptCredentials({
      host: 'smtp.example.test',
      port: 587,
    }),
  };
  const h = createStrapi({ accounts: [smtp, sesAccount('ses1')] });
  await h.service('provider-templates').sync({ force: true });
  const data = { name: 'Ada <L>', user: { email: 'ada@example.test' }, items: [{ label: 'One' }] };
  const result = await h.service('email-router').send({
    to: 'ada@example.test',
    subject: 'ignored for SES templates',
    providerTemplate: 'ses:welcome',
    data,
  });
  assert.equal(result.success, true);
  assert.equal(result.accountUsed, 'ses1');
  const [request] = sends();
  assert.deepEqual(Object.keys(request.json.Content), ['Template']);
  assert.equal(request.json.Content.Template.TemplateName, 'welcome');
  assert.deepEqual(JSON.parse(request.json.Content.Template.TemplateData), data);
  assert.equal(JSON.stringify(request.json).includes('ignored for SES templates'), false);
  assertCleanRequests();

  // Deleted at SES after the sync: 404, fallback-safe, nothing accepted.
  state.templates.delete('welcome');
  const error = await h
    .service('email-router')
    .send({ to: 'ada@example.test', providerTemplate: 'ses:welcome', data })
    .catch((err) => err);
  assert.equal(error.status, 404);
  assert.equal(error.magicMailFallbackSafe, true);

  // Template data over 262,144 characters is refused before any request.
  state.templates.set('welcome', { Subject: 'Hi', Html: 'x', Text: 'x', CreatedTimestamp: 1 });
  const before = sends().length;
  const big = await h
    .service('email-router')
    .send({
      to: 'ada@example.test',
      providerTemplate: 'ses:welcome',
      data: { blob: 'x'.repeat(262_200) },
    })
    .catch((err) => err);
  assert.equal(big.code, 'MAGIC_MAIL_PROVIDER_TEMPLATE_TOO_LARGE');
  assert.equal(sends().length, before);
});

// ── Connection check ───────────────────────────────────────────────────────

test('connection check: GetAccount details without personal data, and failures with hints', async () => {
  reset();
  const account = sesAccount('ses1', {
    configurationSetName: 'magicmail-events',
    snsTopicArn: 'arn:aws:sns:eu-west-1:123456789012:ses-events',
  });
  const { accountManager } = createHarness([account]);
  const ok = await accountManager.checkConnection('ses1');
  assert.deepEqual(ok, {
    ok: true,
    provider: 'ses',
    details: {
      region: 'eu-west-1',
      sandbox: true,
      sendingEnabled: true,
      sendQuota: { max24HourSend: 200, maxSendRate: 1, sentLast24Hours: 3 },
      configurationSet: 'magicmail-events',
      webhookReady: true,
      hintCode: 'SES_SANDBOX',
    },
  });
  assertCleanRequests();
  state.account.ProductionAccessEnabled = true;
  assert.equal((await accountManager.checkConnection('ses1')).details.hintCode, undefined);

  const wrong = sesAccount('ses2', { secretAccessKey: 'wrongwrongwrongwrongwrong' });
  const { accountManager: manager2 } = createHarness([wrong]);
  const failed = await manager2.checkConnection('ses2');
  assert.deepEqual(failed, {
    ok: false,
    provider: 'ses',
    code: 'SES_SIGNATURE_MISMATCH',
    hintCode: 'SES_SIGNATURE_MISMATCH',
    hint: require('../server/src/providers/ses').HINTS.SES_SIGNATURE_MISMATCH,
  });

  state.failures.push({ status: 403, type: 'AccessDeniedException', path: '/v2/email/account' });
  const denied = await accountManager.checkConnection('ses1');
  assert.equal(denied.code, 'SES_ACCESS_DENIED');
  assert.match(denied.hint, /ses:GetAccount/);

  const env = sesAccount('ses3', {
    credentialSource: 'environment',
    accessKeyId: '',
    secretAccessKey: '',
  });
  const saved = process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_ACCESS_KEY_ID;
  try {
    const { accountManager: manager3 } = createHarness([env]);
    const missing = await manager3.checkConnection('ses3');
    assert.equal(missing.code, 'CREDENTIALS');
    assert.equal(missing.hintCode, 'SES_CREDENTIALS_MISSING');
  } finally {
    if (saved !== undefined) process.env.AWS_ACCESS_KEY_ID = saved;
  }
});

// ── Delivery webhooks ──────────────────────────────────────────────────────

const TOPIC = 'arn:aws:sns:eu-west-1:123456789012:ses-events';
const CERT_URL =
  'https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-0123456789abcdef0123456789abcdef.pem';
const cert = createSelfSignedCertificate();

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && Array.isArray(condition.$in)) {
      return condition.$in.includes(row[key]);
    }
    return row[key] === condition;
  });

/** In-memory Strapi for delivery-webhooks with one SES account. */
function createWebhookHost({ logs = [], settings = {} } = {}) {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const account = {
    documentId: 'acc1',
    provider: 'ses',
    config: encryptCredentials({
      region: 'eu-west-1',
      credentialSource: 'keys',
      ...FAKE_CREDENTIALS,
      snsTopicArn: TOPIC,
    }),
  };
  const tables = {
    'plugin::magic-mail.email-log': logs.map((log, index) => ({
      id: index + 1,
      accountId: 'acc1',
      deliveryStatus: 'sent',
      bounced: false,
      complained: false,
      unsubscribed: false,
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
  const monitor = bounceMonitorService({ strapi });
  const service = deliveryService({ strapi });
  return { service, tables, emitted, strapi };
}

let snsCounter = 0;
/** Signed SNS notification carrying one SES event record. */
function snsBody(record) {
  snsCounter += 1;
  const message = signSnsMessage(
    {
      Type: 'Notification',
      MessageId: `5f3a0000-0000-4000-8000-${String(snsCounter).padStart(12, '0')}`,
      TopicArn: TOPIC,
      Message: JSON.stringify(record),
      Timestamp: new Date().toISOString(),
      SigningCertURL: CERT_URL,
      UnsubscribeURL: `https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=${TOPIC}:x`,
    },
    cert.privateKey
  );
  return Buffer.from(JSON.stringify(message));
}

const withCert = () => {
  clearCertificateCache();
  snsRoutes.set(CERT_URL, () => new Response(cert.pem, { status: 200 }));
};

test('webhook: a signed SES bounce marks the log, records the event and suppresses', async () => {
  withCert();
  deliveryService.__test__.resetSeen?.();
  const messageId = 'EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000';
  const host = createWebhookHost({
    logs: [
      { documentId: 'log1', providerMessageId: messageId, recipient: 'recipient@example.com' },
    ],
    settings: { suppressHardBounces: true },
  });
  const rawBody = snsBody(EXAMPLES.sesEvents.Bounce);
  const headers = { 'x-amz-sns-message-type': 'Notification', 'content-type': 'text/plain' };
  const first = await host.service.handleWebhook({
    provider: 'ses',
    accountId: 'acc1',
    rawBody,
    headers,
  });
  assert.deepEqual(first, { status: 200, processed: 1, unmatched: 0 });
  const log = host.tables['plugin::magic-mail.email-log'][0];
  assert.equal(log.deliveryStatus, 'bounced');
  assert.equal(log.bounceReason, 'SES_BOUNCE_GENERAL');
  assert.equal(log.bounceSource, 'ses');
  assert.equal(host.tables['plugin::magic-mail.suppressed-recipient'].length, 1);
  assert.ok(host.emitted.some((entry) => entry.name === 'magic-mail.delivery.bounced'));

  const replay = await host.service.handleWebhook({
    provider: 'ses',
    accountId: 'acc1',
    rawBody,
    headers,
  });
  assert.deepEqual(replay, { status: 200, processed: 0, unmatched: 0 });
  assert.equal(snsCalls.filter((url) => url === CERT_URL).length, 1, 'certificate cached');
});

test('webhook: magicmail_id tag matches when the message id is unknown; bad requests are 401', async () => {
  withCert();
  const record = JSON.parse(JSON.stringify(EXAMPLES.sesEvents.Delivery));
  record.mail.messageId = 'unknown-000000';
  record.mail.tags.magicmail_id = ['log2'];
  const host = createWebhookHost({
    logs: [{ documentId: 'log2', recipient: 'recipient@example.com' }],
  });
  const result = await host.service.handleWebhook({
    provider: 'ses',
    accountId: 'acc1',
    rawBody: snsBody(record),
    headers: {},
  });
  assert.equal(result.processed, 1);
  assert.ok(host.tables['plugin::magic-mail.email-log'][0].deliveryConfirmedAt);

  const forged = JSON.parse(snsBody(record).toString());
  forged.Message = forged.Message.replace('Delivery', 'Bounce');
  const rejected = await host.service.handleWebhook({
    provider: 'ses',
    accountId: 'acc1',
    rawBody: Buffer.from(JSON.stringify(forged)),
    headers: {},
  });
  assert.equal(rejected.status, 401);
});

test('webhook: opens and clicks count only for provider-tracked logs', async () => {
  withCert();
  const messageId = 'EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000';
  const host = createWebhookHost({
    logs: [
      {
        documentId: 'log3',
        providerMessageId: messageId,
        recipient: 'recipient@example.com',
        providerTracking: true,
        openCount: 0,
        clickCount: 0,
      },
    ],
  });
  for (const record of [EXAMPLES.sesEvents.Open, EXAMPLES.sesEvents.Click]) {
    const result = await host.service.handleWebhook({
      provider: 'ses',
      accountId: 'acc1',
      rawBody: snsBody(record),
      headers: {},
    });
    assert.equal(result.processed, 1);
  }
  const log = host.tables['plugin::magic-mail.email-log'][0];
  assert.equal(log.openCount, 1);
  assert.equal(log.clickCount, 1);
});
