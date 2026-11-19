'use strict';

// Pre-send Mailgun template check (sendViaMailgun, template branch).
//
// Mailgun accepts a send with a template name that does not exist (200
// "Queued") and drops the message later (event `failed`, delivery-status 621
// "Template not found"; verified live 2026-11-19). Magic Mail therefore asks
// GET /v3/{domain}/templates/{name}?active=yes (domain scope) or
// GET /v4/templates/{name}?active=yes (account scope) before a template send.
//
// Against the fake Mailgun server; synthetic data only, no request leaves
// 127.0.0.1.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createState,
  redirectProviderFetch,
  startFakeProviders,
} = require('./helpers/fake-template-providers');
const { createStrapi } = require('./helpers/provider-template-strapi');
const { encryptCredentials } = require('../server/src/utils/encryption');
const { checkMailgunTemplate, ProviderApiError } = require('../server/src/utils/provider-api');
const ROUTER_PATH = '../server/src/services/email-router';
const { MAILGUN_TEMPLATE_CHECK_TTL_MS } = require(ROUTER_PATH).__test__;

/**
 * Empties the check cache of the email-router module the newest harness
 * loaded (the harness re-requires each service, so every harness has its own
 * module instance and cache).
 */
const resetMailgunTemplateChecks = () => require(ROUTER_PATH).__test__.resetMailgunTemplateChecks();

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

/** Fresh fake provider data and an empty check cache. */
function reset() {
  const fresh = createState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
  resetMailgunTemplateChecks();
}

/** Collecting logger: messages only. */
function recordingLog() {
  const lines = { warn: [], error: [] };
  return {
    lines,
    log: {
      debug() {},
      info() {},
      warn: (message) => lines.warn.push(String(message)),
      error: (message) => lines.error.push(String(message)),
    },
  };
}

function mailgunAccount(
  documentId,
  { domain = 'mg.example.test', region = 'us', priority = 4 } = {}
) {
  return {
    documentId,
    name: documentId,
    provider: 'mailgun',
    fromEmail: `noreply@${domain}`,
    isActive: true,
    priority,
    config: encryptCredentials({ apiKey: `key-${documentId}`, domain, region }),
  };
}

function mgTemplate(name, { active = true } = {}) {
  return {
    name,
    id: `mg-${name}`,
    createdAt: 'Mon, 10 Nov 2026 08:30:00 UTC',
    version: active
      ? {
          tag: 'v1',
          template: '<p>Hi {{name}}</p>',
          engine: 'handlebars',
          createdAt: 'Tue, 11 Nov 2026 09:00:00 UTC',
          active: true,
          id: `mg-${name}-v1`,
          headers: { Subject: 'Welcome {{name}}' },
        }
      : null,
  };
}

const messages = (host = 'api.mailgun.net') =>
  state.requests.filter(
    (r) => r.host === host && r.method === 'POST' && /\/messages$/.test(r.path)
  );
const checks = (host = 'api.mailgun.net') =>
  state.requests.filter(
    (r) => r.host === host && r.method === 'GET' && /\/templates\/[^/]+$/.test(r.path)
  );

/** Harness with the given accounts, synced once. */
async function synced(accounts, options = {}) {
  const h = createStrapi({ accounts, ...options });
  await h.service('provider-templates').sync({ force: true });
  resetMailgunTemplateChecks();
  state.requests.length = 0;
  return h;
}

test('checkMailgunTemplate: available, missing, no active version; other statuses throw', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [
    mgTemplate('welcome'),
    mgTemplate('draft', { active: false }),
  ];
  state.mailgun.us.account = [mgTemplate('shared')];
  const config = { apiKey: 'key-x', domain: 'mg.example.test' };

  assert.equal(
    await checkMailgunTemplate(config, 'us', { name: 'welcome', scope: 'domain' }),
    'available'
  );
  assert.equal(
    await checkMailgunTemplate(config, 'us', { name: 'gone', scope: 'domain' }),
    'missing'
  );
  assert.equal(
    await checkMailgunTemplate(config, 'us', { name: 'draft', scope: 'domain' }),
    'no-active-version'
  );
  assert.equal(
    await checkMailgunTemplate(config, 'us', { name: 'shared', scope: 'account' }),
    'available'
  );
  assert.equal(
    await checkMailgunTemplate(config, 'us', { name: 'welcome', scope: 'account' }),
    'missing'
  );

  const paths = checks().map((r) => `${r.path}?active=${r.query.active}`);
  assert.deepEqual(paths, [
    '/v3/mg.example.test/templates/welcome?active=yes',
    '/v3/mg.example.test/templates/gone?active=yes',
    '/v3/mg.example.test/templates/draft?active=yes',
    '/v4/templates/shared?active=yes',
    '/v4/templates/welcome?active=yes',
  ]);
  assert.ok(checks().every((r) => r.authorization === 'present'));

  for (const status of [401, 429, 500, 503]) {
    state.failures.push({
      host: 'api.mailgun.net',
      method: 'GET',
      pathPrefix: '/v3/mg.example.test/templates/',
      status,
      times: 1,
    });
    await assert.rejects(
      checkMailgunTemplate(config, 'us', { name: 'welcome', scope: 'domain' }),
      (error) => error instanceof ProviderApiError && error.status === status
    );
  }
});

test('a template deleted at Mailgun after the sync is refused before any message request', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const { lines, log } = recordingLog();
  const h = await synced([mailgunAccount('mg1')], { log });
  state.mailgun.us.domains['mg.example.test'] = []; // deleted in the Mailgun dashboard

  await assert.rejects(
    h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' }),
    (error) =>
      error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE' &&
      error.name === 'ProviderTemplateError' &&
      !/example\.test/.test(error.message)
  );
  assert.equal(messages().length, 0, 'no message request was sent');
  assert.equal(checks().length, 1);
  assert.equal(
    h.logUpdates.at(-1)?.fields?.deliveryStatus,
    'failed',
    'the log row is failed, not sent'
  );
  assert.ok(lines.warn.concat(lines.error).every((line) => !/example\.test|key-/.test(line)));
});

test('a template without an active version is refused the same way', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const h = await synced([mailgunAccount('mg1')]);
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome', { active: false })];
  await assert.rejects(
    h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
  );
  assert.equal(messages().length, 0);
});

test('positive results are cached for 60 s per account and template; negatives are not', async (t) => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const h = await synced([mailgunAccount('mg1')]);
  const send = () =>
    h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' });

  await send();
  await send();
  await Promise.all([send(), send(), send()]);
  assert.equal(messages().length, 5);
  assert.equal(checks().length, 1, 'one template check for five sends');

  // After the TTL the template is checked again.
  const realNow = Date.now;
  t.after(() => {
    Date.now = realNow;
  });
  const later = realNow() + MAILGUN_TEMPLATE_CHECK_TTL_MS + 1;
  Date.now = () => later;
  await send();
  assert.equal(checks().length, 2, 'checked again after 60 s');
  Date.now = realNow;

  // A negative result is not cached: once the template is back, sends work.
  resetMailgunTemplateChecks();
  state.mailgun.us.domains['mg.example.test'] = [];
  await assert.rejects(
    send(),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
  );
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  await send();
  assert.equal(messages().length, 7);
});

test('parallel sends share one check in flight', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const h = await synced([mailgunAccount('mg1')]);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' })
    )
  );
  assert.equal(messages().length, 10);
  assert.equal(checks().length, 1);
});

test('account-level templates are checked with GET /v4/templates/{name}?active=yes', async () => {
  reset();
  state.mailgun.us.account = [mgTemplate('shared')];
  const h = await synced([mailgunAccount('mg1')]);
  await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'mailgun:shared' });
  assert.deepEqual(
    checks().map((r) => [r.path, r.query.active]),
    [['/v4/templates/shared', 'yes']]
  );
  state.mailgun.us.account = [];
  resetMailgunTemplateChecks();
  await assert.rejects(
    h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'mailgun:shared' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
  );
  assert.equal(messages().length, 1);
});

test('EU accounts check on api.eu.mailgun.net', async () => {
  reset();
  state.mailgun.eu.domains['mg.example.test'] = [mgTemplate('welcome')];
  const h = await synced([mailgunAccount('mg1', { region: 'eu' })]);
  await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' });
  assert.equal(checks('api.eu.mailgun.net').length, 1);
  assert.equal(checks('api.mailgun.net').length, 0);
});

test('network, timeout-like, auth, 429 and 5xx failures of the check do not block the send', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const { lines, log } = recordingLog();
  const h = await synced([mailgunAccount('mg1')], { log });
  for (const status of [500, 503, 429, 401]) {
    resetMailgunTemplateChecks();
    state.failures.push({
      host: 'api.mailgun.net',
      method: 'GET',
      pathPrefix: '/v3/mg.example.test/templates/',
      status,
      times: 1,
    });
    const result = await h
      .service('email-router')
      .send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' });
    assert.equal(result.success, true, `send goes ahead after a ${status} check`);
  }
  assert.equal(messages().length, 4);
  const warnings = lines.warn.filter((line) => line.includes('Mailgun template check failed'));
  assert.equal(warnings.length, 4);
  assert.ok(warnings.every((line) => !/example\.test|key-/.test(line)));

  // A failed check is not cached as positive: the next send checks again.
  const before = checks().length;
  await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' });
  assert.equal(checks().length, before + 1);

  // Network error (connection refused) on the check only.
  resetMailgunTemplateChecks();
  const previousFetch = global.fetch;
  global.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if ((init?.method || 'GET') === 'GET' && url.pathname.includes('/templates/')) {
      const error = new TypeError('fetch failed');
      error.cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      return Promise.reject(error);
    }
    return previousFetch(input, init);
  };
  try {
    const result = await h
      .service('email-router')
      .send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' });
    assert.equal(result.success, true);
  } finally {
    global.fetch = previousFetch;
  }
  assert.ok(lines.warn.some((line) => line.includes('check failed (NETWORK)')));
});

test('a deleted template uses the configured Magic Mail fallback template', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const local = {
    documentId: 'tpl1',
    templateReferenceId: 77,
    name: 'Local welcome',
    subject: 'Local {{name}}',
    bodyHtml: '<p>Local {{name}}</p>',
    bodyText: '',
    category: 'transactional',
    isActive: true,
  };
  const h = await synced([mailgunAccount('mg1')], { localTemplates: [local] });
  await h.service('provider-templates').setFallback('mailgun:welcome', 77);
  state.mailgun.us.domains['mg.example.test'] = [];

  const result = await h.service('email-router').send({
    to: 'a@example.test',
    providerTemplate: 'mailgun:welcome',
    data: { name: 'Ada' },
  });
  assert.equal(result.fallback, 'magic-mail-template');
  const sent = messages();
  assert.equal(sent.length, 1, 'only the fallback mail was sent');
  const form = Object.fromEntries(sent[0].form);
  assert.equal(form.template, undefined);
  assert.equal(form.subject, 'Local Ada');
});

test('another account that still has the template takes over (nothing was sent)', async () => {
  reset();
  state.mailgun.us.domains['a.example.test'] = [mgTemplate('welcome')];
  state.mailgun.us.domains['b.example.test'] = [mgTemplate('welcome')];
  const h = await synced([
    mailgunAccount('mgA', { domain: 'a.example.test', priority: 9 }),
    mailgunAccount('mgB', { domain: 'b.example.test', priority: 8 }),
  ]);
  state.mailgun.us.domains['a.example.test'] = [];
  const result = await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome' });
  assert.equal(result.accountUsed, 'mgB');
  const sent = messages();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].path, '/v3/b.example.test/messages');
});

test('normal (non-template) Mailgun sends make no template check', async () => {
  reset();
  const h = await synced([mailgunAccount('mg1')]);
  await h
    .service('email-router')
    .send({ to: 'a@example.test', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
  assert.equal(messages().length, 1);
  assert.equal(checks().length, 0);
});
