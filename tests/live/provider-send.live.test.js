'use strict';

// Opt-in live suite for the SendGrid and Mailgun SEND PATHS against the REAL
// provider APIs. Not part of `npm test`.
//
// Run:   npm run test:live                          (every complete provider)
//        LIVE_PROVIDERS=sendgrid npm run test:live  (SendGrid only)
// Needs: ~/.config/magic-mail-live/.env (created by the maintainer, never
//        committed). Variable NAMES (values never appear in code or logs):
//   Selection
//     LIVE_PROVIDERS       sendgrid | mailgun | sendgrid,mailgun (process env
//                          first, then this file). Default: every provider
//                          whose required variables below are complete.
//                          Tests of an unselected provider are skipped.
//   Required for SendGrid
//     SENDGRID_API_KEY     SendGrid key with the Mail Send permission
//     SENDGRID_FROM        a verified SendGrid Sender Identity address
//     LIVE_TEST_RECIPIENT  address used as recipient (nothing is delivered)
//   Required for Mailgun
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
// The same file serves tests/live/provider-templates.live.test.js, which
// also needs SENDGRID_TEMPLATE_ID (SendGrid) and MAILGUN_TEMPLATE (Mailgun),
// and tests/live/sendgrid-account.live.test.js; `npm run test:live` runs all
// three files.
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
// the file, or for a provider whose variables are incomplete, the tests are
// skipped with the reason (CI never has the file).

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PROVIDERS, installLiveFetch, loadLiveConfig } = require('../helpers/live-env');

const { env, selectionError, skipReason } = loadLiveConfig({
  sendgrid: ['SENDGRID_API_KEY', 'SENDGRID_FROM', 'LIVE_TEST_RECIPIENT'],
  mailgun: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_REGION', 'LIVE_TEST_RECIPIENT'],
});
for (const provider of PROVIDERS) {
  const reason = skipReason(provider);
  if (reason) console.log(`live send suite: ${provider} tests skipped: ${reason}`);
}
const anyReady = PROVIDERS.some((provider) => !skipReason(provider));

/** Registers a live test for one provider; skipped with the reason when it cannot run. */
const liveFor = (provider) => (name, fn) => test(name, { skip: skipReason(provider) || false }, fn);
const liveSendGrid = liveFor('sendgrid');
const liveMailgun = liveFor('mailgun');

test('LIVE_PROVIDERS names only known providers', () => {
  assert.equal(selectionError, null);
});

/** Live fetch wrapper (sandbox / test mode forced): `live.sent` bodies, `live.results` log. */
let live;
let previousKey;

test.before(() => {
  if (!anyReady) return;
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  live = installLiveFetch();
});

test.after(() => {
  if (!anyReady) return;
  live.restore();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  // Request log without secrets or addresses: host, method, path, status.
  console.log(JSON.stringify({ liveRequests: live.results }, null, 1));
});

/** Region of the main SendGrid key. */
const sgRegion = () => (env.SENDGRID_REGION === 'eu' ? 'eu' : 'us');
const mgRegion = () => (env.MAILGUN_REGION === 'eu' ? 'eu' : 'us');

/**
 * Live account of one provider built from the .env values (config encrypted
 * in memory).
 *
 * @param {'sendgrid'|'mailgun'} provider
 * @param {{sendgrid?: object, mailgun?: object, sendgridFrom?: string}} [overrides] - config overrides
 * @returns {object}
 */
function liveAccount(provider, overrides = {}) {
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  if (provider === 'sendgrid') {
    return {
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
    };
  }
  return {
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
  };
}

/**
 * Harness with one live account of `provider` (Magic Mail tracking applied
 * by the fake analytics service, as in production with a public URL).
 */
function harnessFor(provider, overrides = {}, options = {}) {
  const { createHarness } = require('../helpers/provider-send-harness');
  const account = liveAccount(provider, overrides);
  return { ...createHarness([account], options), account };
}

const message = (extra = {}) => ({
  to: env.LIVE_TEST_RECIPIENT,
  subject: 'Magic Mail live send-path test',
  text: 'Magic Mail live test. Sandbox / test mode: not delivered.',
  ...extra,
});

/** Recipient address with a plus tag (same mailbox, distinct address). */
const tagged = (tag) => env.LIVE_TEST_RECIPIENT.replace('@', `+${tag}@`);

const PROVIDER_LABEL = { sendgrid: 'SendGrid', mailgun: 'Mailgun' };

// ── SendGrid (sandbox mode) ───────────────────────────────────────────────

liveSendGrid('SG-1: duplicate to/cc addresses are accepted (sent once)', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(
    message({ cc: env.LIVE_TEST_RECIPIENT.toUpperCase(), bcc: env.LIVE_TEST_RECIPIENT })
  );
  assert.equal(result.success, true);
  const p = live.sent.sendgrid.at(-1).personalizations[0];
  assert.equal(p.to.length, 1);
  assert.equal(p.cc, undefined);
  assert.equal(p.bcc, undefined);
});

liveSendGrid(
  'SG-3: an X-SG-ID header from the caller is stripped and the send is accepted',
  async () => {
    const { router } = harnessFor('sendgrid');
    const result = await router.send(message({ headers: { 'X-SG-ID': 'x', 'X-Live-Test': '1' } }));
    assert.equal(result.success, true);
    const headers = Object.keys(live.sent.sendgrid.at(-1).headers).map((name) =>
      name.toLowerCase()
    );
    assert.ok(!headers.includes('x-sg-id'));
    assert.ok(headers.includes('x-live-test'));
  }
);

liveSendGrid('SG-9: display names are sent and accepted', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(
    message({ to: `Live Test <${env.LIVE_TEST_RECIPIENT}>`, cc: `"Ops, Live" <${tagged('cc')}>` })
  );
  assert.equal(result.success, true);
  const p = live.sent.sendgrid.at(-1).personalizations[0];
  assert.equal(p.to[0].name, 'Live Test');
  assert.equal(p.cc[0].name, 'Ops, Live');
});

liveSendGrid('several replyTo addresses (reply_to_list) are accepted', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(message({ replyTo: [tagged('r1'), tagged('r2')] }));
  assert.equal(result.success, true);
  assert.equal(live.sent.sendgrid.at(-1).reply_to_list.length, 2);
});

// ── Both providers, one test each ─────────────────────────────────────────

for (const provider of PROVIDERS) {
  liveFor(provider)(
    `inline cid image plus attachment are accepted by ${PROVIDER_LABEL[provider]}`,
    async () => {
      const { PIXEL_PNG } = require('../helpers/provider-send-harness');
      const extra = {
        html: '<p>Inline</p><img src="cid:logo.png">',
        attachments: [
          { cid: 'logo.png', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
          { filename: 'live.txt', content: 'live attachment', contentType: 'text/plain' },
        ],
      };
      const { router } = harnessFor(provider);
      const result = await router.send(message(extra));
      assert.equal(result.success, true, provider);
    }
  );
}

liveSendGrid(
  'MG-SEND-3: provider tracking switched off where Magic Mail tracks is accepted (SendGrid)',
  async () => {
    const html = '<p>Track</p><a href="https://shop.example.test/x">Shop</a>';
    const { router } = harnessFor('sendgrid', {}, { tracking: 'all' });
    const result = await router.send(message({ html }));
    assert.equal(result.success, true, 'sendgrid');
    assert.deepEqual(live.sent.sendgrid.at(-1).tracking_settings, {
      click_tracking: { enable: false },
      open_tracking: { enable: false },
    });
  }
);

liveMailgun(
  'MG-SEND-3: provider tracking switched off where Magic Mail tracks is accepted (Mailgun)',
  async () => {
    const html = '<p>Track</p><a href="https://shop.example.test/x">Shop</a>';
    const { router } = harnessFor('mailgun', {}, { tracking: 'all' });
    const result = await router.send(message({ html }));
    assert.equal(result.success, true, 'mailgun');
    const form = live.sent.mailgun.at(-1);
    assert.ok(form.some(([k, v]) => k === 'o:tracking-opens' && v === 'no'));
    assert.ok(form.some(([k, v]) => k === 'o:tracking-clicks' && v === 'no'));
  }
);

liveSendGrid('SendGrid sandbox: a 200 without X-Message-Id still logs a success', async () => {
  const { router } = harnessFor('sendgrid');
  const result = await router.send(message());
  assert.equal(result.success, true);
  assert.ok(result.messageId === null || typeof result.messageId === 'string');
});

liveSendGrid(
  'SendGrid: a wrong key gives 401 and the mapped hint, without provider text',
  async () => {
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
  }
);

liveSendGrid('SG-2: the EU host accepts an EU regional subuser key (optional)', async (t) => {
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
  assert.equal(live.results.at(-1).host, 'api.eu.sendgrid.com');
});

// ── Size prechecks (local only: no request may be made) ───────────────────

for (const [provider, bytes, label] of [
  ['sendgrid', 23_000_000, 'SG-7'],
  ['mailgun', 19_000_000, 'MG-SEND-1'],
]) {
  liveFor(provider)(
    `${label}: oversized ${PROVIDER_LABEL[provider]} messages are refused before any request`,
    async () => {
      const before = live.results.length;
      const { router } = harnessFor(provider);
      await assert.rejects(
        router.send(
          message({ attachments: [{ filename: 'big.bin', content: Buffer.alloc(bytes, 1) }] })
        ),
        (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE'
      );
      assert.equal(live.results.length, before, 'no provider request was made');
    }
  );
}

// ── Mailgun (test mode) ───────────────────────────────────────────────────

liveMailgun('MG-SEND-2: send options just under 16 KB are accepted', async () => {
  const { router } = harnessFor('mailgun');
  const headers = { 'X-Pad-1': 'p'.repeat(3990), 'X-Pad-2': 'p'.repeat(3990) };
  const result = await router.send(message({ headers }));
  assert.equal(result.success, true);
  const bytes = live.sent.mailgun
    .at(-1)
    .filter(([k]) => /^[ohvt]:/.test(k))
    .reduce((sum, [k, v]) => sum + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
  assert.ok(bytes > 8000 && bytes <= 16384);
});

liveMailgun('MG-SEND-4: v: metadata, magicmail_id and o:tag are accepted', async () => {
  const { router } = harnessFor('mailgun');
  const result = await router.send(message({ type: 'notification', priority: 'low' }));
  assert.equal(result.success, true);
  assert.match(result.messageId, /^[^<>]+$/, 'id without angle brackets');
  const form = live.sent.mailgun.at(-1);
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

liveMailgun('Mailgun: an EU domain on the US host is a classified error', async (t) => {
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

for (const provider of PROVIDERS) {
  liveFor(provider)(
    `ACC: a valid ${PROVIDER_LABEL[provider]} key passes the account test`,
    async () => {
      const { accountManager, account } = harnessFor(provider);
      const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
      assert.equal(outcome.success, true, `${provider} account test`);
      // The account test sends a real message through the same send path; the
      // fetch wrapper forced sandbox / test mode on it, so nothing was delivered.
      if (provider === 'sendgrid') {
        assert.equal(live.sent.sendgrid.at(-1).mail_settings.sandbox_mode.enable, true);
      } else {
        assert.ok(live.sent.mailgun.at(-1).some(([k, v]) => k === 'o:testmode' && v === 'yes'));
      }
    }
  );
}

liveMailgun('ACC: an invalid Mailgun key yields the mapped hint', async () => {
  const { accountManager, account } = harnessFor('mailgun', {
    mailgun: { apiKey: `invalid-${crypto.randomBytes(8).toString('hex')}` },
  });
  const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
  assert.equal(outcome.success, false);
  assert.equal(outcome.message, 'Mailgun API request failed: 401');
  if ('hintCode' in outcome) assert.equal(outcome.hintCode, 'MAILGUN_UNAUTHORIZED');
});
