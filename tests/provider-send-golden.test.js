'use strict';

// Golden regression tests for normal (non-template) sends through SendGrid,
// Mailgun and SMTP. The fixtures in tests/fixtures/send-golden/ were recorded
// from Magic Mail 4.5.1 (main c457477) BEFORE the provider send-path fixes.
//
// Only the fields listed in ADDED_FIELDS may differ from the recording; they
// are the deliberate additions of the send-path fixes (correlation id,
// provider tracking switched off where Magic Mail tracks, Mailgun metadata).
// Everything else must stay byte-identical, so a normal send keeps its
// recipients, content, headers, attachments and order.
//
// To re-record deliberately (a reviewed, intended change only) run:
//   GOLDEN_WRITE=1 node --test tests/provider-send-golden.test.js
//
// Synthetic data only; every provider call goes to a fake fetch or a fake
// nodemailer transport.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTER_PATH = '../server/src/services/email-router';
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'send-golden');
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/** 1x1 transparent PNG (synthetic inline image). */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Fields the send-path fixes add on purpose. They are removed from the
 * current output before it is compared with the 4.5.1 recording.
 */
const ADDED_FIELDS = {
  sendgridJson: ['custom_args.magicmail_id', 'tracking_settings'],
  mailgunForm: [
    'o:tracking-opens',
    'o:tracking-clicks',
    'o:tag',
    'v:magicmail_email_type',
    'v:magicmail_priority',
    'v:magicmail_id',
  ],
};

/**
 * Replaces values that legitimately change per run (random Message-ID local
 * parts) with stable markers. Everything else is compared as is.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function normalize(value) {
  if (typeof value === 'string')
    return value
      .replace(/\b[a-f0-9]{24}\b/g, '<MSGID-LOCAL>')
      .replace(/magicmail-\d{10,}/g, 'magicmail-<NOW>');
  if (value instanceof Date) return '<DATE>';
  if (Buffer.isBuffer(value)) return { buffer: value.toString('base64') };
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

/**
 * Removes the deliberately added fields from a captured request.
 *
 * @param {any} captured - Normalised capture
 * @returns {any} A copy without ADDED_FIELDS
 */
function withoutAddedFields(captured) {
  const copy = JSON.parse(JSON.stringify(captured));
  const json = copy?.body?.json;
  if (json) {
    for (const field of ADDED_FIELDS.sendgridJson) {
      const [head, tail] = field.split('.');
      if (tail) {
        if (json[head]) delete json[head][tail];
      } else delete json[head];
    }
  }
  if (copy?.body?.formData) {
    copy.body.formData = copy.body.formData.filter(
      ([name]) => !ADDED_FIELDS.mailgunForm.includes(name)
    );
  }
  return copy;
}

/**
 * Compares a capture with its fixture (or records it with GOLDEN_WRITE=1).
 *
 * @param {string} name - Fixture file name without extension
 * @param {unknown} actual - Captured request
 * @returns {any} The normalised capture (with the added fields)
 */
function assertGolden(name, actual) {
  const file = path.join(FIXTURE_DIR, `${name}.json`);
  const normalized = JSON.parse(JSON.stringify(normalize(actual)));
  if (process.env.GOLDEN_WRITE === '1') {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
    return normalized;
  }
  assert.ok(fs.existsSync(file), `Golden fixture ${name}.json is missing`);
  const expected = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(
    withoutAddedFields(normalized),
    expected,
    `Provider payload for ${name} changed`
  );
  return normalized;
}

function withEncryptionKey() {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'g'.repeat(32);
  return () => {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  };
}

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
  if (provider === 'sendgrid') {
    return { ...base, config: encryptCredentials({ apiKey: 'SG.fake' }) };
  }
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

/** Fake strapi with deterministic tracking and in-memory accounts. */
function createHarness(accounts) {
  const services = {};
  const strapi = {
    log: quietLog,
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
    createEmailLog: async () => ({ documentId: 'goldenlog1', emailId: 'emailgolden1' }),
    updateEmailLog: async () => {},
    generateRecipientHash: () => 'hash',
    injectTrackingPixel: (html, emailId) =>
      `${html}<img src="https://track.example.test/api/magic-mail/track/open/${emailId}">`,
    rewriteLinksForTracking: async (html) =>
      html.replace('https://shop.example.test/a?x=1', 'https://track.example.test/c/1'),
  };
  delete require.cache[require.resolve(ROUTER_PATH)];
  const router = require(ROUTER_PATH)({ strapi });
  router.updateAccountStats = async () => {};
  router.reserveQuota = async () => 'unlimited';
  router.releaseQuota = async () => {};
  router.markLog = async () => {};
  router.queueService = () => null;
  services['email-router'] = router;
  return { router };
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
          typeof value === 'string'
            ? value
            : {
                blob: value.type,
                size: value.size,
                filename: value.name,
                base64: Buffer.from(await value.arrayBuffer()).toString('base64'),
              },
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
      headers: { get: (name) => (name.toLowerCase() === 'x-message-id' ? 'golden-sg-id' : null) },
      json: async () => ({ id: '<golden@mg.example.test>', message: 'Queued. Thank you.' }),
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

/** A normal send with every common field (no duplicates, no display names). */
const NORMAL_SEND = () => ({
  to: ['Ada@Example.test', 'bob@example.test'],
  cc: 'carol@example.test',
  bcc: ['dave@example.test'],
  subject: 'Golden order 42',
  html: '<p>Hello</p><a href="https://shop.example.test/a?x=1">Shop</a><img src="cid:logo">',
  text: 'Hello\nShop https://shop.example.test/a?x=1',
  replyTo: 'support@example.test',
  headers: { 'X-Campaign': 'golden', 'List-Id': '<news.example.test>' },
  attachments: [
    { filename: 'receipt.txt', content: 'receipt body', contentType: 'text/plain' },
    { cid: 'logo', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
  ],
});

const UNTRACKED_MARKETING = () => ({
  ...NORMAL_SEND(),
  enableTracking: false,
  type: 'marketing',
  priority: 'high',
  unsubscribeUrl: 'https://example.test/unsub',
});

for (const provider of ['sendgrid', 'mailgun']) {
  test(`golden: normal tracked send through ${provider}`, async () => {
    const restoreKey = withEncryptionKey();
    const fetchCapture = captureFetch();
    try {
      const { router } = createHarness([accountFor(provider)]);
      const result = await router.send(NORMAL_SEND());
      assert.equal(result.success, true);
      assert.equal(fetchCapture.calls.length, 1);
      assertGolden(`${provider}-tracked`, fetchCapture.calls[0]);
    } finally {
      fetchCapture.restore();
      restoreKey();
    }
  });

  test(`golden: untracked marketing send through ${provider}`, async () => {
    const restoreKey = withEncryptionKey();
    const fetchCapture = captureFetch();
    try {
      const { router } = createHarness([accountFor(provider)]);
      await router.send(UNTRACKED_MARKETING());
      assert.equal(fetchCapture.calls.length, 1);
      assertGolden(`${provider}-untracked-marketing`, fetchCapture.calls[0]);
    } finally {
      fetchCapture.restore();
      restoreKey();
    }
  });
}

test('golden: direct adapter call (no delivery log) through SendGrid is unchanged', async () => {
  const restoreKey = withEncryptionKey();
  const fetchCapture = captureFetch();
  try {
    const { router } = createHarness([]);
    await router.sendViaSendGrid(accountFor('sendgrid'), {
      to: 'ada@example.test',
      subject: 'Direct',
      text: 'Direct body',
    });
    const captured = assertGolden('sendgrid-direct', fetchCapture.calls[0]);
    // No log id and no Magic Mail tracking: nothing is added at all.
    assert.equal(captured.body.json.custom_args.magicmail_id, undefined);
    assert.equal(captured.body.json.tracking_settings, undefined);
  } finally {
    fetchCapture.restore();
    restoreKey();
  }
});

test('golden: direct adapter call (no delivery log) through Mailgun', async () => {
  const restoreKey = withEncryptionKey();
  const fetchCapture = captureFetch();
  try {
    const { router } = createHarness([]);
    await router.sendViaMailgun(accountFor('mailgun'), {
      to: 'ada@example.test',
      subject: 'Direct',
      text: 'Direct body',
    });
    assertGolden('mailgun-direct', fetchCapture.calls[0]);
  } finally {
    fetchCapture.restore();
    restoreKey();
  }
});

for (const [name, input] of [
  ['smtp-tracked', NORMAL_SEND],
  ['smtp-untracked-marketing', UNTRACKED_MARKETING],
]) {
  test(`golden: ${name} through SMTP is byte-identical`, async () => {
    const restoreKey = withEncryptionKey();
    const smtp = captureNodemailer();
    try {
      const { router } = createHarness([accountFor('smtp')]);
      const result = await router.send(input());
      assert.equal(result.success, true);
      assert.equal(smtp.calls.length, 1);
      // SMTP has no added fields: the comparison is exact.
      const normalized = JSON.parse(JSON.stringify(normalize(smtp.calls[0])));
      if (process.env.GOLDEN_WRITE === '1') {
        assertGolden(name, smtp.calls[0]);
        return;
      }
      const expected = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
      assert.deepEqual(normalized, expected);
    } finally {
      smtp.restore();
      restoreKey();
    }
  });
}
