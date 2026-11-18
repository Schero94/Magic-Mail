'use strict';

// Golden regression tests: the exact provider payloads Magic Mail produces
// today for local-template sends (SendGrid, Mailgun, SMTP/nodemailer) and for
// native Strapi core-mail sends (users-permissions password reset routed
// through the email provider wrapper).
//
// The fixtures in tests/fixtures/golden/ were recorded from 4.5.0 (commit
// d8dd2ea) BEFORE provider templates were added, then re-recorded once on top
// of the SendGrid/Mailgun send-path changes (#23), which add only
// custom_args.magicmail_id, SendGrid tracking_settings, Mailgun
// o:tracking-opens/o:tracking-clicks, v:magicmail_email_type,
// v:magicmail_priority, v:magicmail_id and o:tag. They must stay
// byte-identical: a change here means an existing send changed. To re-record deliberately (a
// reviewed, intended change only) run: GOLDEN_WRITE=1 node --test tests/golden-send-payloads.test.js
//
// Synthetic data only; every provider call goes to a fake fetch or a fake
// nodemailer transport.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTER_PATH = '../server/src/services/email-router';
const DESIGNER_PATH = '../server/src/services/email-designer';
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'golden');
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

const FIXED_NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

/**
 * Replaces values that legitimately change per run (random Message-ID local
 * parts, timestamps) with stable markers. Everything else is compared as is.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function normalize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/\b[a-f0-9]{24}\b/g, '<MSGID-LOCAL>')
      .replace(/magicmail-\d{10,}/g, 'magicmail-<NOW>');
  }
  if (value instanceof Date) return '<DATE>';
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

/**
 * Compares a captured payload with its fixture (or records it with GOLDEN_WRITE=1).
 *
 * @param {string} name - Fixture file name without extension
 * @param {unknown} actual - Captured payload
 */
function assertGolden(name, actual) {
  const file = path.join(FIXTURE_DIR, `${name}.json`);
  const normalized = JSON.parse(JSON.stringify(normalize(actual)));
  if (process.env.GOLDEN_WRITE === '1') {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
    return;
  }
  assert.ok(fs.existsSync(file), `Golden fixture ${name}.json is missing`);
  const expected = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(normalized, expected, `Provider payload for ${name} changed`);
}

function withEncryptionKey() {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'g'.repeat(32);
  return () => {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  };
}

/** A local designer template with variables, a section and raw HTML. */
const LOCAL_TEMPLATE = {
  documentId: 'tpl-golden',
  templateReferenceId: 4242,
  name: 'Golden welcome',
  subject: 'Welcome {{name}} & friends',
  bodyHtml:
    '<html><body><h1>Hello {{name}}</h1><p>{{user.email}}</p>{{#items}}<li>{{label}}</li>{{/items}}{{^items}}<p>No items</p>{{/items}}<div>{{{html}}}</div><a href="https://shop.example.test/a?x=1">Shop</a></body></html>',
  bodyText: '',
  category: 'transactional',
  isActive: true,
};

const TEMPLATE_DATA = {
  name: 'Ada <Lovelace>',
  user: { email: 'ada@example.test' },
  items: [{ label: 'One' }, { label: 'Two & three' }],
  html: '<strong>raw</strong>',
};

function accountFor(provider) {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const base = {
    documentId: `acc-${provider}`,
    name: `golden-${provider}`,
    provider,
    fromEmail: `noreply@${provider}.example.test`,
    fromName: 'Golden Sender',
    isActive: true,
    isPrimary: true,
    priority: 5,
  };
  if (provider === 'sendgrid')
    return { ...base, config: encryptCredentials({ apiKey: 'SG.fake' }) };
  if (provider === 'mailgun') {
    return {
      ...base,
      config: encryptCredentials({ apiKey: 'key-fake', domain: 'mg.example.test', region: 'eu' }),
    };
  }
  return {
    ...base,
    config: encryptCredentials({ host: 'smtp.example.test', port: 587, user: 'u', pass: 'p' }),
  };
}

/**
 * Fake strapi with the real email-designer service (Mustache rendering),
 * fake analytics (deterministic tracking) and in-memory accounts.
 */
function createHarness(accounts, { emailPlugin = null } = {}) {
  const logs = [];
  const services = {};
  const strapi = {
    log: quietLog,
    config: { get: (key, fallback) => fallback },
    magicMail: {},
    plugin(name) {
      if (name === 'email') return emailPlugin;
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
    createEmailLog: async (data) => {
      // Alphanumeric like a real Strapi documentId: the send path only sends
      // ids matching /^[A-Za-z0-9]{1,64}$/ as magicmail_id.
      const entry = { documentId: `golddoc${logs.length + 1}`, emailId: 'emailgolden1', data };
      logs.push(entry);
      return entry;
    },
    updateEmailLog: async () => {},
    generateRecipientHash: () => 'hash',
    injectTrackingPixel: (html, emailId) =>
      `${html}<img src="https://track.example.test/api/magic-mail/track/open/${emailId}">`,
    rewriteLinksForTracking: async (html) =>
      html.replace('https://shop.example.test/a?x=1', 'https://track.example.test/c/1'),
    buildSystemMergeTags: () => ({
      date: '2026-11-16',
      year: '2026',
      unsubscribe: '',
      webview: '',
    }),
  };
  delete require.cache[require.resolve(DESIGNER_PATH)];
  const designer = require(DESIGNER_PATH)({ strapi });
  designer.findByReferenceId = async (id) =>
    String(id) === String(LOCAL_TEMPLATE.templateReferenceId) ? { ...LOCAL_TEMPLATE } : null;
  services['email-designer'] = designer;
  delete require.cache[require.resolve(ROUTER_PATH)];
  const router = require(ROUTER_PATH)({ strapi });
  router.updateAccountStats = async () => {};
  router.reserveQuota = async () => 'unlimited';
  router.releaseQuota = async () => {};
  router.markLog = async () => {};
  router.queueService = () => null;
  services['email-router'] = router;
  return { router, strapi, logs };
}

/** Records fetch calls; returns provider-shaped success responses. */
function captureFetch() {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    let body = opts.body;
    if (body instanceof FormData) {
      const entries = [];
      for (const [key, value] of body.entries()) {
        entries.push([
          key,
          typeof value === 'string' ? value : { blob: value.type, size: value.size },
        ]);
      }
      body = { formData: entries };
    } else if (typeof body === 'string') {
      body = { json: JSON.parse(body) };
    }
    const headers = { ...(opts.headers || {}) };
    if (headers.Authorization) headers.Authorization = '<redacted>';
    calls.push({ url: String(url), method: opts.method, headers, body });
    return {
      ok: true,
      status: 202,
      headers: { get: () => 'golden-provider-id' },
      json: async () => ({ id: '<golden@mg.example.test>', message: 'Queued' }),
    };
  };
  return { calls, restore: () => (global.fetch = original) };
}

function captureNodemailer() {
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  const calls = [];
  nodemailer.createTransport = (config) => ({
    sendMail: async (options) => {
      const { logger, ...transportConfig } = config;
      calls.push({ transport: { ...transportConfig, logger: Boolean(logger) }, options });
      return { messageId: '<golden-smtp@smtp.example.test>', response: '250 OK' };
    },
  });
  return { calls, restore: () => (nodemailer.createTransport = original) };
}

function freezeTime() {
  const RealDate = Date;
  const realNow = Date.now;
  Date.now = () => FIXED_NOW;
  return () => {
    Date.now = realNow;
    global.Date = RealDate;
  };
}

const LOCAL_SEND = () => ({
  to: 'Ada@Example.test',
  templateReferenceId: LOCAL_TEMPLATE.templateReferenceId,
  templateData: TEMPLATE_DATA,
  replyTo: 'support@example.test',
  headers: { 'X-Campaign': 'golden' },
});

for (const provider of ['sendgrid', 'mailgun']) {
  test(`golden: local template send through ${provider}`, async () => {
    const restoreKey = withEncryptionKey();
    const restoreTime = freezeTime();
    const fetchCapture = captureFetch();
    try {
      const { router, logs } = createHarness([accountFor(provider)]);
      const result = await router.send(LOCAL_SEND());
      assert.equal(result.success, true);
      assert.equal(fetchCapture.calls.length, 1);
      assertGolden(`local-${provider}`, {
        request: fetchCapture.calls[0],
        log: logs[0].data,
      });
    } finally {
      fetchCapture.restore();
      restoreTime();
      restoreKey();
    }
  });

  test(`golden: local template send through ${provider} without tracking`, async () => {
    const restoreKey = withEncryptionKey();
    const restoreTime = freezeTime();
    const fetchCapture = captureFetch();
    try {
      const { router } = createHarness([accountFor(provider)]);
      await router.send({
        ...LOCAL_SEND(),
        enableTracking: false,
        type: 'marketing',
        priority: 'high',
        unsubscribeUrl: 'https://example.test/unsub',
      });
      assertGolden(`local-${provider}-untracked`, fetchCapture.calls[0]);
    } finally {
      fetchCapture.restore();
      restoreTime();
      restoreKey();
    }
  });
}

test('golden: local template send through SMTP (nodemailer)', async () => {
  const restoreKey = withEncryptionKey();
  const restoreTime = freezeTime();
  const smtp = captureNodemailer();
  try {
    const { router } = createHarness([accountFor('smtp')]);
    const result = await router.send(LOCAL_SEND());
    assert.equal(result.success, true);
    assert.equal(smtp.calls.length, 1);
    assertGolden('local-smtp', smtp.calls[0]);
  } finally {
    smtp.restore();
    restoreTime();
    restoreKey();
  }
});

test('golden: plain html send (no template) through SendGrid', async () => {
  const restoreKey = withEncryptionKey();
  const restoreTime = freezeTime();
  const fetchCapture = captureFetch();
  try {
    const { router } = createHarness([accountFor('sendgrid')]);
    await router.send({
      to: ['a@example.test', 'b@example.test'],
      cc: 'c@example.test',
      subject: 'Plain',
      html: '<p>Plain body</p>',
      text: 'Plain body',
    });
    assertGolden('plain-sendgrid', fetchCapture.calls[0]);
  } finally {
    fetchCapture.restore();
    restoreTime();
    restoreKey();
  }
});

/** The mail users-permissions 5.62 builds in forgotPassword (controllers/auth.js). */
const CORE_RESET_MAIL = () => ({
  to: 'user@example.test',
  from: 'Strapi Admin <noreply@sendgrid.example.test>',
  replyTo: 'support@example.test',
  subject: 'Reset password',
  text: '<p>We heard that you lost your password.</p><p>https://app.example.test/reset?code=0123456789abcdef</p>',
  html: '<p>We heard that you lost your password.</p><p>https://app.example.test/reset?code=0123456789abcdef</p>',
});

for (const provider of ['sendgrid', 'mailgun', 'smtp']) {
  test(`golden: core password-reset mail routed through ${provider}`, async () => {
    const restoreKey = withEncryptionKey();
    const restoreTime = freezeTime();
    const fetchCapture = captureFetch();
    const smtp = captureNodemailer();
    const {
      installEmailInterception,
      uninstallEmailInterception,
    } = require('../server/src/bootstrap');
    const originalSends = [];
    const provider_ = {
      send: async (options) => {
        originalSends.push(options);
        return { messageId: 'native' };
      },
    };
    const emailService = {
      send: (options) => provider_.send(options),
      sendTemplatedEmail: (options) => provider_.send(options),
    };
    const emailPlugin = { provider: provider_, service: () => emailService };
    const { strapi } = createHarness([accountFor(provider)], { emailPlugin });
    try {
      assert.equal(installEmailInterception(strapi, quietLog), true);
      await emailService.send(CORE_RESET_MAIL());
      assert.equal(originalSends.length, 0, 'the native provider must not send');
      const captured = provider === 'smtp' ? smtp.calls[0] : fetchCapture.calls[0];
      assert.ok(captured, 'the Magic Mail account must send');
      assertGolden(`core-reset-${provider}`, captured);
    } finally {
      uninstallEmailInterception(strapi);
      smtp.restore();
      fetchCapture.restore();
      restoreTime();
      restoreKey();
    }
  });
}
