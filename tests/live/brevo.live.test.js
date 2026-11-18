'use strict';

// Opt-in live suite for the Brevo adapter against the REAL Brevo API. Not
// part of `npm test`.
//
// Run:   npm run test:live   (or: node --test tests/live/brevo.live.test.js)
// Needs: ~/.config/magic-mail-live/.env (created by the maintainer, never
//        committed). Variable NAMES (values never appear in code or logs):
//   Required
//     BREVO_API_KEY      Brevo API key (SMTP & API > API keys)
//     BREVO_FROM         a verified Brevo sender address
//     BREVO_TO           recipient address (nothing is delivered, see below)
//   Optional
//     BREVO_TEMPLATE_ID  numeric id of an active transactional template that
//                        reads {{ params.name }}; enables the template tests
//
// Nothing is delivered: this file's fetch wrapper adds the header
// `X-Sib-Sandbox: drop` to every POST /v3/smtp/email body ("No emails are
// sent to recipients, no email logs are created", Brevo sandbox mode:
// https://developers.brevo.com/docs/using-sandbox-mode). The plugin itself
// drops X-Sib-* caller headers, so production callers can not switch sandbox
// mode on; the switch exists only in this test's fetch wrapper, and every
// send request is checked for it before it leaves the process. Requests may
// only go to api.brevo.com.
//
// Note: the connection check (GET /v3/account) counts against Brevo's
// "All other endpoints" hourly limit and the template list against the
// /v3/smtp/* limit (rate-limits page), so the suite makes few calls.
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
const REQUIRED = ['BREVO_API_KEY', 'BREVO_FROM', 'BREVO_TO'];

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
const notSelected = require('../helpers/live-env').providerNotSelected('brevo', env);
const skipReason = notSelected
  ? `Brevo live suite skipped: ${notSelected}`
  : !env
    ? `Brevo live suite skipped: ${ENV_FILE} does not exist (see the variable names at the top of this file)`
    : missing.length > 0
      ? `Brevo live suite skipped: missing ${missing.join(', ')} in ${ENV_FILE}`
      : null;
if (skipReason) console.log(skipReason);

const templateId =
  env && /^[1-9]\d{0,15}$/.test(env.BREVO_TEMPLATE_ID || '') ? env.BREVO_TEMPLATE_ID : null;

/** Registers a live test; skipped with the reason when credentials are missing. */
const live = (name, fn, { needsTemplate = false } = {}) =>
  test(
    name,
    {
      skip: skipReason || (needsTemplate && !templateId ? 'BREVO_TEMPLATE_ID not set' : false),
    },
    fn
  );

const results = [];
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
    if (url.hostname !== 'api.brevo.com' || url.protocol !== 'https:') {
      throw new TypeError('live suite: host not allowed');
    }
    let body = init.body;
    if (init.method === 'POST' && url.pathname === '/v3/smtp/email') {
      const json = JSON.parse(body);
      json.headers = { ...(json.headers || {}), 'X-Sib-Sandbox': 'drop' };
      body = JSON.stringify(json);
      if (JSON.parse(body).headers['X-Sib-Sandbox'] !== 'drop') {
        throw new Error('live suite: sandbox header missing, request not sent');
      }
    }
    const response = await original(input, { ...init, body });
    results.push({ path: url.pathname, status: response.status });
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
  // Request log without secrets or addresses: path and status only.
  console.log(JSON.stringify({ liveRequests: results }, null, 1));
});

/**
 * Harness with one live Brevo account (config encrypted in memory).
 *
 * @param {object} [config] - Config overrides
 * @returns {{router: object, account: object, h: object}}
 */
function harness(config = {}) {
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  const { createHarness } = require('../helpers/provider-send-harness');
  const account = {
    documentId: 'livebrevo',
    name: 'live-brevo',
    provider: 'brevo',
    fromEmail: env.BREVO_FROM,
    isActive: true,
    priority: 5,
    config: encryptCredentials({ apiKey: env.BREVO_API_KEY, ...config }),
  };
  const { router } = createHarness([account]);
  const h = require('../../server/src/services/email-router').__test__.providerSendHelpers(router);
  return { router, account, h };
}

const brevo = () => require('../../server/src/providers/brevo');

live('connection check: GET /v3/account answers with non-personal details', async () => {
  const result = await brevo().checkConnection({ apiKey: env.BREVO_API_KEY });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.details).sort(), [
    'enterprise',
    'plans',
    'transactionalEnabled',
  ]);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('@'), 'no address in the details');
});

live(
  'plain send through the router (sandbox): Brevo accepts and returns a message id',
  async () => {
    const { router } = harness();
    const result = await router.send({
      to: env.BREVO_TO,
      subject: 'Magic Mail live Brevo test',
      text: 'Magic Mail live test. Sandbox mode: not delivered.',
      html: '<p>Magic Mail live test. Sandbox mode: not delivered.</p>',
    });
    assert.equal(result.success, true);
    assert.equal(typeof result.messageId, 'string', 'a message id was returned');
  }
);

live('marketing send with List-Unsubscribe and custom headers is accepted (sandbox)', async () => {
  const { router } = harness();
  const result = await router.send({
    to: env.BREVO_TO,
    subject: 'Magic Mail live Brevo header test',
    text: 'Sandbox mode: not delivered.',
    type: 'marketing',
    unsubscribeUrl: 'https://example.com/unsubscribe',
    headers: { 'X-Campaign': 'live-test' },
    attachments: [{ filename: 'note.txt', content: 'synthetic attachment' }],
  });
  assert.equal(result.success, true);
});

live('template list reads the account templates', async () => {
  const { templates, warning } = await brevo().templates.list({ apiKey: env.BREVO_API_KEY });
  assert.ok(Array.isArray(templates));
  assert.ok(warning === null || warning === 'TRUNCATED');
  for (const template of templates) {
    assert.match(template.remoteId, /^\d+$/);
    assert.equal(template.scope, 'default');
  }
  if (templateId) {
    const found = templates.find((t) => t.remoteId === templateId);
    assert.ok(found, 'BREVO_TEMPLATE_ID is in the list');
    assert.ok(found.activeVersion, 'BREVO_TEMPLATE_ID is active');
  }
});

live(
  'template send with params (sandbox)',
  async () => {
    const { account, h } = harness();
    const result = await brevo().send({
      account,
      config: { apiKey: env.BREVO_API_KEY },
      emailData: {
        to: env.BREVO_TO,
        __providerTemplate: {
          rowsByAccount: {
            [account.documentId]: {
              remoteId: templateId,
              name: 'live',
              scope: 'default',
              subject: '',
            },
          },
          variables: { name: 'Live Test' },
        },
      },
      h,
    });
    assert.equal(typeof result.messageId, 'string');
  },
  { needsTemplate: true }
);

live('an unknown template id is refused with a fixed error', async (t) => {
  const { account, h } = harness();
  const error = await brevo()
    .send({
      account,
      config: { apiKey: env.BREVO_API_KEY },
      emailData: {
        to: env.BREVO_TO,
        __providerTemplate: {
          rowsByAccount: {
            [account.documentId]: { remoteId: '999999999', name: 'missing', scope: 'default' },
          },
          variables: {},
        },
      },
      h,
    })
    .catch((e) => e);
  if (!(error instanceof Error)) {
    // Sandbox mode "only validates the API request format"; it may accept
    // an id that does not exist. Reported, not hidden.
    t.skip('Brevo sandbox mode accepted the unknown template id (format-only validation)');
    return;
  }
  assert.ok([400, 404].includes(error.status), `status ${error.status}`);
  assert.match(error.message, /^Brevo API request failed: \d{3}$/);
});

live('a bad API key gives 401 for the connection check and the send', async () => {
  const bad = `xkeysib-${crypto.randomBytes(32).toString('hex')}-invalid`;
  await assert.rejects(brevo().checkConnection({ apiKey: bad }), (error) => {
    assert.equal(error.status, 401);
    assert.ok(['AUTH', 'BREVO_IP_NOT_AUTHORIZED'].includes(error.code));
    return true;
  });
  const { router, account } = harness({ apiKey: bad });
  const error = await router
    .sendViaAccount(account, { to: env.BREVO_TO, subject: 's', text: 't' })
    .catch((e) => e);
  assert.equal(error.status, 401);
  assert.equal(brevo().hintFor(error.status, error.code), 'BREVO_INVALID_KEY');
});
