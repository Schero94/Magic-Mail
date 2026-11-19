'use strict';

// Opt-in live suite for the provider-template flows against the REAL SendGrid
// and Mailgun APIs.
//
// Run:   npm run test:live                          (runs every file in
//                                                   tests/live/)
//        LIVE_PROVIDERS=sendgrid npm run test:live  (SendGrid only)
// Needs: ~/.config/magic-mail-live/.env (created by the maintainer, never
//        committed). Variable NAMES (values never appear in code or logs):
//   Selection
//     LIVE_PROVIDERS       sendgrid | mailgun | sendgrid,mailgun (process env
//                          first, then this file). Default: every provider
//                          whose required variables below are complete.
//                          Tests of an unselected provider are skipped.
//   Required for SendGrid
//     SENDGRID_API_KEY, SENDGRID_FROM (verified sender), SENDGRID_TEMPLATE_ID,
//     LIVE_TEST_RECIPIENT
//   Required for Mailgun
//     MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_REGION (us|eu), MAILGUN_TEMPLATE,
//     LIVE_TEST_RECIPIENT
//   Optional
//     SENDGRID_REGION (us|eu), MAILGUN_FROM (sender address)
// Without the file this suite fails with the path to create; with the file,
// the first test fails when a selected provider misses a variable. The
// send-path suite reads the same file and skips instead.
//
// Nothing is delivered:
// - every SendGrid mail/send request gets mail_settings.sandbox_mode.enable =
//   true ("Sandbox Mode allows you to send a test email to ensure that your
//   request body is valid and formatted correctly", Mail Send reference and
//   twilio/sendgrid-oai tsg_mail_v3.json);
// - every Mailgun messages request gets o:testmode=yes ("Messages are
//   processed normally but not actually delivered", Mailgun API reference,
//   Sending in Test Mode).
// The switches are added by this file's fetch wrapper; the plugin code under
// test is unchanged. Requests may only go to the four provider hosts.
//
// Secrets are never printed: values are read into memory only, assertion
// messages never include them and provider bodies are not logged.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ENV_FILE, PROVIDERS, installLiveFetch, loadLiveConfig } = require('../helpers/live-env');

const { env, selected, selectionError, missing, skipReason } = loadLiveConfig({
  sendgrid: ['SENDGRID_API_KEY', 'SENDGRID_FROM', 'SENDGRID_TEMPLATE_ID', 'LIVE_TEST_RECIPIENT'],
  mailgun: [
    'MAILGUN_API_KEY',
    'MAILGUN_DOMAIN',
    'MAILGUN_REGION',
    'MAILGUN_TEMPLATE',
    'LIVE_TEST_RECIPIENT',
  ],
});

test('live credentials file is present and complete for the selected providers', () => {
  assert.ok(env, `Create ${ENV_FILE} (see the comment at the top of this file)`);
  assert.equal(selectionError, null);
  assert.ok(selected.length > 0, 'LIVE_PROVIDERS selects no provider');
  for (const provider of selected) {
    // Only variable NAMES are compared and reported, never values.
    assert.deepEqual(missing[provider], [], `${provider}: missing keys in ${ENV_FILE}`);
  }
});

const ready = PROVIDERS.filter((provider) => !skipReason(provider));
for (const provider of PROVIDERS) {
  const reason = skipReason(provider);
  if (reason) console.log(`live template suite: ${provider} tests skipped: ${reason}`);
}

/** Registers a live test for one provider; skipped with the reason when it cannot run. */
const liveFor = (provider) => (name, fn) => test(name, { skip: skipReason(provider) || false }, fn);
const liveSendGrid = liveFor('sendgrid');
const liveMailgun = liveFor('mailgun');

/** Live fetch wrapper (sandbox / test mode forced): `live.sent` bodies, `live.results` log. */
let live;
let previousKey;

test.before(() => {
  if (ready.length === 0) return;
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  live = installLiveFetch();
});

test.after(() => {
  if (ready.length === 0) return;
  live.restore();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  // Request log without secrets or addresses: host, method, path, status.
  console.log(JSON.stringify({ liveRequests: live.results }, null, 1));
});

const sgRegion = () => (env.SENDGRID_REGION === 'eu' ? 'eu' : 'us');
const mgRegion = () => (env.MAILGUN_REGION === 'eu' ? 'eu' : 'us');

/** Strapi harness with one live account per ready provider (built once). */
let h;
function harness() {
  if (h) return h;
  const { createStrapi } = require('../helpers/provider-template-strapi');
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  const accounts = [];
  if (ready.includes('sendgrid')) {
    accounts.push({
      documentId: 'live-sendgrid',
      name: 'live-sendgrid',
      provider: 'sendgrid',
      fromEmail: env.SENDGRID_FROM,
      isActive: true,
      priority: 5,
      config: encryptCredentials({ apiKey: env.SENDGRID_API_KEY, region: sgRegion() }),
    });
  }
  if (ready.includes('mailgun')) {
    accounts.push({
      documentId: 'live-mailgun',
      name: 'live-mailgun',
      provider: 'mailgun',
      fromEmail: env.MAILGUN_FROM || `magic-mail-live@${env.MAILGUN_DOMAIN}`,
      isActive: true,
      priority: 4,
      config: encryptCredentials({
        apiKey: env.MAILGUN_API_KEY,
        domain: env.MAILGUN_DOMAIN,
        region: mgRegion(),
      }),
    });
  }
  h = createStrapi({ accounts });
  return h;
}

/** One forced sync of every ready account, shared by the per-provider sync tests. */
let syncPromise;
const syncOnce = () => {
  syncPromise ??= harness().service('provider-templates').sync({ force: true });
  return syncPromise;
};

const keys = {};

// ── Sync ──────────────────────────────────────────────────────────────────

liveSendGrid('sync reads the real SendGrid account and finds the configured template', async () => {
  const overview = await syncOnce();
  const account = overview.accounts.find((a) => a.provider === 'sendgrid');
  assert.ok(account, 'the SendGrid account was part of the sync');
  assert.equal(account.error, null, 'sendgrid account could not be read');
  const rows = harness().tables['plugin::magic-mail.provider-template'];
  const sg = rows.find((r) => r.provider === 'sendgrid' && r.remoteId === env.SENDGRID_TEMPLATE_ID);
  assert.ok(sg, 'SendGrid template SENDGRID_TEMPLATE_ID was synced');
  assert.equal(sg.status, 'ok', 'SendGrid template has an active version');
  keys.sendgrid = sg.key;
});

liveMailgun('sync reads the real Mailgun account and finds the configured template', async () => {
  const overview = await syncOnce();
  const account = overview.accounts.find((a) => a.provider === 'mailgun');
  assert.ok(account, 'the Mailgun account was part of the sync');
  assert.equal(account.error, null, 'mailgun account could not be read');
  const rows = harness().tables['plugin::magic-mail.provider-template'];
  const mg = rows.find((r) => r.provider === 'mailgun' && r.name === env.MAILGUN_TEMPLATE);
  assert.ok(mg, 'Mailgun template MAILGUN_TEMPLATE was synced');
  assert.equal(mg.status, 'ok', 'Mailgun template has an active version');
  keys.mailgun = mg.key;
});

// ── Pagination ────────────────────────────────────────────────────────────

liveSendGrid(
  'SendGrid pagination: page size 1 returns the same templates as one page',
  async () => {
    const { listSendGridTemplates } = require('../../server/src/utils/provider-api');
    const sgConfig = { apiKey: env.SENDGRID_API_KEY, region: sgRegion() };
    const sgAll = await listSendGridTemplates(sgConfig);
    const sgPaged = await listSendGridTemplates(sgConfig, { pageSize: 1 });
    assert.deepEqual(sgPaged.map((t) => t.remoteId).sort(), sgAll.map((t) => t.remoteId).sort());
  }
);

liveMailgun('Mailgun pagination: page size 1 returns the same templates as one page', async () => {
  const { listMailgunTemplates } = require('../../server/src/utils/provider-api');
  const mgConfig = { apiKey: env.MAILGUN_API_KEY, domain: env.MAILGUN_DOMAIN };
  const mgAll = await listMailgunTemplates(mgConfig, mgRegion());
  const mgPaged = await listMailgunTemplates(mgConfig, mgRegion(), { pageSize: 1 });
  assert.deepEqual(
    mgPaged.templates.map((t) => t.name).sort(),
    mgAll.templates.map((t) => t.name).sort()
  );
});

// ── Variable detection ────────────────────────────────────────────────────

for (const provider of PROVIDERS) {
  liveFor(provider)(`variable detection works on the real ${provider} template`, async () => {
    const key = keys[provider];
    assert.ok(key, `${provider} template was synced first`);
    const detail = await harness().service('provider-templates').detail(key);
    assert.ok(detail.previewHtml.length > 0, `${provider} preview HTML`);
    assert.ok(Array.isArray(detail.variables));
    assert.ok(detail.variables.every((v) => typeof v.path === 'string' && v.path.length > 0));
  });
}

// ── Template sends ────────────────────────────────────────────────────────

liveSendGrid('SendGrid accepts the template send (sandbox mode, not delivered)', async () => {
  const result = await harness()
    .service('email-router')
    .send({
      to: env.LIVE_TEST_RECIPIENT,
      providerTemplate: keys.sendgrid,
      data: { name: 'Live Test', items: [{ label: 'One' }], when: new Date() },
    });
  assert.equal(result.success, true);
  const body = live.sent.sendgrid.at(-1);
  assert.equal(body.template_id, env.SENDGRID_TEMPLATE_ID);
  assert.equal(body.mail_settings.sandbox_mode.enable, true);
});

liveMailgun('Mailgun accepts the template send (test mode, not delivered)', async () => {
  const result = await harness()
    .service('email-router')
    .send({
      to: env.LIVE_TEST_RECIPIENT,
      providerTemplate: keys.mailgun,
      subject: 'Magic Mail live test',
      data: { name: 'Live Test' },
    });
  assert.equal(result.success, true);
  assert.ok(live.sent.mailgun.at(-1).some(([k, v]) => k === 'o:testmode' && v === 'yes'));
  assert.ok(live.sent.mailgun.at(-1).some(([k]) => k === 't:variables'));
});

// ── Unknown templates ─────────────────────────────────────────────────────

liveSendGrid('an unknown SendGrid template key fails in the plugin', async () => {
  await assert.rejects(
    harness()
      .service('email-router')
      .send({ to: env.LIVE_TEST_RECIPIENT, providerTemplate: 'sendgrid:does-not-exist' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN'
  );
});

liveMailgun(
  'an unknown Mailgun key fails in the plugin; a template deleted at Mailgun is refused before sending',
  async () => {
    await assert.rejects(
      harness()
        .service('email-router')
        .send({ to: env.LIVE_TEST_RECIPIENT, providerTemplate: 'mailgun:does-not-exist' }),
      (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN'
    );
    // A row whose remote id no longer exists at the provider (deleted after sync).
    const rows = harness().tables['plugin::magic-mail.provider-template'];
    const ghost = {
      ...rows.find((r) => r.key === keys.mailgun),
      documentId: 'ghost',
      key: 'mailgun:ghost',
      name: `magic-mail-missing-${crypto.randomBytes(4).toString('hex')}`,
      remoteScope: 'domain',
    };
    rows.push(ghost);
    // Mailgun itself answers 200 "Queued" for an unknown template name and
    // drops the message later (event `failed`, delivery-status 621 "Template
    // not found"; checked 2026-11-19). Magic Mail must ask Mailgun first
    // (GET /v3/{domain}/templates/{name}?active=yes -> 404) and send nothing.
    const before = live.sent.mailgun.length;
    await assert.rejects(
      harness()
        .service('email-router')
        .send({ to: env.LIVE_TEST_RECIPIENT, providerTemplate: 'mailgun:ghost', subject: 'x' }),
      (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
    );
    assert.equal(live.sent.mailgun.length, before, 'no message request reached Mailgun');
    // The request log masks the domain and the (long) template name.
    const check = live.results.at(-1);
    assert.ok(
      check?.method === 'GET' && check.path.startsWith('/v3/<domain>/templates/'),
      'the last request was the template check'
    );
    assert.equal(check.status, 404, 'Mailgun reports the deleted template as 404');
  }
);

// ── Size limits ───────────────────────────────────────────────────────────

liveMailgun(
  'size limits: just under the Mailgun 16KB option limit passes, above is refused before sending',
  async () => {
    const before = live.sent.mailgun.length;
    await harness()
      .service('email-router')
      .send({
        to: env.LIVE_TEST_RECIPIENT,
        providerTemplate: keys.mailgun,
        subject: 'Magic Mail live size test',
        data: { pad: 'x'.repeat(15_000) },
      });
    await assert.rejects(
      harness()
        .service('email-router')
        .send({
          to: env.LIVE_TEST_RECIPIENT,
          providerTemplate: keys.mailgun,
          subject: 'Magic Mail live size test',
          data: { pad: 'x'.repeat(17_000) },
        }),
      (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_TOO_LARGE'
    );
    assert.equal(
      live.sent.mailgun.length,
      before + 1,
      'the oversized message never reached Mailgun'
    );
  }
);

liveSendGrid(
  'SendGrid accepts template data just under the 1 MB plugin bound (sandbox)',
  async () => {
    const result = await harness()
      .service('email-router')
      .send({
        to: env.LIVE_TEST_RECIPIENT,
        providerTemplate: keys.sendgrid,
        data: { pad: 'x'.repeat(1024 * 1024 - 64) },
      });
    assert.equal(result.success, true);
  }
);

liveSendGrid(
  'provider rate-limit information is visible to the client (headers on a list call)',
  async () => {
    const host = sgRegion() === 'eu' ? 'api.eu.sendgrid.com' : 'api.sendgrid.com';
    const response = await fetch(`https://${host}/v3/templates?generations=dynamic&page_size=1`, {
      headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}` },
    });
    assert.equal(response.status, 200);
    // Recorded only as presence; 429 itself is covered by the fake-server and
    // contract suites (forcing it here would abuse the account's quota).
    assert.ok(
      ['x-ratelimit-limit', 'x-ratelimit-remaining'].some((name) => response.headers.has(name)),
      'SendGrid reports rate-limit headers'
    );
  }
);

// ── EU region (runs only for a provider configured for EU) ────────────────

for (const [provider, euHost, configured] of [
  ['sendgrid', 'api.eu.sendgrid.com', () => env.SENDGRID_REGION === 'eu'],
  ['mailgun', 'api.eu.mailgun.net', () => env.MAILGUN_REGION === 'eu'],
]) {
  liveFor(provider)(`EU region: ${provider} requests went to the EU host`, async (t) => {
    if (!configured()) {
      t.skip(`no EU ${provider} account configured`);
      return;
    }
    const euRequests = live.results.filter((r) => r.host === euHost);
    assert.ok(euRequests.length > 0, 'requests went to the EU host');
    assert.ok(euRequests.every((r) => r.status < 500));
  });
}
