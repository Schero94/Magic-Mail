'use strict';

// Opt-in live suite: the rest of the SendGrid integration against the REAL
// SendGrid API (run by `npm run test:live` next to the send-path and
// provider-template suites; never in CI).
//
// Covers what the other two suites do not:
// - send features: custom_args (magicmail_id, email_type, priority),
//   provider tracking left alone when Magic Mail does not track, opens-only
//   tracking, a single reply_to, a 400 with SendGrid's field names;
// - the account connection test with restricted API keys (Mail Send only;
//   Template read only) and the mapped hints;
// - provider templates through their life cycle: a template without
//   versions, a first and a second active version, deletion and the
//   re-match by exact name, then "missing";
// - read-only checks of the suppression lists and tracking settings
//   (Magic Mail does not call these endpoints; the check documents that the
//   key can read them and nothing is changed).
//
// Run:   npm run test:live
//        LIVE_PROVIDERS=sendgrid npm run test:live  (SendGrid only)
// Needs in ~/.config/magic-mail-live/.env (names only; values never printed):
//   SENDGRID_API_KEY (needs Mail Send, Template Engine read/write and API
//   Keys create/delete; a full-access key has them), SENDGRID_FROM,
//   LIVE_TEST_RECIPIENT, optionally SENDGRID_REGION (us|eu).
// Skipped with the reason when SendGrid is not selected by LIVE_PROVIDERS or
// a variable is missing.
//
// Real objects this suite creates in the SendGrid account, always named
// `magic-mail-live-<random>` and deleted again by the last test (and by the
// after hook if a test fails): two restricted API keys and two dynamic
// templates with their versions. The last test fails if any of them still
// exists. Nothing else is written: no settings, no suppressions, no sends
// without sandbox mode (installLiveFetch forces sandbox_mode on every
// /v3/mail/send, including the account test path).

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { installLiveFetch, loadLiveConfig } = require('../helpers/live-env');

const { env, skipReason } = loadLiveConfig({
  sendgrid: ['SENDGRID_API_KEY', 'SENDGRID_FROM', 'LIVE_TEST_RECIPIENT'],
  mailgun: [],
});
const reason = skipReason('sendgrid');
if (reason) console.log(`live SendGrid account suite skipped: ${reason}`);

/** Registers a SendGrid live test; skipped with the reason when it cannot run. */
const liveSendGrid = (name, fn) => test(name, { skip: reason || false }, fn);

const RUN = `magic-mail-live-${crypto.randomBytes(4).toString('hex')}`;
/** Everything this run created at SendGrid, deleted by the cleanup test. */
const created = { apiKeys: [], templates: [] };

/** Live fetch wrapper (sandbox mode forced): `live.sent` bodies, `live.results` log. */
let live;
let previousKey;

const region = () => (env?.SENDGRID_REGION === 'eu' ? 'eu' : 'us');
const apiBase = () =>
  region() === 'eu' ? 'https://api.eu.sendgrid.com' : 'https://api.sendgrid.com';

/**
 * Calls the SendGrid API directly (setup and cleanup only).
 *
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @param {string} [key] - defaults to SENDGRID_API_KEY
 * @returns {Promise<{status: number, json: any}>}
 */
async function sendgridApi(method, path, body, key = env.SENDGRID_API_KEY) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

/** Deletes everything this run created; returns what could not be deleted. */
async function cleanup() {
  const left = [];
  for (const id of created.apiKeys.splice(0)) {
    const { status } = await sendgridApi('DELETE', `/v3/api_keys/${encodeURIComponent(id)}`);
    if (status !== 204 && status !== 404) left.push(`api key (${status})`);
  }
  for (const id of created.templates.splice(0)) {
    const { status } = await sendgridApi('DELETE', `/v3/templates/${encodeURIComponent(id)}`);
    if (status !== 204 && status !== 404) left.push(`template (${status})`);
  }
  return left;
}

test.before(() => {
  if (reason) return;
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  live = installLiveFetch();
});

test.after(async () => {
  if (reason) return;
  const left = await cleanup();
  if (left.length > 0) console.log(`live SendGrid account suite: NOT deleted: ${left.join(', ')}`);
  live.restore();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  // Request log without secrets or addresses: host, method, path, status.
  console.log(JSON.stringify({ liveRequests: live.results }, null, 1));
});

/**
 * Send-path harness with one live SendGrid account.
 *
 * @param {string} [apiKey]
 * @param {object} [options] - createHarness options (tracking, logDocumentId)
 */
function sendHarness(apiKey = env.SENDGRID_API_KEY, options = {}) {
  const { createHarness } = require('../helpers/provider-send-harness');
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  const account = {
    documentId: 'livesendgrid',
    name: 'live-sendgrid',
    provider: 'sendgrid',
    fromEmail: env.SENDGRID_FROM,
    isActive: true,
    priority: 5,
    config: encryptCredentials({ apiKey, region: region() }),
  };
  return { ...createHarness([account], options), account };
}

/** Provider-template harness with one live SendGrid account. */
function templateHarness(apiKey = env.SENDGRID_API_KEY) {
  const { createStrapi } = require('../helpers/provider-template-strapi');
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  return createStrapi({
    accounts: [
      {
        documentId: 'livesendgrid',
        name: 'live-sendgrid',
        provider: 'sendgrid',
        fromEmail: env.SENDGRID_FROM,
        isActive: true,
        priority: 5,
        config: encryptCredentials({ apiKey, region: region() }),
      },
    ],
  });
}

const message = (extra = {}) => ({
  to: env.LIVE_TEST_RECIPIENT,
  subject: 'Magic Mail live SendGrid account test',
  text: 'Magic Mail live test. Sandbox mode: not delivered.',
  ...extra,
});

/**
 * Creates a restricted API key and waits until SendGrid accepts it (new keys
 * can take a few seconds). The key value stays in memory.
 *
 * @param {string[]} scopes
 * @returns {Promise<{key: string, id: string}>} the key value and its id
 */
async function restrictedKey(scopes) {
  const { status, json } = await sendgridApi('POST', '/v3/api_keys', {
    name: `${RUN}-${scopes.join('-')}`,
    scopes,
  });
  assert.equal(status, 201, 'restricted API key created');
  created.apiKeys.push(json.api_key_id);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const probe = await sendgridApi('GET', '/v3/scopes', undefined, json.api_key);
    if (probe.status === 200) return { key: json.api_key, id: json.api_key_id };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.fail('the restricted API key did not become active within 30 s');
}

// ── Send features (sandbox mode) ──────────────────────────────────────────

liveSendGrid('custom_args carry magicmail_id, email_type and priority', async () => {
  const { router } = sendHarness(undefined, { logDocumentId: 'livelog1' });
  const result = await router.send(message({ type: 'notification', priority: 'high' }));
  assert.equal(result.success, true);
  const body = live.sent.sendgrid.at(-1);
  assert.equal(body.custom_args.magicmail_id, 'livelog1');
  assert.equal(body.custom_args.email_type, 'notification');
  assert.equal(body.custom_args.priority, 'high');
  assert.equal(body.mail_settings.sandbox_mode.enable, true);
  assert.equal(body.categories, undefined, 'Magic Mail sends no categories');
  assert.equal(body.send_at, undefined, 'Magic Mail does not schedule with send_at');
});

liveSendGrid('Magic Mail not tracking: SendGrid tracking settings are left alone', async () => {
  const { router } = sendHarness(undefined, { tracking: 'none' });
  const html = '<p>Track</p><a href="https://shop.example.test/x">Shop</a>';
  const result = await router.send(message({ html }));
  assert.equal(result.success, true);
  assert.equal(live.sent.sendgrid.at(-1).tracking_settings, undefined);
});

liveSendGrid('Magic Mail tracking opens only: only open tracking is switched off', async () => {
  const { router } = sendHarness(undefined, { tracking: 'opens' });
  const html = '<p>Track</p><a href="https://shop.example.test/x">Shop</a>';
  const result = await router.send(message({ html }));
  assert.equal(result.success, true);
  assert.deepEqual(live.sent.sendgrid.at(-1).tracking_settings, {
    open_tracking: { enable: false },
  });
});

liveSendGrid('a single replyTo with a display name is sent as reply_to', async () => {
  const { router } = sendHarness();
  const replyTo = `"Support, Live" <${env.LIVE_TEST_RECIPIENT.replace('@', '+reply@')}>`;
  const result = await router.send(message({ replyTo }));
  assert.equal(result.success, true);
  const body = live.sent.sendgrid.at(-1);
  assert.equal(body.reply_to.name, 'Support, Live');
  assert.equal(body.reply_to_list, undefined);
});

liveSendGrid('400: SendGrid field names are kept, provider text is not', async () => {
  // Magic Mail validates recipients, subject and content itself, so a normal
  // send cannot provoke a SendGrid 400. A template row with an id SendGrid
  // does not accept does. Observed 2026-11-18: a well-formed but unknown
  // `d-...` id is answered 400 most of the time but sometimes 200 in sandbox
  // mode, so the test uses a malformed id (400 in every run).
  const h = templateHarness();
  await h.service('provider-templates').sync({ force: true });
  const rows = h.tables['plugin::magic-mail.provider-template'];
  const base = rows.find((r) => r.provider === 'sendgrid' && r.status === 'ok');
  assert.ok(base, 'the account has at least one usable dynamic template');
  rows.push({
    ...base,
    documentId: 'ghost',
    key: 'sendgrid:ghost',
    name: `${RUN}-ghost`,
    remoteId: `not-a-template-${crypto.randomBytes(4).toString('hex')}`,
  });
  const error = await h
    .service('email-router')
    .send({ to: env.LIVE_TEST_RECIPIENT, providerTemplate: 'sendgrid:ghost', data: { a: 1 } })
    .catch((e) => e);
  assert.equal(error.status, 400);
  assert.equal(error.provider, 'sendgrid');
  assert.equal(error.message, 'SendGrid API request failed: 400');
  assert.ok(Array.isArray(error.providerFields), 'field names are reported');
  assert.ok(error.providerFields.includes('template_id'), 'the template_id field is named');
  const { classifyDeliveryError } = require('../../server/src/utils/delivery-outcome');
  assert.notEqual(classifyDeliveryError(error), 'ambiguous', 'a 400 is a definite failure');
});

// ── Account connection test (wizard) with restricted keys ─────────────────

liveSendGrid('account test: the full key passes on the US host', async () => {
  const { accountManager, account } = sendHarness();
  const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
  assert.equal(outcome.success, true);
  assert.equal(live.sent.sendgrid.at(-1).mail_settings.sandbox_mode.enable, true);
  const host = region() === 'eu' ? 'api.eu.sendgrid.com' : 'api.sendgrid.com';
  assert.equal(live.results.at(-1).host, host);
});

liveSendGrid(
  'restricted key with Mail Send only: account test passes, template sync reports AUTH',
  async () => {
    const { key } = await restrictedKey(['mail.send']);
    const { accountManager, account } = sendHarness(key);
    const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
    assert.equal(outcome.success, true, 'Mail Send is enough for the connection test');
    assert.equal(live.sent.sendgrid.at(-1).mail_settings.sandbox_mode.enable, true);
    const h = templateHarness(key);
    const overview = await h.service('provider-templates').sync({ force: true });
    const result = overview.accounts.find((a) => a.provider === 'sendgrid');
    assert.equal(result.error, 'AUTH', 'missing Template read scope is reported as AUTH');
  }
);

liveSendGrid(
  'restricted key without Mail Send: the account test names the missing permission',
  async () => {
    const { key, id } = await restrictedKey(['templates.read']);
    const { accountManager, account } = sendHarness(key);
    const before = live.results.length;
    const outcome = await accountManager.testAccount(account.documentId, env.LIVE_TEST_RECIPIENT);
    assert.equal(outcome.success, false);
    // SendGrid answers 401 (not 403) when a valid key lacks Mail Send; the
    // read-only GET /v3/scopes that follows tells it apart from a wrong key.
    assert.equal(outcome.message, 'SendGrid API request failed: 401');
    assert.equal(outcome.hintCode, 'SENDGRID_MISSING_MAIL_SEND');
    assert.match(outcome.hint, /Mail Send/);
    const calls = live.results.slice(before).map((r) => `${r.method} ${r.path} ${r.status}`);
    assert.deepEqual(calls, ['POST /v3/mail/send 401', 'GET /v3/scopes 200']);
    // The same key can read templates: sync works with it.
    const h = templateHarness(key);
    const overview = await h.service('provider-templates').sync({ force: true });
    assert.equal(overview.accounts.find((a) => a.provider === 'sendgrid').error, null);
    // Delete the key now and prove it is gone.
    assert.equal((await sendgridApi('DELETE', `/v3/api_keys/${id}`)).status, 204);
    created.apiKeys.splice(created.apiKeys.indexOf(id), 1);
    assert.equal((await sendgridApi('GET', `/v3/api_keys/${id}`)).status, 404);
  }
);

// ── Provider templates: versions, re-match by name, missing ───────────────

liveSendGrid(
  'template life cycle: unpublished, active version, new version, re-match by name, missing',
  async () => {
    const name = `${RUN}-template`;
    const h = templateHarness();
    const service = h.service('provider-templates');
    const rowFor = () =>
      h.tables['plugin::magic-mail.provider-template'].find(
        (r) => r.provider === 'sendgrid' && r.name === name
      );

    // 1. A template without versions.
    const first = await sendgridApi('POST', '/v3/templates', { name, generation: 'dynamic' });
    assert.equal(first.status, 201);
    created.templates.push(first.json.id);
    await service.sync({ force: true });
    let row = rowFor();
    assert.ok(row, 'the new template was synced');
    assert.equal(row.status, 'unpublished');
    const key = row.key;

    // 2. A first active version.
    const v1 = await sendgridApi('POST', `/v3/templates/${first.json.id}/versions`, {
      name: 'v1',
      active: 1,
      subject: 'Hello {{name}}',
      html_content: '<p>Hello {{name}}</p>',
    });
    assert.equal(v1.status, 201);
    await service.sync({ force: true });
    row = rowFor();
    assert.equal(row.status, 'ok');
    assert.equal(row.activeVersion, v1.json.id);
    let detail = await service.detail(key);
    assert.match(detail.previewHtml, /Hello/);
    assert.ok(detail.variables.some((v) => v.path === 'name'));

    // 3. A second version becomes active.
    const v2 = await sendgridApi('POST', `/v3/templates/${first.json.id}/versions`, {
      name: 'v2',
      active: 1,
      subject: 'Order {{order.id}}',
      html_content: '<p>Order {{order.id}} for {{name}}</p>',
    });
    assert.equal(v2.status, 201);
    await service.sync({ force: true });
    row = rowFor();
    assert.equal(row.activeVersion, v2.json.id, 'the newly active version is used');
    detail = await service.detail(key);
    assert.ok(detail.variables.some((v) => v.path === 'order.id'));
    const sent = await h.service('email-router').send({
      to: env.LIVE_TEST_RECIPIENT,
      providerTemplate: key,
      data: { name: 'Live', order: { id: 'A1' } },
    });
    assert.equal(sent.success, true);
    assert.equal(live.sent.sendgrid.at(-1).template_id, first.json.id);

    // 4. Deleted and created again under the same name (another
    //    environment): matched by name, same key, new id.
    assert.equal(
      (await sendgridApi('DELETE', `/v3/templates/${first.json.id}`)).status,
      204,
      'first template deleted'
    );
    created.templates.splice(created.templates.indexOf(first.json.id), 1);
    const second = await sendgridApi('POST', '/v3/templates', { name, generation: 'dynamic' });
    assert.equal(second.status, 201);
    created.templates.push(second.json.id);
    const v3 = await sendgridApi('POST', `/v3/templates/${second.json.id}/versions`, {
      name: 'v1',
      active: 1,
      subject: 'Hello again {{name}}',
      html_content: '<p>Hello again {{name}}</p>',
    });
    assert.equal(v3.status, 201);
    await service.sync({ force: true });
    row = rowFor();
    assert.equal(row.status, 'matchedByName');
    assert.equal(row.key, key, 'the key callers use stays the same');
    assert.equal(row.remoteId, second.json.id);
    const again = await h.service('email-router').send({
      to: env.LIVE_TEST_RECIPIENT,
      providerTemplate: key,
      data: { name: 'Live' },
    });
    assert.equal(again.success, true);
    assert.equal(live.sent.sendgrid.at(-1).template_id, second.json.id);

    // 5. Deleted for good: missing, and sending is refused in the plugin.
    assert.equal((await sendgridApi('DELETE', `/v3/templates/${second.json.id}`)).status, 204);
    created.templates.splice(created.templates.indexOf(second.json.id), 1);
    await service.sync({ force: true });
    assert.equal(rowFor().status, 'missing');
    const sendsBefore = live.sent.sendgrid.length;
    await assert.rejects(
      h.service('email-router').send({ to: env.LIVE_TEST_RECIPIENT, providerTemplate: key }),
      (error) => typeof error.code === 'string' && error.code.startsWith('MAGIC_MAIL_PROVIDER')
    );
    assert.equal(live.sent.sendgrid.length, sendsBefore, 'nothing reached SendGrid');
  }
);

// ── Read-only account checks ──────────────────────────────────────────────

liveSendGrid('suppression lists and tracking settings are readable (read only)', async () => {
  // Magic Mail keeps its own suppression list (fed by the Event Webhook) and
  // never calls these endpoints; only the HTTP status and the type are checked.
  for (const path of [
    '/v3/suppression/bounces?limit=1',
    '/v3/suppression/blocks?limit=1',
    '/v3/suppression/spam_reports?limit=1',
    '/v3/suppression/invalid_emails?limit=1',
  ]) {
    const { status, json } = await sendgridApi('GET', path);
    assert.equal(status, 200, path.split('?')[0]);
    assert.ok(Array.isArray(json), `${path.split('?')[0]} returns a list`);
  }
  const tracking = await sendgridApi('GET', '/v3/tracking_settings');
  assert.equal(tracking.status, 200);
});

liveSendGrid('EU region: no EU regional subuser is configured', async (t) => {
  if (region() !== 'eu') {
    t.skip('SENDGRID_REGION is not eu (the account has no EU regional subuser)');
    return;
  }
  assert.ok(live.results.some((r) => r.host === 'api.eu.sendgrid.com'));
});

// ── Cleanup (must stay last) ──────────────────────────────────────────────

liveSendGrid('cleanup: every object this run created is deleted', async () => {
  const ids = { apiKeys: [...created.apiKeys], templates: [...created.templates] };
  const left = await cleanup();
  assert.deepEqual(left, [], 'objects could not be deleted');
  for (const id of ids.apiKeys) {
    const { status } = await sendgridApi('GET', `/v3/api_keys/${encodeURIComponent(id)}`);
    assert.equal(status, 404, 'API key is gone');
  }
  for (const id of ids.templates) {
    const { status } = await sendgridApi('GET', `/v3/templates/${encodeURIComponent(id)}`);
    assert.equal(status, 404, 'template is gone');
  }
  const keys = await sendgridApi('GET', '/v3/api_keys?limit=500');
  assert.equal(keys.status, 200);
  assert.ok(
    !(keys.json.result || []).some((k) => String(k.name).startsWith(RUN)),
    'no API key of this run is left'
  );
  const templates = await sendgridApi('GET', '/v3/templates?generations=dynamic&page_size=200');
  assert.equal(templates.status, 200);
  assert.ok(
    !(templates.json.result || []).some((t) => String(t.name).startsWith(RUN)),
    'no template of this run is left'
  );
});
