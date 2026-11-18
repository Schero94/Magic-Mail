'use strict';

// Opt-in live suite against the REAL Amazon SES v2 API.
//
// Run:   npm run test:live
// Needs: ~/.config/magic-mail-live/.env (created by the maintainer, never
//        committed) with SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY,
//        SES_FROM (a verified identity in that region), and optionally
//        SES_CONFIGURATION_SET and SES_TEMPLATE_NAME (a stored template in that
//        region). Without the file or the required keys every test is skipped
//        with the path to create.
//
// Nothing reaches a real mailbox: every message goes to the SES mailbox
// simulator (success@, bounce@simulator.amazonses.com), which works in the
// sandbox ("Using the mailbox simulator",
// https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html,
// checked 2026-11-18). Requests may only go to email.<SES_REGION>.amazonaws.com.
//
// Secrets are never printed: values are read into memory only, assertion
// messages never include them and provider bodies are not logged. The final
// log line lists host, path and status of each request only.
//
// IAM permissions the key needs: ses:GetAccount, ses:SendEmail,
// ses:ListEmailTemplates, ses:GetEmailTemplate.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_FILE = path.join(os.homedir(), '.config', 'magic-mail-live', '.env');
const REQUIRED = ['SES_REGION', 'SES_ACCESS_KEY_ID', 'SES_SECRET_ACCESS_KEY', 'SES_FROM'];
const SIMULATOR = {
  success: 'success@simulator.amazonses.com',
  bounce: 'bounce@simulator.amazonses.com',
};

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

const env = readLiveEnv() || {};
const missing = REQUIRED.filter((key) => !env[key]);
const notSelected = require('../helpers/live-env').providerNotSelected('ses', env);
const ready = missing.length === 0 && !notSelected;
const live = ready ? test : test.skip;
if (!ready) {
  test.skip(
    notSelected
      ? `Amazon SES live suite: ${notSelected}`
      : `Amazon SES live suite: create ${ENV_FILE} with ${missing.join(', ')}`,
    () => {}
  );
}

const results = [];
let restoreFetch;
let previousKey;
let ses;
let host;

test.before(() => {
  if (!ready) return;
  ses = require('../../server/src/providers/ses');
  const region = ses.resolveRegion(env.SES_REGION);
  assert.ok(region, 'SES_REGION is not a supported region code');
  host = ses.hostFor(region);
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  const original = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname !== host) throw new TypeError('live suite: host not allowed');
    const response = await original(input, init);
    results.push({
      host: url.hostname,
      path: url.pathname.replace(/[^/]{40,}/g, '<id>'),
      status: response.status,
    });
    return response;
  };
  restoreFetch = () => {
    global.fetch = original;
  };
});

test.after(() => {
  if (!ready) return;
  restoreFetch();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  console.log(JSON.stringify({ liveRequests: results }, null, 1));
});

/** Plain config from the live file (validated by the adapter). */
const liveConfig = (overrides = {}) =>
  ses.normalizeConfig(
    {
      region: env.SES_REGION,
      credentialSource: 'keys',
      accessKeyId: env.SES_ACCESS_KEY_ID,
      secretAccessKey: env.SES_SECRET_ACCESS_KEY,
      ...(env.SES_CONFIGURATION_SET ? { configurationSetName: env.SES_CONFIGURATION_SET } : {}),
      ...overrides,
    },
    { creating: true }
  );

/** Router harness with one live SES account. */
function harness(configOverrides = {}) {
  const { createHarness } = require('../helpers/provider-send-harness');
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  const account = {
    documentId: 'liveses',
    name: 'live-ses',
    provider: 'ses',
    fromEmail: env.SES_FROM,
    fromName: 'Magic Mail live test',
    isActive: true,
    isPrimary: true,
    priority: 5,
    config: encryptCredentials(liveConfig(configOverrides)),
  };
  return { account, ...createHarness([account], { tracking: 'none' }) };
}

live('connection check: GetAccount answers with the sandbox flag and quota', async () => {
  const result = await ses.checkConnection(liveConfig());
  assert.equal(result.ok, true);
  assert.equal(typeof result.details.sandbox, 'boolean');
  assert.equal(typeof result.details.sendingEnabled, 'boolean');
  assert.equal(typeof result.details.sendQuota.max24HourSend, 'number');
});

live('plain send to the success simulator returns an SES message id', async () => {
  const { router, account } = harness();
  const result = await router.sendViaAccount(account, {
    to: SIMULATOR.success,
    subject: 'Magic Mail live test (plain)',
    text: 'Synthetic live test message.',
    html: '<p>Synthetic live test message.</p>',
    headers: { 'X-Magic-Mail-Live': 'plain' },
    attachments: [{ filename: 'note.txt', content: 'synthetic attachment' }],
    __logDocumentId: 'livetest1',
  });
  assert.match(String(result.messageId), /^[\x21-\x7e]{10,}$/);
});

live('send to the bounce simulator is accepted (the bounce arrives as an event)', async () => {
  const { router, account } = harness();
  const result = await router.sendViaAccount(account, {
    to: SIMULATOR.bounce,
    subject: 'Magic Mail live test (bounce)',
    text: 'Synthetic bounce test.',
  });
  assert.ok(result.messageId);
});

live('template list reads the stored templates of the region', async () => {
  const { templates, warning } = await ses.templates.list(liveConfig());
  assert.ok(Array.isArray(templates));
  assert.ok(warning === null || warning === 'TRUNCATED');
  if (env.SES_TEMPLATE_NAME) {
    const found = templates.find((t) => t.remoteId === env.SES_TEMPLATE_NAME);
    assert.ok(found, 'SES_TEMPLATE_NAME was listed');
    assert.match(found.activeVersion, /^sha256-[0-9a-f]{16}$/);
  }
});

/** emailData for a provider-template send through one account. */
const templateSend = (account, remoteId) => ({
  to: SIMULATOR.success,
  __providerTemplate: {
    rowsByAccount: {
      [account.documentId]: { remoteId, name: remoteId, scope: 'default', subject: '' },
    },
    variables: { name: 'Ada', user: { email: 'ada@example.test' } },
  },
});

(env.SES_TEMPLATE_NAME ? live : test.skip)(
  'template send with SES_TEMPLATE_NAME is accepted',
  async () => {
    const { router, account } = harness();
    const result = await router.sendViaAccount(
      account,
      templateSend(account, env.SES_TEMPLATE_NAME)
    );
    assert.ok(result.messageId);
  }
);

live('an unknown template is refused with NotFoundException (404)', async () => {
  const { router, account } = harness();
  const error = await router
    .sendViaAccount(
      account,
      templateSend(account, `magic-mail-missing-${crypto.randomBytes(4).toString('hex')}`)
    )
    .catch((err) => err);
  assert.equal(error.status, 404, 'status of a send with an unknown template');
  assert.equal(error.providerReason, 'NotFoundException');
  assert.equal(error.code, 'SES_NOT_FOUND');
});

live('an invalid secret is a 403 with the signature hint', async () => {
  const wrong = crypto.randomBytes(30).toString('base64');
  const { router, account } = harness({ secretAccessKey: wrong });
  const error = await router
    .sendViaAccount(account, { to: SIMULATOR.success, subject: 'x', text: 'y' })
    .catch((err) => err);
  assert.equal(error.status, 403);
  assert.equal(error.code, 'SES_SIGNATURE_MISMATCH');
  await assert.rejects(ses.checkConnection(liveConfig({ secretAccessKey: wrong })), {
    code: 'SES_SIGNATURE_MISMATCH',
  });
});
