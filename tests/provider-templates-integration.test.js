'use strict';

// Provider templates against fake SendGrid and Mailgun HTTP servers:
// paginated sync, EU base URLs, name re-match, stale templates, 404, 429,
// routing to accounts that have the template, failover, size limits, the
// local fallback, and core mails through the provider wrapper.
// Synthetic data only; no request leaves 127.0.0.1.

const test = require('node:test');
const assert = require('node:assert/strict');
const Mustache = require('mustache');
const {
  createState,
  redirectProviderFetch,
  startFakeProviders,
} = require('./helpers/fake-template-providers');
const { createStrapi, quietLog } = require('./helpers/provider-template-strapi');

let fake;
let state;
let restoreFetch;
let previousKey;

test.before(async () => {
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'p'.repeat(32);
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

/** Resets the fake provider data between tests. */
function reset() {
  const fresh = createState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

const { encryptCredentials } = require('../server/src/utils/encryption');

function sendgridAccount(documentId, overrides = {}, config = {}) {
  return {
    documentId,
    name: documentId,
    provider: 'sendgrid',
    fromEmail: `noreply@${documentId}.example.test`,
    fromName: 'Synthetic',
    isActive: true,
    priority: 5,
    config: encryptCredentials({ apiKey: `SG.${documentId}`, ...config }),
    ...overrides,
  };
}

function mailgunAccount(documentId, overrides = {}, config = {}) {
  return {
    documentId,
    name: documentId,
    provider: 'mailgun',
    fromEmail: `noreply@mg.example.test`,
    isActive: true,
    priority: 4,
    config: encryptCredentials({
      apiKey: `key-${documentId}`,
      domain: 'mg.example.test',
      region: 'us',
      ...config,
    }),
    ...overrides,
  };
}

function smtpAccount(documentId, overrides = {}) {
  return {
    documentId,
    name: documentId,
    provider: 'smtp',
    fromEmail: `noreply@smtp.example.test`,
    isActive: true,
    isPrimary: true,
    priority: 100,
    config: encryptCredentials({ host: 'smtp.example.test', port: 587 }),
    ...overrides,
  };
}

const SG_HTML =
  '<html><body><h1>Hello {{name}}</h1><p>{{user.email}}</p>{{#if vip}}<b>VIP</b>{{/if}}{{#each items}}<li>{{label}}</li>{{/each}}<div>{{{html}}}</div></body></html>';

function sgTemplate(id, name, { active = true, html = SG_HTML, subject = 'Hi {{name}}' } = {}) {
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
        subject,
        html_content: html,
        plain_content: 'Hello {{name}}',
        updated_at: '2026-11-11 09:00:00',
      },
    ],
  };
}

function mgTemplate(name, { active = true, subject = 'Welcome {{name}}' } = {}) {
  return {
    name,
    id: `mg-${name}`,
    createdAt: 'Mon, 10 Nov 2026 08:30:00 UTC',
    version: active
      ? {
          tag: 'v2',
          template: '<p>Hi {{name}} {{#unless paid}}trial{{/unless}}</p>',
          engine: 'handlebars',
          createdAt: 'Tue, 11 Nov 2026 09:00:00 UTC',
          active: true,
          id: `mg-${name}-v2`,
          headers: subject ? { Subject: subject } : {},
        }
      : null,
  };
}

const sends = (host) =>
  state.requests.filter(
    (r) => r.host === host && r.method === 'POST' && /\/(mail\/send|messages)$/.test(r.path)
  );

// ─── Sync ──────────────────────────────────────────────────────────────────

test('SendGrid sync follows page_token pages, fetches details and builds keys', async () => {
  reset();
  state.sendgridPageSize = 2;
  state.sendgrid.us = [
    sgTemplate('d-1', 'Welcome Email'),
    sgTemplate('d-2', 'Password reset'),
    sgTemplate('d-3', 'Ünïcode Name!'),
  ];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  const overview = await h.service('provider-templates').sync({ force: true });

  const lists = state.requests.filter((r) => r.path === '/v3/templates');
  assert.equal(lists.length, 2, 'two list pages');
  assert.equal(lists[0].query.generations, 'dynamic');
  assert.equal(lists[0].query.page_size, '200');
  assert.equal(lists[1].query.page_token, '2');
  assert.ok(lists.every((r) => r.authorization === 'present'));
  assert.deepEqual(
    overview.templates.map((t) => t.key),
    ['sendgrid:password-reset', 'sendgrid:unicode-name', 'sendgrid:welcome-email']
  );
  const welcome = overview.templates.find((t) => t.key === 'sendgrid:welcome-email');
  assert.equal(welcome.status, 'ok');
  assert.equal(welcome.updatedAtProvider, '2026-11-11T09:00:00.000Z');
  assert.deepEqual(
    welcome.accounts.map((a) => a.name),
    ['sg1']
  );
  assert.equal(overview.enabled, true);
  assert.equal(overview.stale, false);

  const detail = await h.service('provider-templates').detail('sendgrid:welcome-email');
  assert.deepEqual(
    detail.variables.map((v) => v.path),
    ['html', 'items', 'label', 'name', 'user.email', 'vip']
  );
  assert.equal(detail.variables.find((v) => v.path === 'label').scoped, true);
  assert.equal(detail.variables.find((v) => v.path === 'html').raw, true);
  assert.equal(detail.variables.find((v) => v.path === 'name').inSample, true);
  assert.equal(detail.variables.find((v) => v.path === 'vip').inSample, false);
  assert.match(detail.previewHtml, /Hello \{\{name\}\}/);
});

test('SendGrid EU accounts use api.eu.sendgrid.com for sync and send', async () => {
  reset();
  state.sendgrid.eu = [sgTemplate('d-eu', 'EU welcome')];
  const h = createStrapi({ accounts: [sendgridAccount('sgeu', {}, { region: 'eu' })] });
  await h.service('provider-templates').sync({ force: true });
  assert.ok(state.requests.every((r) => r.host === 'api.eu.sendgrid.com'));
  await h.service('email-router').send({
    to: 'ada@example.test',
    providerTemplate: 'sendgrid:eu-welcome',
    data: { name: 'Ada' },
  });
  assert.equal(sends('api.eu.sendgrid.com').length, 1);
  assert.equal(sends('api.sendgrid.com').length, 0);
});

test('Mailgun sync reads domain and account templates with pivot paging on the EU host', async () => {
  reset();
  state.mailgunPageSize = 1;
  state.mailgun.eu.domains['mg.example.test'] = [
    mgTemplate('welcome'),
    mgTemplate('draft', { active: false }),
  ];
  state.mailgun.eu.account = [mgTemplate('welcome'), mgTemplate('invoice')];
  const h = createStrapi({ accounts: [mailgunAccount('mg1', {}, { region: 'eu' })] });
  const overview = await h.service('provider-templates').sync({ force: true });

  assert.ok(state.requests.every((r) => r.host === 'api.eu.mailgun.net'));
  const domainLists = state.requests.filter((r) => r.path === '/v3/mg.example.test/templates');
  assert.ok(domainLists.length >= 2);
  assert.equal(domainLists[1].query.page, 'next');
  assert.equal(domainLists[1].query.p, '1');
  const details = state.requests.filter((r) => /templates\/[^/]+$/.test(r.path));
  assert.ok(details.every((r) => r.query.active === 'yes'));

  const byKey = Object.fromEntries(overview.templates.map((t) => [t.key, t]));
  assert.deepEqual(Object.keys(byKey).sort(), [
    'mailgun:draft',
    'mailgun:invoice',
    'mailgun:welcome',
  ]);
  assert.equal(byKey['mailgun:draft'].status, 'unpublished');
  assert.equal(byKey['mailgun:welcome'].subject, 'Welcome {{name}}');
  const rows = h.tables['plugin::magic-mail.provider-template'];
  assert.equal(rows.find((r) => r.key === 'mailgun:welcome').remoteScope, 'domain');
  assert.equal(rows.find((r) => r.key === 'mailgun:invoice').remoteScope, 'account');
});

test('Mailgun domain keys without account-template access still sync the domain templates', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  state.mailgunAccountScopeStatus = 403;
  const h = createStrapi({ accounts: [mailgunAccount('mg1')] });
  const overview = await h.service('provider-templates').sync({ force: true });
  assert.deepEqual(
    overview.templates.map((t) => t.key),
    ['mailgun:welcome']
  );
  assert.equal(overview.accounts[0].error, null);
});

test('a 429 or 401 during sync keeps the previous rows and reports the account error', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });

  state.failures.push({
    host: 'api.sendgrid.com',
    method: 'GET',
    pathPrefix: '/v3/templates',
    status: 429,
    times: 1,
  });
  let overview = await h.service('provider-templates').sync({ force: true });
  assert.equal(overview.accounts[0].error, 'RATE_LIMITED');
  assert.equal(overview.templates[0].status, 'ok', 'rows are not marked missing on a failed read');

  state.failures.push({
    host: 'api.sendgrid.com',
    method: 'GET',
    pathPrefix: '/v3/templates',
    status: 401,
    times: 1,
  });
  overview = await h.service('provider-templates').sync({ force: true });
  assert.equal(overview.accounts[0].error, 'AUTH');
  assert.equal(overview.templates[0].status, 'ok');
});

test('a template deleted at the provider becomes missing; an unpublished one becomes unpublished', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome'), sgTemplate('d-2', 'Receipt')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });

  state.sendgrid.us = [sgTemplate('d-2', 'Receipt', { active: false })];
  const overview = await h.service('provider-templates').sync({ force: true });
  const byKey = Object.fromEntries(overview.templates.map((t) => [t.key, t]));
  assert.equal(byKey['sendgrid:welcome'].status, 'missing');
  assert.equal(byKey['sendgrid:receipt'].status, 'unpublished');

  const router = h.service('email-router');
  await assert.rejects(
    router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome' }),
    (error) =>
      error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE' && /"Welcome"/.test(error.message)
  );
  await assert.rejects(
    router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:receipt' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
  );
  assert.equal(sends('api.sendgrid.com').length, 0, 'nothing is sent for a stale template');
});

test('a promoted database matches templates by name when the remote id changed', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-staging', 'Welcome')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });

  // Production account: same name, other id.
  state.sendgrid.us = [sgTemplate('d-production', 'Welcome')];
  const overview = await h.service('provider-templates').sync({ force: true });
  const group = overview.templates[0];
  assert.equal(group.key, 'sendgrid:welcome', 'the key is unchanged');
  assert.equal(group.status, 'matchedByName');
  assert.equal(group.usable, true);
  await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome' });
  assert.equal(sends('api.sendgrid.com')[0].json.template_id, 'd-production');
});

test('accounts deleted from Magic Mail lose their synced rows', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });
  h.tables['plugin::magic-mail.email-account'].length = 0;
  const overview = await h.service('provider-templates').sync({ force: true });
  assert.equal(overview.enabled, false);
  assert.equal(h.tables['plugin::magic-mail.provider-template'].length, 0);
});

// ─── Send ──────────────────────────────────────────────────────────────────

const DATA = {
  name: 'Ada <L>',
  user: { email: 'ada@example.test' },
  vip: true,
  items: [{ label: 'One' }, { label: 'Two & three' }],
  html: '<strong>raw</strong>',
  when: new Date('2026-11-17T10:00:00.000Z'),
  skip: undefined,
  fn() {},
};

test('SendGrid: the same data object becomes dynamic_template_data; no body is sent', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
  const h = createStrapi({ accounts: [smtpAccount('smtp1'), sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });
  const result = await h.service('email-router').send({
    to: 'Ada@Example.test',
    providerTemplate: 'sendgrid:welcome',
    data: DATA,
  });
  assert.equal(result.success, true);
  assert.equal(result.accountUsed, 'sg1', 'only accounts with the template are routed');
  const json = sends('api.sendgrid.com')[0].json;
  assert.equal(json.template_id, 'd-1');
  assert.equal(json.content, undefined);
  assert.equal(json.subject, undefined, 'the template subject is used');
  assert.deepEqual(json.personalizations[0].to, [{ email: 'ada@example.test' }]);
  assert.deepEqual(json.personalizations[0].dynamic_template_data, {
    name: 'Ada <L>',
    user: { email: 'ada@example.test' },
    vip: true,
    items: [{ label: 'One' }, { label: 'Two & three' }],
    html: '<strong>raw</strong>',
    when: '2026-11-17T10:00:00.000Z',
  });
  assert.equal(json.from.email, 'noreply@sg1.example.test');

  // Same visible result locally and from the provider payload: the payload
  // renders the shared variables exactly like the caller's data.
  const local =
    '<h1>Hello {{name}}</h1><p>{{user.email}}</p>{{#items}}<li>{{label}}</li>{{/items}}<div>{{{html}}}</div>';
  assert.equal(
    Mustache.render(local, json.personalizations[0].dynamic_template_data),
    Mustache.render(local, DATA)
  );

  // The log stores the template key and variable names, never the values.
  const log = h.logs[0].data;
  assert.equal(log.templateName, 'Welcome');
  assert.equal(log.subject, 'Hi {{name}}');
  assert.deepEqual(log.metadata.providerTemplate, {
    key: 'sendgrid:welcome',
    variables: ['name', 'user', 'vip', 'items', 'html', 'when'],
  });
  assert.equal(JSON.stringify(log).includes('Ada <L>'), false);
});

test('Mailgun: template name, t:variables and t:text; subject only when set explicitly', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  state.mailgun.us.account = [mgTemplate('shared')];
  const h = createStrapi({ accounts: [mailgunAccount('mg1')] });
  await h.service('provider-templates').sync({ force: true });
  const router = h.service('email-router');

  await router.send({
    to: 'a@example.test',
    providerTemplate: 'mailgun:welcome',
    data: { name: 'Ada' },
  });
  let form = Object.fromEntries(sends('api.mailgun.net')[0].form);
  assert.equal(form.template, 'welcome');
  assert.deepEqual(JSON.parse(form['t:variables']), { name: 'Ada' });
  assert.equal(form['t:text'], 'yes');
  assert.equal(form.subject, undefined);
  assert.equal(form.html, undefined);

  await router.send({
    to: 'a@example.test',
    providerTemplate: 'mailgun:shared',
    subject: 'Explicit subject',
    data: {},
  });
  form = Object.fromEntries(sends('api.mailgun.net')[1].form);
  assert.equal(form.template, 'mg-shared', 'account templates are sent by id');
  assert.equal(form.subject, 'Explicit subject');
});

test('template sends carry the shared send-path metadata; Mailgun 16 KB counts it', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1'), mailgunAccount('mg1')] });
  await h.service('provider-templates').sync({ force: true });
  const router = h.service('email-router');

  await router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome', data: {} });
  const json = sends('api.sendgrid.com')[0].json;
  assert.equal(json.custom_args.magicmail_id, h.logs[0].documentId);
  assert.equal(json.custom_args.email_type, 'transactional');
  assert.equal(json.tracking_settings, undefined, 'no local tracking on a provider-rendered body');

  await router.send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome', data: {} });
  const form = sends('api.mailgun.net')[0].form;
  const entries = Object.fromEntries(form);
  assert.equal(entries['v:magicmail_id'], h.logs[1].documentId);
  assert.equal(entries['v:magicmail_email_type'], 'transactional');
  assert.equal(entries['v:magicmail_priority'], 'normal');
  assert.equal(entries['o:tag'], 'transactional');
  assert.equal(entries['o:tracking-opens'], undefined);
  assert.equal(entries['o:tracking-clicks'], undefined);

  // Template data that fits 16 KB alone but not with the metadata options:
  // refused before any request, with the provider-template code.
  const optionBytes = form
    .filter(([name]) => /^[ohvt]:/.test(name))
    .reduce((sum, [name, value]) => sum + Buffer.byteLength(name) + Buffer.byteLength(value), 0);
  const variablesBytes = Buffer.byteLength(entries['t:variables']);
  const fill = 16 * 1024 - (optionBytes - variablesBytes) - Buffer.byteLength('{"big":""}') + 1;
  assert.ok(fill > 0 && fill < 16 * 1024);
  const before = sends('api.mailgun.net').length;
  await assert.rejects(
    router.send({
      to: 'a@example.test',
      providerTemplate: 'mailgun:welcome',
      data: { big: 'x'.repeat(fill) },
    }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_TOO_LARGE'
  );
  assert.equal(sends('api.mailgun.net').length, before, 'nothing is sent above the limit');
  await router.send({
    to: 'a@example.test',
    providerTemplate: 'mailgun:welcome',
    data: { big: 'x'.repeat(fill - 1) },
  });
  assert.equal(sends('api.mailgun.net').length, before + 1, 'exactly 16 KB is accepted');
});

test('Mailgun: a template without Subject header needs an explicit subject', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('nosubject', { subject: '' })];
  const h = createStrapi({ accounts: [mailgunAccount('mg1')] });
  await h.service('provider-templates').sync({ force: true });
  await assert.rejects(
    h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'mailgun:nosubject' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT'
  );
  assert.equal(sends('api.mailgun.net').length, 0);
});

test('size limits: Mailgun 16KB send options and the 1 MB template data bound', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('welcome')];
  const h = createStrapi({ accounts: [mailgunAccount('mg1')] });
  await h.service('provider-templates').sync({ force: true });
  const router = h.service('email-router');
  await assert.rejects(
    router.send({
      to: 'a@example.test',
      providerTemplate: 'mailgun:welcome',
      data: { big: 'x'.repeat(17_000) },
    }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_TOO_LARGE'
  );
  assert.equal(sends('api.mailgun.net').length, 0, 'nothing is sent above the limit');
  await assert.rejects(
    router.send({
      to: 'a@example.test',
      providerTemplate: 'mailgun:welcome',
      data: { big: 'x'.repeat(1_100_000) },
    }),
    (error) => error.name === 'ValidationError' && /larger than/.test(error.message)
  );
  const cyclic = { name: 'a' };
  cyclic.self = cyclic;
  await assert.rejects(
    router.send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome', data: cyclic }),
    (error) => error.name === 'ValidationError' && !/"a"/.test(error.message)
  );
});

test('failover only between accounts that have the template; 429 fails over', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
  state.mailgun.us.domains['mg.example.test'] = [];
  const h = createStrapi({
    accounts: [
      sendgridAccount('sgA', { priority: 9 }),
      sendgridAccount('sgB', { priority: 8 }),
      mailgunAccount('mg1', { priority: 50 }),
    ],
  });
  await h.service('provider-templates').sync({ force: true });
  state.failures.push({
    host: 'api.sendgrid.com',
    method: 'POST',
    pathPrefix: '/v3/mail/send',
    status: 429,
    times: 1,
  });
  const result = await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome' });
  assert.equal(result.accountUsed, 'sgB');
  assert.equal(sends('api.mailgun.net').length, 0, 'mg1 does not have the template');
});

test('an explicit account without the template is a clear error', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1'), smtpAccount('smtp1')] });
  await h.service('provider-templates').sync({ force: true });
  await assert.rejects(
    h
      .service('email-router')
      .send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome', accountName: 'smtp1' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_ACCOUNT'
  );
});

test('unknown keys, raw ids, combinations and queueing are rejected', async () => {
  reset();
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  const router = h.service('email-router');
  await assert.rejects(router.send({ to: 'a@example.test', providerTemplate: 'd-123abc' }), {
    name: 'ValidationError',
  });
  await assert.rejects(
    router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:nothing' }),
    (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN'
  );
  await assert.rejects(
    router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:x', html: '<p>x</p>' }),
    { name: 'ValidationError' }
  );
  await assert.rejects(
    router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:x' }, { queue: true }),
    { name: 'ValidationError' }
  );
});

test('the public content API send schema does not accept providerTemplate', () => {
  const { validate } = require('../server/src/validation');
  assert.throws(
    () => validate('content.send', { to: 'a@example.test', providerTemplate: 'sendgrid:welcome' }),
    { name: 'ValidationError' }
  );
});

test('opt-in local fallback: stale template or provider refusal sends the local template', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-1', 'Welcome')];
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
  const h = createStrapi({ accounts: [sendgridAccount('sg1')], localTemplates: [local] });
  const service = h.service('provider-templates');
  await service.sync({ force: true });
  await service.setFallback('sendgrid:welcome', 77);

  // Provider refuses (400): nothing accepted, so the fallback is safe.
  state.failures.push({
    host: 'api.sendgrid.com',
    method: 'POST',
    pathPrefix: '/v3/mail/send',
    status: 400,
    times: 1,
  });
  const refused = await h.service('email-router').send({
    to: 'a@example.test',
    providerTemplate: 'sendgrid:welcome',
    data: { name: 'Ada' },
  });
  assert.equal(refused.fallback, 'magic-mail-template');
  const mails = sends('api.sendgrid.com');
  assert.equal(mails.length, 2);
  assert.equal(mails[1].json.subject, 'Local Ada');
  assert.equal(mails[1].json.template_id, undefined);

  // Ambiguous provider error (500): no fallback, the error is reported.
  state.failures.push({
    host: 'api.sendgrid.com',
    method: 'POST',
    pathPrefix: '/v3/mail/send',
    status: 500,
    times: 1,
  });
  await assert.rejects(
    h.service('email-router').send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome' }),
    (error) => error.status === 500
  );
  assert.equal(sends('api.sendgrid.com').length, 3, 'no second mail after an ambiguous error');

  // Stale template: fallback without calling the provider for the template.
  state.sendgrid.us = [];
  await service.sync({ force: true });
  const stale = await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome', data: { name: 'Bo' } });
  assert.equal(stale.fallback, 'magic-mail-template');
  assert.equal(sends('api.sendgrid.com')[3].json.subject, 'Local Bo');
});

// ─── Core mails ────────────────────────────────────────────────────────────

/** users-permissions 5.62 template(): lodash-style interpolation of <%= KEY %>. */
function fakeUsersPermissions() {
  const service = {
    template(layout, data) {
      return layout.replace(/<%=\s*([\w.]+)\s*%>/g, (_, path) =>
        String(path.split('.').reduce((value, part) => value?.[part], data) ?? '')
      );
    },
  };
  return { service: (name) => (name === 'users-permissions' ? service : null), _service: service };
}

function emailPluginDouble() {
  const nativeSends = [];
  const provider = {
    send: async (options) => {
      nativeSends.push(options);
      return { messageId: 'native' };
    },
  };
  const service = {
    send: (options) => provider.send(options),
    sendTemplatedEmail: (options) => provider.send(options),
  };
  return { plugin: { provider, service: () => service }, service, nativeSends };
}

/** Mirrors users-permissions forgotPassword: render, then email.send. */
async function forgotPassword(up, email) {
  const message = '<p>Reset: <%= URL %>?code=<%= TOKEN %> for <%= USER.username %></p>';
  const data = {
    URL: 'https://app.example.test/reset?lang=de',
    SERVER_URL: 'https://api.example.test',
    ADMIN_URL: 'https://api.example.test/admin',
    USER: {
      id: 7,
      documentId: 'user7',
      email: 'user@example.test',
      username: 'user.seven',
      firstname: 'Ada',
      provider: 'local',
      confirmed: true,
      role: { id: 1 },
    },
    TOKEN: 'tok123',
  };
  const body = up._service.template(message, data);
  const subject = up._service.template('Reset password', { USER: data.USER });
  return email.service.send({
    to: 'user@example.test',
    from: 'Strapi <noreply@sg1.example.test>',
    replyTo: 'support@example.test',
    subject,
    text: body,
    html: body,
  });
}

test('core mail: password reset goes through the chosen SendGrid template with the v1 payload', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-reset', 'Reset password')];
  const up = fakeUsersPermissions();
  const email = emailPluginDouble();
  const h = createStrapi({
    accounts: [sendgridAccount('sg1')],
    emailPlugin: email.plugin,
    usersPermissions: up,
  });
  const {
    installEmailInterception,
    uninstallEmailInterception,
  } = require('../server/src/bootstrap');
  installEmailInterception(h.strapi, quietLog);
  try {
    const service = h.service('provider-templates');
    await service.sync({ force: true });
    await service.setCoreDesign(
      'reset-password',
      { providerTemplate: 'sendgrid:reset-password' },
      { id: 1 }
    );
    assert.equal(h.events[0].name, 'magic-mail.core-email.design.update');

    await forgotPassword(up, email);
    assert.equal(email.nativeSends.length, 0);
    const json = sends('api.sendgrid.com')[0].json;
    assert.equal(json.template_id, 'd-reset');
    const data = json.personalizations[0].dynamic_template_data;
    assert.deepEqual(data.USER, {
      id: 7,
      email: 'user@example.test',
      username: 'user.seven',
      firstname: 'Ada',
    });
    assert.deepEqual(data.user, data.USER);
    assert.equal(data.TOKEN, 'tok123');
    assert.equal(data.token, 'tok123');
    assert.equal(data.URL, 'https://app.example.test/reset?lang=de');
    assert.equal(data.url, 'https://app.example.test/reset?lang=de&code=tok123');
    assert.equal(data.SERVER_URL, 'https://api.example.test');
    assert.equal(data.adminUrl, 'https://api.example.test/admin');
    assert.deepEqual(data.meta, {
      templateKey: 'sendgrid:reset-password',
      payloadVersion: 1,
      coreEmailType: 'reset-password',
    });
    assert.equal(JSON.stringify(data).includes('documentId'), false, 'no other user fields');
    assert.equal(json.from.name, 'Strapi');
    assert.equal(json.reply_to.email, 'support@example.test');

    // Back to the designer: today's behaviour (golden payload shape).
    await service.setCoreDesign('reset-password', { providerTemplate: null }, { id: 1 });
    await forgotPassword(up, email);
    const designer = sends('api.sendgrid.com')[1].json;
    assert.equal(designer.template_id, undefined);
    assert.match(designer.content[1].value, /Reset: https:\/\/app\.example\.test/);
  } finally {
    uninstallEmailInterception(h.strapi);
  }
  assert.equal(typeof up._service.template, 'function');
  assert.equal(up._service.template[require('../server/src/bootstrap').WRAPPED], undefined);
});

test('core mail: strict by default, opt-in designer fallback when the template is gone', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-reset', 'Reset password')];
  const up = fakeUsersPermissions();
  const email = emailPluginDouble();
  const h = createStrapi({
    accounts: [sendgridAccount('sg1')],
    emailPlugin: email.plugin,
    usersPermissions: up,
  });
  const {
    installEmailInterception,
    uninstallEmailInterception,
  } = require('../server/src/bootstrap');
  installEmailInterception(h.strapi, quietLog);
  try {
    const service = h.service('provider-templates');
    await service.sync({ force: true });
    await service.setCoreDesign(
      'reset-password',
      { providerTemplate: 'sendgrid:reset-password' },
      { id: 1 }
    );
    state.sendgrid.us = [];
    await service.sync({ force: true });
    const designs = await service.coreDesigns();
    assert.equal(designs['reset-password'].status, 'missing');
    assert.equal(designs['reset-password'].usable, false);

    await assert.rejects(
      forgotPassword(up, email),
      (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
    );
    assert.equal(sends('api.sendgrid.com').length, 0, 'no other body is sent');
    assert.equal(email.nativeSends.length, 0);

    await service.setCoreDesign(
      'reset-password',
      { providerTemplate: 'sendgrid:reset-password', fallbackToDesigner: true },
      { id: 1 }
    );
    await forgotPassword(up, email);
    const json = sends('api.sendgrid.com')[0].json;
    assert.equal(json.template_id, undefined);
    assert.match(json.content[1].value, /tok123/);
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

test('copy as Magic Mail template converts Handlebars blocks and reports warnings', async () => {
  reset();
  state.sendgrid.us = [
    sgTemplate('d-1', 'Welcome', {
      html: '<html><head><style>p{color:red}</style></head><body><p>{{#if vip}}VIP{{else}}Std{{/if}} {{#equals a "b"}}x{{/equals}}</p></body></html>',
    }),
  ];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });
  const result = await h.service('provider-templates').copyAsLocal('sendgrid:welcome');
  assert.equal(result.name, 'Welcome (copy)');
  assert.ok(result.warnings.some((w) => w.code === 'HELPER_UNSUPPORTED'));
  const created = h.tables['plugin::magic-mail.email-template'].at(-1);
  assert.match(created.bodyHtml, /\{\{#vip\}\}VIP\{\{\/vip\}\}\{\{\^vip\}\}Std\{\{\/vip\}\}/);
  assert.equal(created.subject, 'Hi {{name}}');
  const block = created.design.body.rows[0].columns[0].contents[0];
  assert.equal(block.type, 'html');
  assert.match(block.values.html, /^<style>p\{color:red\}<\/style>\n<p>/);
});

test('convert for provider turns a local Mustache template into Handlebars', async () => {
  const h = createStrapi({
    localTemplates: [
      {
        documentId: 't1',
        templateReferenceId: 5,
        name: 'Local',
        subject: 'Hi {{name}}',
        bodyHtml: '{{#items}}<li>{{.}}</li>{{/items}}{{^paid}}trial{{/paid}}{{& raw}}',
      },
    ],
  });
  const converted = await h.service('provider-templates').convertLocalForProvider(5);
  assert.match(converted.html, /\{\{#if items\}\}/);
  assert.match(converted.html, /\{\{this\}\}/);
  assert.match(converted.html, /\{\{#unless paid\}\}trial\{\{\/unless\}\}/);
  assert.match(converted.html, /\{\{\{raw\}\}\}/);
  assert.ok(converted.warnings.some((w) => w.code === 'SECTION_AMBIGUOUS'));
});
