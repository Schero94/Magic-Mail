'use strict';

// Per-locale provider templates (language versions), provider open/click
// tracking for provider-rendered bodies, the Brevo webhook token endpoint
// and the read-only connection check. Fake SendGrid/Mailgun servers on
// 127.0.0.1; synthetic data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createState,
  redirectProviderFetch,
  startFakeProviders,
} = require('./helpers/fake-template-providers');
const { createStrapi } = require('./helpers/provider-template-strapi');
const { canonicalLocale, localeCandidates } = require('../server/src/utils/locale');

let fake;
let state;
let restoreFetch;
let previousKey;

test.before(async () => {
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'q'.repeat(32);
  state = createState();
  fake = await startFakeProviders(state);
  restoreFetch = redirectProviderFetch(fake.port);
});

test.after(async () => {
  restoreFetch();
  await fake.close();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
});

const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');

function reset() {
  const fresh = createState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

function sendgridAccount(documentId) {
  return {
    documentId,
    name: documentId,
    provider: 'sendgrid',
    fromEmail: `noreply@${documentId}.example.test`,
    isActive: true,
    priority: 5,
    config: encryptCredentials({ apiKey: `SG.${documentId}` }),
  };
}

function mailgunAccount(documentId) {
  return {
    documentId,
    name: documentId,
    provider: 'mailgun',
    fromEmail: 'noreply@mg.example.test',
    isActive: true,
    priority: 4,
    config: encryptCredentials({ apiKey: `key-${documentId}`, domain: 'mg.example.test' }),
  };
}

function sgTemplate(id, name, { active = true } = {}) {
  return {
    id,
    name,
    updated_at: '2026-11-10 08:30:00',
    versions: [
      {
        id: `${id}-v1`,
        template_id: id,
        active: active ? 1 : 0,
        name: 'v1',
        subject: `${name} {{name}}`,
        html_content: '<p>Hello {{name}}</p>',
        plain_content: 'Hello {{name}}',
        updated_at: '2026-11-11 09:00:00',
      },
    ],
  };
}

const sendgridSends = () =>
  state.requests
    .filter((r) => r.method === 'POST' && r.path === '/v3/mail/send')
    .map((r) => JSON.parse(r.body.toString('utf8')));

/** Harness with three synced SendGrid templates (default, de, de-AT). */
async function localizedHarness(options = {}) {
  reset();
  state.sendgrid.us = [
    sgTemplate('d-0', 'Welcome'),
    sgTemplate('d-1', 'Welcome DE'),
    sgTemplate('d-2', 'Welcome AT'),
    sgTemplate('d-3', 'Welcome FR'),
  ];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')], ...options });
  await h.service('provider-templates').sync({ force: true });
  return h;
}

// ── Locale helpers ─────────────────────────────────────────────────────────

test('locale tags are canonicalised and fall back from region to language', () => {
  assert.equal(canonicalLocale('de-at'), 'de-AT');
  assert.equal(canonicalLocale('pt_br'), 'pt-BR');
  assert.equal(canonicalLocale(' EN '), 'en');
  assert.equal(canonicalLocale('x'), null);
  assert.equal(canonicalLocale('de-AT-<script>'), null);
  assert.equal(canonicalLocale(42), null);
  assert.equal(canonicalLocale('a'.repeat(40)), null);
  assert.deepEqual(localeCandidates('de-AT'), ['de-AT', 'de']);
  assert.deepEqual(localeCandidates('fr'), ['fr']);
  assert.deepEqual(localeCandidates(''), []);
});

test('locale parsing finishes quickly on adversarial input', () => {
  const started = process.hrtime.bigint();
  for (const input of ['a-'.repeat(25_000), `${'de-'.repeat(20_000)}!`, '_'.repeat(50_000)]) {
    assert.equal(canonicalLocale(input), null);
  }
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 200);
});

// ── Language versions ──────────────────────────────────────────────────────

test('language versions are validated and listed on the default template', async () => {
  const h = await localizedHarness();
  const service = h.service('provider-templates');
  const saved = await service.setLocales('sendgrid:welcome', {
    'DE-at': 'sendgrid:welcome-at',
    de: 'sendgrid:welcome-de',
  });
  assert.deepEqual(saved.locales, [
    { locale: 'de', key: 'sendgrid:welcome-de' },
    { locale: 'de-AT', key: 'sendgrid:welcome-at' },
  ]);
  const overview = await service.overview();
  const base = overview.templates.find((t) => t.key === 'sendgrid:welcome');
  assert.equal(base.locales.length, 2);
  const variant = overview.templates.find((t) => t.key === 'sendgrid:welcome-de');
  assert.equal(variant.localeVariantOf, 'sendgrid:welcome');

  const rejects = async (map, pattern) => {
    await assert.rejects(service.setLocales('sendgrid:welcome', map), (error) => {
      assert.equal(error.name, 'ValidationError');
      assert.match(error.details.locales.join(' '), pattern);
      return true;
    });
  };
  await rejects({ 'not a tag': 'sendgrid:welcome-de' }, /language tag/);
  await rejects({ de: 'sendgrid:unknown' }, /not synced/);
  await rejects({ de: 'sendgrid:welcome' }, /another template/);
  await rejects({ de: 'mailgun:welcome' }, /not synced/);
  // A version can not have versions of its own (no chains).
  await assert.rejects(
    service.setLocales('sendgrid:welcome-de', { fr: 'sendgrid:welcome-fr' }),
    /Invalid language versions/
  );
  await assert.rejects(service.setLocales('sendgrid:nope', {}), /not found/);

  await service.setLocales('sendgrid:welcome', {});
  const cleared = (await service.overview()).templates.find((t) => t.key === 'sendgrid:welcome');
  assert.deepEqual(cleared.locales, []);
});

test('a send picks the exact locale, then the language, then the default template', async () => {
  const h = await localizedHarness();
  await h.service('provider-templates').setLocales('sendgrid:welcome', {
    de: 'sendgrid:welcome-de',
    'de-AT': 'sendgrid:welcome-at',
  });
  const router = h.service('email-router');
  const send = (locale) =>
    router.send({
      to: 'ada@example.test',
      providerTemplate: 'sendgrid:welcome',
      ...(locale === undefined ? {} : { locale }),
      data: { name: 'Ada' },
    });
  await send('de-AT');
  await send('de-CH');
  await send('fr');
  await send(undefined);
  assert.deepEqual(
    sendgridSends().map((body) => body.template_id),
    ['d-2', 'd-1', 'd-0', 'd-0']
  );
  // Variables are the same object for every version.
  assert.ok(
    sendgridSends().every((b) => b.personalizations[0].dynamic_template_data.name === 'Ada')
  );
  // The log keeps the requested key, the sent version and the locale (no values).
  const meta = h.logs.map((entry) => entry.data.metadata.providerTemplate);
  assert.deepEqual(meta[0], {
    key: 'sendgrid:welcome',
    sentKey: 'sendgrid:welcome-at',
    locale: 'de-AT',
    variables: ['name'],
  });
  assert.equal(meta[2].sentKey, undefined);
  await assert.rejects(send('no such tag!'), /language tag/);
});

test('an unusable language version falls back to the next candidate', async () => {
  const h = await localizedHarness();
  await h.service('provider-templates').setLocales('sendgrid:welcome', {
    de: 'sendgrid:welcome-de',
    'de-AT': 'sendgrid:welcome-at',
  });
  // The AT version is deleted at SendGrid.
  state.sendgrid.us = state.sendgrid.us.filter((t) => t.id !== 'd-2');
  await h.service('provider-templates').sync({ force: true });
  await h.service('email-router').send({
    to: 'ada@example.test',
    providerTemplate: 'sendgrid:welcome',
    locale: 'de-AT',
    data: { name: 'Ada' },
  });
  assert.equal(sendgridSends()[0].template_id, 'd-1');
});

test("without a locale, the recipient user's stored locale picks the version", async () => {
  const usersPermissions = { service: () => ({}) };
  const h = await localizedHarness({ usersPermissions });
  await h.service('provider-templates').setLocales('sendgrid:welcome', {
    de: 'sendgrid:welcome-de',
  });
  const lookups = [];
  h.strapi.contentType = (uid) =>
    uid === 'plugin::users-permissions.user'
      ? { attributes: { locale: { type: 'string' } } }
      : null;
  h.strapi.db = {
    query: () => ({
      findOne: async (params) => {
        lookups.push(params);
        return { locale: 'de' };
      },
    }),
  };
  const router = h.service('email-router');
  await router.send({
    to: 'Ada <ADA@example.test>',
    providerTemplate: 'sendgrid:welcome',
    data: { name: 'Ada' },
  });
  assert.equal(sendgridSends()[0].template_id, 'd-1');
  assert.deepEqual(lookups[0], { where: { email: 'ada@example.test' }, select: ['locale'] });

  // Several recipients: no lookup, default template.
  await router.send({
    to: ['a@example.test', 'b@example.test'],
    providerTemplate: 'sendgrid:welcome',
    data: {},
  });
  assert.equal(sendgridSends()[1].template_id, 'd-0');
  assert.equal(lookups.length, 1);

  // No `locale` attribute on the user type: no lookup at all.
  h.strapi.contentType = () => ({ attributes: {} });
  await router.send({ to: 'c@example.test', providerTemplate: 'sendgrid:welcome', data: {} });
  assert.equal(sendgridSends()[2].template_id, 'd-0');
  assert.equal(lookups.length, 1);
});

test('templates without language versions never look up the recipient', async () => {
  const h = await localizedHarness();
  let looked = false;
  h.strapi.contentType = () => {
    looked = true;
    return { attributes: { locale: { type: 'string' } } };
  };
  await h.service('email-router').send({
    to: 'ada@example.test',
    providerTemplate: 'sendgrid:welcome',
    data: {},
  });
  assert.equal(looked, false);
});

test('settings route body: fallback and locales are both optional, unknown keys rejected', () => {
  const { validate } = require('../server/src/validation');
  assert.deepEqual(validate('providerTemplates.settings', { locales: { de: 'sendgrid:x' } }), {
    locales: { de: 'sendgrid:x' },
  });
  assert.deepEqual(validate('providerTemplates.settings', { fallbackTemplateReferenceId: null }), {
    fallbackTemplateReferenceId: null,
  });
  assert.throws(() => validate('providerTemplates.settings', {}), /Validation/);
  assert.throws(
    () => validate('providerTemplates.settings', { locales: { de: 'd-123' } }),
    /Validation/
  );
  const tooMany = Object.fromEntries(
    Array.from({ length: 51 }, (_, i) => [`l${String(i).padStart(2, '0')}`, 'sendgrid:x'])
  );
  assert.throws(() => validate('providerTemplates.settings', { locales: tooMany }), /Validation/);
  assert.throws(
    () => validate('providerTemplates.settings', { locales: {}, other: 1 }),
    /Validation/
  );
});

test('a core mail uses the user locale for the version and meta.locale', async () => {
  const h = await localizedHarness();
  await h.service('provider-templates').setLocales('sendgrid:welcome', {
    de: 'sendgrid:welcome-de',
  });
  await h.service('provider-templates').setCoreDesign('reset-password', {
    providerTemplate: 'sendgrid:welcome',
  });
  h.service('email-router').recipientLocale = async () => 'de';
  const { routeCoreMailToProviderTemplate } = require('../server/src/bootstrap');
  await routeCoreMailToProviderTemplate(
    h.strapi,
    { debug() {}, warn() {} },
    {
      coreEmailType: 'reset-password',
      data: {
        URL: 'https://app.example.test/reset',
        USER: { id: 1, email: 'ada@example.test' },
        TOKEN: 'tok',
      },
    },
    { to: 'ada@example.test', subject: 'Reset', html: '<p>x</p>' },
    async () => {}
  );
  const body = sendgridSends()[0];
  assert.equal(body.template_id, 'd-1');
  assert.equal(body.personalizations[0].dynamic_template_data.meta.locale, 'de');
});

// ── Provider tracking ──────────────────────────────────────────────────────

test('provider tracking is off by default: template sends are unchanged', async () => {
  const h = await localizedHarness();
  await h.service('email-router').send({
    to: 'ada@example.test',
    providerTemplate: 'sendgrid:welcome',
    data: {},
  });
  assert.equal(sendgridSends()[0].tracking_settings, undefined);
  assert.equal(h.logs[0].data.providerTracking, undefined);
});

test('with provider tracking on, SendGrid tracks the template body and the log is flagged', async () => {
  const h = await localizedHarness();
  h.service('plugin-settings').getSettings = async () => ({ providerTracking: true });
  const router = h.service('email-router');
  await router.send({ to: 'ada@example.test', providerTemplate: 'sendgrid:welcome', data: {} });
  assert.deepEqual(sendgridSends()[0].tracking_settings, {
    click_tracking: { enable: true, enable_text: false },
    open_tracking: { enable: true },
  });
  assert.equal(h.logs[0].data.providerTracking, true);
  // A caller that disables tracking keeps it off.
  await router.send({
    to: 'ada@example.test',
    providerTemplate: 'sendgrid:welcome',
    data: {},
    enableTracking: false,
  });
  assert.equal(sendgridSends()[1].tracking_settings, undefined);
  // Normal (non-template) sends are never affected.
  await router.send({ to: 'ada@example.test', subject: 'Plain', text: 'Hello' });
  assert.equal(sendgridSends()[2].tracking_settings, undefined);
});

test('with provider tracking on, Mailgun gets o:tracking-opens=yes and clicks htmlonly', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [
    {
      name: 'welcome',
      id: 'mg-welcome',
      createdAt: 'Mon, 10 Nov 2026 08:30:00 UTC',
      version: {
        tag: 'v1',
        template: '<p>Hi {{name}}</p>',
        engine: 'handlebars',
        createdAt: 'Tue, 11 Nov 2026 09:00:00 UTC',
        active: true,
        id: 'mg-welcome-v1',
        headers: { Subject: 'Welcome' },
      },
    },
  ];
  const h = createStrapi({ accounts: [mailgunAccount('mg1')] });
  h.service('plugin-settings').getSettings = async () => ({ providerTracking: true });
  await h.service('provider-templates').sync({ force: true });
  await h.service('email-router').send({
    to: 'ada@example.test',
    providerTemplate: 'mailgun:welcome',
    data: { name: 'Ada' },
  });
  const send = state.requests.find((r) => r.method === 'POST' && r.path.endsWith('/messages'));
  const text = send.body.toString('utf8');
  const field = (name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(text)?.[1] ?? null;
  assert.equal(field('o:tracking-opens'), 'yes');
  assert.equal(field('o:tracking-clicks'), 'htmlonly');
});

// ── Provider open/click events ─────────────────────────────────────────────

/** Minimal Strapi double for the delivery-webhooks service. */
function webhookStrapi(log) {
  const updates = [];
  const created = [];
  return {
    updates,
    created,
    strapi: {
      log: { debug() {}, info() {}, warn() {}, error() {} },
      eventHub: { emit: async () => {} },
      plugin: () => ({ service: () => ({ getSettings: async () => ({}) }) }),
      db: {
        query: (uid) => ({
          findMany: async ({ where }) =>
            uid.endsWith('email-log') && where.providerMessageId.$in.includes(log.providerMessageId)
              ? [log]
              : [],
          findOne: async ({ where }) => {
            if (uid.endsWith('email-event')) return null;
            if (where.documentId === log.documentId) return log;
            return null;
          },
        }),
      },
      documents: (uid) => ({
        update: async (params) => {
          updates.push({ uid, ...params });
          Object.assign(log, params.data);
        },
        create: async (params) => created.push({ uid, ...params }),
      }),
    },
  };
}

test('provider opens and clicks count only for provider-tracked logs', async () => {
  const service = require('../server/src/services/delivery-webhooks');
  service.__test__.resetSeen();
  const tracked = {
    id: 1,
    documentId: 'log1',
    providerMessageId: 'msg1',
    recipient: 'ada@example.test',
    providerTracking: true,
    openCount: 0,
    clickCount: 0,
  };
  const double = webhookStrapi(tracked);
  const delivery = service({ strapi: double.strapi });
  const opened = await delivery.recordEvent(
    'sendgrid',
    {
      kind: 'opened',
      eventId: 'ev-open-1',
      messageId: 'msg1.filter',
      recipient: 'ada@example.test',
      occurredAt: Date.UTC(2026, 10, 18),
    },
    { accountId: 'acc1' }
  );
  assert.equal(opened, true);
  assert.equal(tracked.openCount, 1);
  assert.ok(tracked.firstOpenedAt);
  // Same provider event again: de-duplicated.
  assert.equal(
    await delivery.recordEvent(
      'sendgrid',
      { kind: 'opened', eventId: 'ev-open-1', messageId: 'msg1', recipient: null },
      { accountId: 'acc1' }
    ),
    false
  );
  const clicked = await delivery.recordEvent(
    'sendgrid',
    {
      kind: 'clicked',
      eventId: 'ev-click-1',
      messageId: 'msg1',
      recipient: 'ada@example.test',
      url: 'https://shop.example.test/item/7?utm=x&session=abc#top',
    },
    { accountId: 'acc1' }
  );
  assert.equal(clicked, true);
  assert.equal(tracked.clickCount, 1);
  const clickEvent = double.created.find((c) => c.data.type === 'click');
  assert.equal(clickEvent.data.linkUrl, 'https://shop.example.test/item/7');
  assert.deepEqual(clickEvent.data.metadata, { provider: 'sendgrid', source: 'provider-tracking' });
  assert.equal(clickEvent.data.ipAddress, undefined);

  // A log Magic Mail tracks itself: provider engagement is ignored (no double count).
  const own = { ...tracked, documentId: 'log2', providerTracking: false, openCount: 0 };
  const other = webhookStrapi(own);
  const ignored = await service({ strapi: other.strapi }).recordEvent(
    'sendgrid',
    { kind: 'opened', eventId: 'ev-open-2', messageId: 'msg1', recipient: null },
    { accountId: 'acc1' }
  );
  assert.equal(ignored, false);
  assert.equal(own.openCount, 0);
  assert.equal(other.created.length, 0);
});

test('clicked URLs keep origin and path only; sensitive and odd links are dropped', () => {
  const { engagementUrl } = require('../server/src/services/delivery-webhooks').__test__;
  assert.equal(engagementUrl('https://a.example.test/p?q=1#f'), 'https://a.example.test/p');
  assert.equal(engagementUrl('https://a.example.test/reset-password?code=abc'), null);
  assert.equal(engagementUrl('javascript:alert(1)'), null);
  assert.equal(engagementUrl('https://user:pw@a.example.test/'), null);
  assert.equal(engagementUrl(42), null);
  assert.equal(engagementUrl(`https://a.example.test/${'x'.repeat(9000)}`), null);
});

test('SendGrid open/click and Mailgun opened/clicked map to engagement kinds', () => {
  const { parseSendGridEvents, parseMailgunEvent } =
    require('../server/src/services/delivery-webhooks').__test__;
  const sg = parseSendGridEvents([
    { event: 'open', sg_event_id: 'e1', sg_message_id: 'm.1', email: 'a@example.test' },
    { event: 'click', sg_event_id: 'e2', sg_message_id: 'm.1', url: 'https://x.example.test/' },
    { event: 'processed', sg_event_id: 'e3', sg_message_id: 'm.1' },
  ]);
  assert.deepEqual(
    sg.map((e) => [e.kind, e.url ?? null]),
    [
      ['opened', null],
      ['clicked', 'https://x.example.test/'],
    ]
  );
  const mg = parseMailgunEvent({ event: 'clicked', id: 'x', url: 'https://y.example.test/' });
  assert.equal(mg[0].kind, 'clicked');
  assert.equal(parseMailgunEvent({ event: 'opened', id: 'y' })[0].kind, 'opened');
});

// ── Brevo webhook token, connection check ──────────────────────────────────

/** Account-manager double with one stored account. */
function accountManagerFor(account) {
  const updates = [];
  const strapi = {
    log: { debug() {}, info() {}, warn() {}, error() {} },
    documents: () => ({
      findOne: async ({ documentId }) => (documentId === account.documentId ? account : null),
      findMany: async () => [],
      update: async ({ documentId, data }) => {
        updates.push({ documentId, data });
        Object.assign(account, data);
        return account;
      },
    }),
  };
  const manager = require('../server/src/services/account-manager')({ strapi });
  return { manager, updates, strapi };
}

test('the Brevo webhook token can be revealed and rotated; other providers refuse', async () => {
  const account = {
    documentId: 'brevo1',
    provider: 'brevo',
    config: encryptCredentials({ apiKey: 'xkeysib-synthetic', webhookToken: 'old-token-value' }),
  };
  const { manager } = accountManagerFor(account);
  const revealed = await manager.webhookToken('brevo1', 'reveal', { id: 1 });
  assert.deepEqual(revealed, { token: 'old-token-value', provider: 'brevo', rotated: false });
  const rotated = await manager.webhookToken('brevo1', 'rotate', { id: 1 });
  assert.equal(rotated.rotated, true);
  assert.notEqual(rotated.token, 'old-token-value');
  assert.match(rotated.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(decryptCredentials(account.config).webhookToken, rotated.token);
  assert.equal(decryptCredentials(account.config).apiKey, 'xkeysib-synthetic');

  const sg = {
    documentId: 'sg1',
    provider: 'sendgrid',
    config: encryptCredentials({ apiKey: 'SG.x' }),
  };
  await assert.rejects(
    accountManagerFor(sg).manager.webhookToken('sg1', 'reveal'),
    /no webhook token/
  );
  await assert.rejects(
    accountManagerFor(sg).manager.webhookToken('missing1', 'reveal'),
    /not found/
  );
});

test('the webhook token route refuses admin API tokens and never logs the token', async () => {
  const account = {
    documentId: 'brevo2',
    provider: 'brevo',
    config: encryptCredentials({ apiKey: 'xkeysib-synthetic', webhookToken: 'secret-token-1' }),
  };
  const { manager, strapi } = accountManagerFor(account);
  const lines = [];
  strapi.log.info = (line) => lines.push(line);
  global.strapi = { plugin: () => ({ service: () => manager }), log: strapi.log };
  try {
    const controller = require('../server/src/controllers/accounts');
    const ctxFor = (strategy) => ({
      params: { accountId: 'brevo2' },
      request: { body: { action: 'reveal' } },
      state: { auth: { strategy: { name: strategy } }, user: { id: 7 } },
      set() {},
    });
    await assert.rejects(controller.webhookToken(ctxFor('admin-token')), (error) => {
      assert.equal(error.name, 'ForbiddenError');
      return true;
    });
    const ctx = ctxFor('admin');
    await controller.webhookToken(ctx);
    assert.deepEqual(ctx.body, { data: { token: 'secret-token-1', rotated: false } });
    await assert.rejects(
      controller.webhookToken({ ...ctxFor('admin'), request: { body: { action: 'export' } } }),
      /Validation/
    );
    assert.ok(lines.some((line) => /AUDIT\] Webhook token revealed for account brevo2/.test(line)));
    assert.ok(lines.every((line) => !line.includes('secret-token-1')));
  } finally {
    delete global.strapi;
  }
});

test('switching an account to Brevo creates its webhook token', async () => {
  const account = {
    documentId: 'acc9',
    provider: 'sendgrid',
    name: 'acc9',
    config: encryptCredentials({ apiKey: 'SG.x' }),
  };
  const { manager } = accountManagerFor(account);
  manager._renameRuleReferences = async () => 0;
  await manager.updateAccount('acc9', {
    provider: 'brevo',
    config: { apiKey: 'xkeysib-new-synthetic-key-0000000000' },
  });
  const stored = decryptCredentials(account.config);
  assert.equal(account.provider, 'brevo');
  assert.match(stored.webhookToken, /^[A-Za-z0-9_-]{43}$/);
});

test('the connection check reports adapter results and refuses other providers', async () => {
  const brevo = {
    documentId: 'brevo3',
    provider: 'brevo',
    config: encryptCredentials({
      apiKey: 'xkeysib-synthetic',
      webhookToken: 'brevo-webhook-token-synthetic-0123456789abcdef',
    }),
  };
  const { manager } = accountManagerFor(brevo);
  const adapter = require('../server/src/providers').getAdapter('brevo');
  const original = adapter.checkConnection;
  try {
    adapter.checkConnection = async () => ({ details: { plan: 'free' } });
    assert.deepEqual(await manager.checkConnection('brevo3'), {
      ok: true,
      provider: 'brevo',
      details: { plan: 'free' },
    });
    adapter.checkConnection = async () => {
      const { ProviderApiError } = require('../server/src/utils/provider-api');
      throw new ProviderApiError('AUTH', 401);
    };
    const failed = await manager.checkConnection('brevo3');
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'AUTH');
    assert.equal(typeof failed.hint, 'string');
  } finally {
    adapter.checkConnection = original;
  }
  const sg = {
    documentId: 'sg2',
    provider: 'sendgrid',
    config: encryptCredentials({ apiKey: 'x' }),
  };
  await assert.rejects(accountManagerFor(sg).manager.checkConnection('sg2'), /no connection check/);
});

test('the test-send route picks the language version from `language`, else the admin language', async () => {
  const h = await localizedHarness();
  await h.service('provider-templates').setLocales('sendgrid:welcome', {
    de: 'sendgrid:welcome-de',
    fr: 'sendgrid:welcome-fr',
  });
  const controller = require('../server/src/controllers/provider-templates')({ strapi: h.strapi });
  const ctxFor = (body, user) => ({
    params: { key: 'sendgrid:welcome' },
    request: { body },
    state: { user },
  });
  await controller.testSend(ctxFor({ to: 'qa@example.test', language: 'de-AT' }, { id: 1 }));
  await controller.testSend(
    ctxFor({ to: 'qa@example.test' }, { id: 1, preferedLanguage: 'fr', email: 'a@example.test' })
  );
  await controller.testSend(ctxFor({ to: 'qa@example.test' }, { id: 1 }));
  assert.deepEqual(
    sendgridSends().map((body) => body.template_id),
    ['d-1', 'd-3', 'd-0']
  );
});
