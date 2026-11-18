'use strict';

// Opt-in live suite for the SendGrid and Mailgun SEND PATHS against the REAL
// provider APIs. Not part of `npm test`.
//
// Run:   npm run test:live
// Needs: ~/.config/magic-mail-live/.env (created by the maintainer, never
//        committed). Variable NAMES (values never appear in code or logs):
//   Required
//     SENDGRID_API_KEY     SendGrid key with the Mail Send permission
//     SENDGRID_FROM        a verified SendGrid Sender Identity address
//     MAILGUN_API_KEY      Mailgun Domain Sending Key (or an account key)
//     MAILGUN_DOMAIN       sending domain, e.g. mg.example.com
//     MAILGUN_REGION       us | eu (region of MAILGUN_DOMAIN)
//     LIVE_TEST_RECIPIENT  address used as recipient (nothing is delivered)
//   Optional
//     SENDGRID_REGION      us | eu (region of SENDGRID_API_KEY, default us)
//     SENDGRID_EU_API_KEY  key of an EU regional subuser; enables the EU host test
//     SENDGRID_EU_FROM     verified sender of that subuser (default SENDGRID_FROM)
//     MAILGUN_FROM         sender address (default magic-mail-live@MAILGUN_DOMAIN)
//     MAILGUN_EU_DOMAIN    an EU domain (+ MAILGUN_EU_API_KEY) for the
//     MAILGUN_EU_API_KEY   "EU domain on the US host" test when MAILGUN_REGION=us
// The same file serves tests/live/provider-templates.live.test.js
// (provider-templates branch), which needs further variables.
//
// Nothing is delivered:
// - every SendGrid mail/send request gets mail_settings.sandbox_mode.enable =
//   true; SendGrid then validates the full request and answers 200 without
//   delivering or emitting events (Sandbox Mode docs);
// - every Mailgun messages request gets o:testmode=yes ("will accept the
//   message but will not send it"; note: Mailgun bills test-mode messages).
// The switches are added by this file's fetch wrapper; the plugin code under
// test is unchanged. Requests may only go to the four provider hosts.
//
// Secrets and addresses are never printed: values stay in memory, assertion
// messages never include them and provider bodies are not logged. Without
// the file every test is skipped with a message (CI never has it).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ENV_FILE = path.join(os.homedir(), '.config', 'magic-mail-live', '.env');
const ALLOWED_HOSTS = new Set([
  'api.sendgrid.com',
  'api.eu.sendgrid.com',
  'api.mailgun.net',
  'api.eu.mailgun.net',
]);
const REQUIRED = [
  'SENDGRID_API_KEY',
  'SENDGRID_FROM',
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'MAILGUN_REGION',
  'LIVE_TEST_RECIPIENT',
];

/**
 * Reads KEY=value lines (no expansion, no export, quotes stripped).
 *
 * @returns {Record<string, string>|null} null when the file does not exist
 */
function readLiveEnv() {
  if (!fs.existsSync(ENV_FILE)) return null;
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const env = readLiveEnv();
const missing = env ? REQUIRED.filter((key) => !env[key]) : REQUIRED;
const skipReason = !env
  ? `live suite skipped: ${ENV_FILE} does not exist (see the variable names at the top of this file)`
  : missing.length > 0
    ? `live suite skipped: missing ${missing.join(', ')} in ${ENV_FILE}`
    : null;
if (skipReason) console.log(skipReason);

/** Registers a live test; skipped with the reason when credentials are missing. */
const live = (name, fn) => test(name, { skip: skipReason || false }, fn);

const results = [];
const sent = { sendgrid: [], mailgun: [] };
let restoreFetch;
let restoreKey;

test.before(() => {
  if (skipReason) return;
  const previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  restoreKey = () => {
    if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  };
  const original = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!ALLOWED_HOSTS.has(url.hostname)) throw new TypeError('live suite: host not allowed');
    let body = init.body;
    if (url.pathname === '/v3/mail/send' && typeof body === 'string') {
      const json = JSON.parse(body);
      json.mail_settings = { ...(json.mail_settings || {}), sandbox_mode: { enable: true } };
      body = JSON.stringify(json);
      sent.sendgrid.push(json);
    }
    if (/\/messages$/.test(url.pathname) && body instanceof FormData) {
      body.set('o:testmode', 'yes');
      sent.mailgun.push(
        [...body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '<file>'])
      );
    }
    const response = await original(input, { ...init, body });
    results.push({
      host: url.hostname,
      path: url.pathname.replace(/\/v3\/[^/]+\/messages$/, '/v3/<domain>/messages'),
      status: response.status,
    });
    return response;
  };
  restoreFetch = () => {
    global.fetch = original;
  };
});

test.after(() => {
  if (skipReason) return;
  restoreFetch();
  restoreKey();
  // Request log without secrets or addresses: host, path, status.
  console.log(JSON.stringify({ liveRequests: results }, null, 1));
});

/** Region of the main SendGrid key. */
const sgRegion = () => (env.SENDGRID_REGION === 'eu' ? 'eu' : 'us');
const mgRegion = () => (env.MAILGUN_REGION === 'eu' ? 'eu' : 'us');

/**
 * Live accounts built from the .env values (config encrypted in memory).
 *
 * @param {{sendgrid?: object, mailgun?: object}} [overrides] - config overrides
 * @returns {object[]}
 */
function liveAccounts(overrides = {}) {
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  return [
    {
      documentId: 'livesendgrid',
      name: 'live-sendgrid',
      provider: 'sendgrid',
      fromEmail: overrides.sendgridFrom || env.SENDGRID_FROM,
      isActive: true,
      priority: 5,
      config: encryptCredentials({
        apiKey: env.SENDGRID_API_KEY,
        region: sgRegion(),
        ...(overrides.sendgrid || {}),
      }),
    },
    {
      documentId: 'livemailgun',
      name: 'live-mailgun',
      provider: 'mailgun',
      fromEmail: env.MAILGUN_FROM || `magic-mail-live@${env.MAILGUN_DOMAIN}`,
      isActive: true,
      priority: 4,
      config: encryptCredentials({
        apiKey: env.MAILGUN_API_KEY,
        domain: env.MAILGUN_DOMAIN,
        region: mgRegion(),
        ...(overrides.mailgun || {}),
      }),
    },
  ];
}

/**
 * Harness with one live account of `provider` (Magic Mail tracking applied
 * by the fake analytics service, as in production with a public URL).
 */
function harnessFor(provider, overrides = {}, options = {}) {
  const { createHarness } = require('../helpers/provider-send-harness');
  const accounts = liveAccounts(overrides).filter((account) => account.provider === provider);
  return { ...createHarness(accounts, options), account: accounts[0] };
}

const message = (extra = {}) => ({
  to: env.LIVE_TEST_RECIPIENT,
  subject: 'Magic Mail live send-path test',
  text: 'Magic Mail live test. Sandbox / test mode: not delivered.',
  ...extra,
});

/** Recipient address with a plus tag (same mailbox, distinct address). */
const tagged = (tag) => env.LIVE_TEST_RECIPIENT.replace('@', `+${tag}@`);

// ── SendGrid (sandbox mode) ───────────────────────────────────────────────

live('SG-1: duplicate to/cc addresses are accepted (sent once)', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(
    message({ cc: env.LIVE_TEST_RECIPIENT.toUpperCase(), bcc: env.LIVE_TEST_RECIPIENT })
  );
  assert.equal(result.success, true);
  const p = sent.sendgrid.at(-1).personalizations[0];
  assert.equal(p.to.length, 1);
  assert.equal(p.cc, undefined);
  assert.equal(p.bcc, undefined);
});

live('SG-3: an X-SG-ID header from the caller is stripped and the send is accepted', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(message({ headers: { 'X-SG-ID': 'x', 'X-Live-Test': '1' } }));
  assert.equal(result.success, true);
  const headers = Object.keys(sent.sendgrid.at(-1).headers).map((name) => name.toLowerCase());
  assert.ok(!headers.includes('x-sg-id'));
  assert.ok(headers.includes('x-live-test'));
});

live('SG-9: display names are sent and accepted', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(
    message({ to: `Live Test <${env.LIVE_TEST_RECIPIENT}>`, cc: `"Ops, Live" <${tagged('cc')}>` })
  );
  assert.equal(result.success, true);
  const p = sent.sendgrid.at(-1).personalizations[0];
  assert.equal(p.to[0].name, 'Live Test');
  assert.equal(p.cc[0].name, 'Ops, Live');
});

live('several replyTo addresses (reply_to_list) are accepted', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(message({ replyTo: [tagged('r1'), tagged('r2')] }));
  assert.equal(result.success, true);
  assert.equal(sent.sendgrid.at(-1).reply_to_list.length, 2);
});

live('inline cid image plus attachment are accepted by both providers', async () => {
  const { PIXEL_PNG } = require('../helpers/provider-send-harness');
  const extra = {
    html: '<p>Inline</p><img src="cid:logo.png">',
    attachments: [
      { cid: 'logo.png', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
      { filename: 'live.txt', content: 'live attachment', contentType: 'text/plain' },
    ],
  };
  for (const provider of ['sendgrid', 'mailgun']) {
    const { router } = harnessFor(provider);
    const result = await router.send(message(extra));
    assert.equal(result.success, true, provider);
  }
});

live('MG-SEND-3: provider tracking switched off where Magic Mail tracks is accepted', async () => {
  const html = '<p>Track</p><a href="https://shop.example.test/x">Shop</a>';
  for (const provider of ['sendgrid', 'mailgun']) {
    const { router } = harnessFor(provider, {}, { tracking: 'all' });
    const result = await router.send(message({ html }));
    assert.equal(result.success, true, provider);
  }
  assert.deepEqual(sent.sendgrid.at(-1).tracking_settings, {
    click_tracking: { enable: false },
    open_tracking: { enable: false },
  });
  const form = sent.mailgun.at(-1);
  assert.ok(form.some(([k, v]) => k === 'o:tracking-opens' && v === 'no'));
  assert.ok(form.some(([k, v]) => k === 'o:tracking-clicks' && v === 'no'));
});

live('SendGrid sandbox: a 200 without X-Message-Id still logs a success', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(message());
  assert.equal(result.success, true);
  assert.ok(result.messageId === null || typeof result.messageId === 'string');
});

live('SendGrid: a wrong key gives 401 and the mapped hint, without provider text', async () => {
  const { router, accountManager, account } = harnessFor('sendgrid', {
    sendgrid: { apiKey: `SG.invalid-${crypto.randomBytes(8).toString('hex')}` },
  });
  const error = await router.sendViaSendGrid(account, message()).catch((e) => e);
  assert.equal(error.status, 401);
  assert.equal(error.provider, 'sendgrid');
  assert.equal(error.message, 'SendGrid API request failed: 401');
  const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
  assert.equal(outcome.success, false);
  assert.equal(outcome.message, 'SendGrid API request failed: 401');
  // PR #22 adds `hintCode` (client-errors providerErrorHint); checked once it is merged.
  if ('hintCode' in outcome) assert.equal(outcome.hintCode, 'SENDGRID_UNAUTHORIZED');
});

live('SG-2: the EU host accepts an EU regional subuser key (optional)', async (t) => {
  if (!env.SENDGRID_EU_API_KEY) {
    t.skip('SENDGRID_EU_API_KEY not set');
    return;
  }
  const { router } = harnessFor('sendgrid', {
    sendgrid: { apiKey: env.SENDGRID_EU_API_KEY, region: 'eu' },
    sendgridFrom: env.SENDGRID_EU_FROM || env.SENDGRID_FROM,
  });
  const result = await router.send(message());
  assert.equal(result.success, true);
  assert.equal(results.at(-1).host, 'api.eu.sendgrid.com');
});

// ── Size prechecks (local only: no request may be made) ───────────────────

live('SG-7/MG-SEND-1: oversized messages are refused before any request', async () => {
  const before = results.length;
  for (const [provider, bytes] of [
    ['sendgrid', 23_000_000],
    ['mailgun', 19_000_000],
  ]) {
    const { router } = harnessFor(provider);
    await assert.rejects(
      router.send(
        message({ attachments: [{ filename: 'big.bin', content: Buffer.alloc(bytes, 1) }] })
      ),
      (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE'
    );
  }
  assert.equal(results.length, before, 'no provider request was made');
});

// ── Mailgun (test mode) ───────────────────────────────────────────────────

live('MG-SEND-2: send options just under 16 KB are accepted', async () => {
  const { router } = harnessFor('mailgun');
  const headers = { 'X-Pad-1': 'p'.repeat(3990), 'X-Pad-2': 'p'.repeat(3990) };
  const result = await router.send(message({ headers }));
  assert.equal(result.success, true);
  const bytes = sent.mailgun
    .at(-1)
    .filter(([k]) => /^[ohvt]:/.test(k))
    .reduce((sum, [k, v]) => sum + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
  assert.ok(bytes > 8000 && bytes <= 16384);
});

live('MG-SEND-4: v: metadata, magicmail_id and o:tag are accepted', async () => {
  const { router } = harnessFor('mailgun');
  const result = await router.send(message({ type: 'notification', priority: 'low' }));
  assert.equal(result.success, true);
  assert.match(result.messageId, /^[^<>]+$/, 'id without angle brackets');
  const form = sent.mailgun.at(-1);
  for (const [key, value] of [
    ['v:magicmail_email_type', 'notification'],
    ['v:magicmail_priority', 'low'],
    ['v:magicmail_id', 'logdoc123'],
    ['o:tag', 'notification'],
  ]) {
    assert.ok(
      form.some(([k, v]) => k === key && v === value),
      key
    );
  }
});

live('Mailgun: an EU domain on the US host is a classified error', async (t) => {
  const domain = mgRegion() === 'eu' ? env.MAILGUN_DOMAIN : env.MAILGUN_EU_DOMAIN;
  const apiKey = mgRegion() === 'eu' ? env.MAILGUN_API_KEY : env.MAILGUN_EU_API_KEY;
  if (!domain || !apiKey) {
    t.skip('no EU Mailgun domain configured');
    return;
  }
  const { router, account } = harnessFor('mailgun', {
    mailgun: { domain, apiKey, region: 'us' },
  });
  const error = await router.sendViaMailgun(account, message()).catch((e) => e);
  assert.equal(error.provider, 'mailgun');
  assert.ok(error.status >= 400 && error.status < 500, 'a 4xx answer');
  const { classifyDeliveryError } = require('../../server/src/utils/delivery-outcome');
  assert.notEqual(classifyDeliveryError(error), 'ambiguous');
  assert.equal(error.message, `Mailgun API request failed: ${error.status}`);
});

// ── Account connection checks (account test path) ─────────────────────────

live('ACC: a valid SendGrid key and the Mailgun key pass the account test', async () => {
  for (const provider of ['sendgrid', 'mailgun']) {
    const { accountManager, account } = harnessFor(provider);
    const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
    assert.equal(outcome.success, true, `${provider} account test`);
  }
});

live('ACC: an invalid Mailgun key yields the mapped hint', async () => {
  const { accountManager, account } = harnessFor('mailgun', {
    mailgun: { apiKey: `invalid-${crypto.randomBytes(8).toString('hex')}` },
  });
  const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
  assert.equal(outcome.success, false);
  assert.equal(outcome.message, 'Mailgun API request failed: 401');
  if ('hintCode' in outcome) assert.equal(outcome.hintCode, 'MAILGUN_UNAUTHORIZED');
});
