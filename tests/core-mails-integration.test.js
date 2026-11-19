'use strict';

// Core emails through provider templates (Strapi RFC #27752 gaps) against the
// fake SendGrid and Mailgun servers: email confirmation end to end through
// both providers, password reset and admin forgot password through Mailgun
// and SendGrid, the SendGrid subject injection, the provider-template events
// and the startup check. Synthetic data only; no request leaves 127.0.0.1.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createState,
  redirectProviderFetch,
  startFakeProviders,
} = require('./helpers/fake-template-providers');
const { createStrapi, quietLog } = require('./helpers/provider-template-strapi');
const { encryptCredentials } = require('../server/src/utils/encryption');
const bootstrap = require('../server/src/bootstrap');

const { installEmailInterception, uninstallEmailInterception } = bootstrap;

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

function reset() {
  const fresh = createState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

const sendgridAccount = (documentId) => ({
  documentId,
  name: documentId,
  provider: 'sendgrid',
  fromEmail: `noreply@${documentId}.example.test`,
  fromName: 'Synthetic',
  isActive: true,
  priority: 5,
  config: encryptCredentials({ apiKey: `SG.${documentId}` }),
});

const mailgunAccount = (documentId) => ({
  documentId,
  name: documentId,
  provider: 'mailgun',
  fromEmail: 'noreply@mg.example.test',
  isActive: true,
  priority: 4,
  config: encryptCredentials({
    apiKey: `key-${documentId}`,
    domain: 'mg.example.test',
    region: 'us',
  }),
});

const sgTemplate = (id, name, subject = '{{subject}}') => ({
  id,
  name,
  updated_at: '2026-11-10 08:30:00',
  versions: [
    {
      id: `${id}-v1`,
      template_id: id,
      active: 1,
      name: 'v1',
      subject,
      html_content: '<p>{{url}}</p>',
      plain_content: '{{url}}',
      updated_at: '2026-11-11 09:00:00',
    },
  ],
});

const mgTemplate = (name) => ({
  name,
  id: `mg-${name}`,
  createdAt: 'Mon, 10 Nov 2026 08:30:00 UTC',
  version: {
    tag: 'v1',
    template: '<p>{{url}}</p>',
    engine: 'handlebars',
    createdAt: 'Tue, 11 Nov 2026 09:00:00 UTC',
    active: true,
    id: `mg-${name}-v1`,
    headers: { Subject: 'Synthetic subject' },
  },
});

const sends = (host) =>
  state.requests.filter(
    (r) => r.host === host && r.method === 'POST' && /\/(mail\/send|messages)$/.test(r.path)
  );

const interpolate = (layout, data) =>
  layout.replace(/<%=\s*([\w.]+)\s*%>/g, (_, path) =>
    String(path.split('.').reduce((value, part) => value?.[part], data) ?? '')
  );

/** users-permissions template(): lodash-style <%= KEY %> interpolation. */
function fakeUsersPermissions() {
  const service = { template: (layout, data) => interpolate(layout, data) };
  return { service: (name) => (name === 'users-permissions' ? service : null), _service: service };
}

/**
 * @strapi/email 5.63 double: send() and sendTemplatedEmail() both end in
 * provider.send(); sendTemplatedEmail renders subject/text/html first.
 */
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
    sendTemplatedEmail: (options, template, data) => {
      const rendered = {};
      for (const field of ['subject', 'text', 'html']) {
        if (template[field]) rendered[field] = interpolate(template[field], data);
      }
      return provider.send({ ...options, ...rendered });
    },
  };
  return { plugin: { provider, service: () => service }, service, nativeSends };
}

const ADMIN_URL = 'https://cms.example.test/admin';
const SERVER_URL = 'https://cms.example.test';
const ADMIN_TEMPLATE = Object.freeze({
  subject: 'Reset password',
  text: 'Reset your password: <%= url %>',
  html: '<p>Reset your password: <a href="<%= url %>"><%= url %></a></p>',
});
const CONFIG = {
  'admin.absoluteUrl': ADMIN_URL,
  'server.absoluteUrl': SERVER_URL,
  'admin.forgotPassword.emailTemplate': ADMIN_TEMPLATE,
  'info.strapi': '5.63.0',
};
const SUPER_ADMIN = { id: 1, roles: [{ code: 'strapi-super-admin' }] };

/** Mirrors @strapi/admin 5.63 services/auth.js forgotPassword(). */
function adminForgotPassword(email, template = ADMIN_TEMPLATE) {
  return email.service.sendTemplatedEmail(
    { to: 'admin@example.test', from: undefined, replyTo: undefined },
    template,
    {
      url: `${ADMIN_URL}/auth/reset-password?code=admintok42`,
      user: { email: 'admin@example.test', firstname: 'Grace', lastname: 'Hopper', username: null },
    }
  );
}

/** Mirrors users-permissions 5.63 sendConfirmationEmail(). */
function sendConfirmation(up, email) {
  const data = {
    URL: `${SERVER_URL}/api/auth/email-confirmation`,
    SERVER_URL,
    ADMIN_URL,
    USER: {
      id: 9,
      documentId: 'user9',
      email: 'new@example.test',
      username: 'new.user',
      confirmed: false,
    },
    CODE: 'conf123',
  };
  const message = up._service.template('<p>Confirm: <%= URL %>?confirmation=<%= CODE %></p>', data);
  const subject = up._service.template('Account confirmation', { USER: data.USER });
  return email.service.send({
    to: 'new@example.test',
    from: undefined,
    replyTo: 'support@example.test',
    subject,
    text: message,
    html: message,
  });
}

/** Mirrors users-permissions 5.63 forgotPassword(). */
function sendReset(up, email, baseUrl = 'https://app.example.test/reset') {
  const data = {
    URL: baseUrl,
    SERVER_URL,
    ADMIN_URL,
    USER: { id: 7, email: 'user@example.test', username: 'user.seven' },
    TOKEN: 'tok123',
  };
  const message = up._service.template('<p>Reset: <%= URL %>?code=<%= TOKEN %></p>', data);
  return email.service.send({
    to: 'user@example.test',
    subject: 'Reset password',
    text: message,
    html: message,
  });
}

/** A harness with interception installed for one provider account. */
async function setup({ accounts, adminUser = { id: 3, preferedLanguage: 'de-AT' }, log } = {}) {
  const up = fakeUsersPermissions();
  const email = emailPluginDouble();
  const db = {
    query: (uid) => ({
      findOne: async () => (uid === 'admin::user' ? adminUser : null),
    }),
  };
  const h = createStrapi({
    accounts,
    emailPlugin: email.plugin,
    usersPermissions: up,
    config: CONFIG,
    db,
    ...(log ? { log } : {}),
  });
  installEmailInterception(h.strapi, log || quietLog);
  await h.service('provider-templates').sync({ force: true });
  return { h, up, email, service: h.service('provider-templates') };
}

// ─── Email confirmation end to end ────────────────────────────────────────

test('email confirmation through a SendGrid template: v1 payload, no designer body', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-confirm', 'Confirm email')];
  const { h, up, email, service } = await setup({ accounts: [sendgridAccount('sg1')] });
  try {
    await service.setCoreDesign(
      'email-confirmation',
      { providerTemplate: 'sendgrid:confirm-email' },
      { id: 1 }
    );
    await sendConfirmation(up, email);
    assert.equal(email.nativeSends.length, 0);
    const json = sends('api.sendgrid.com')[0].json;
    assert.equal(json.template_id, 'd-confirm');
    assert.equal(json.content, undefined, 'no designer body');
    assert.equal(json.subject, undefined, 'the users-permissions subject is not sent');
    const data = json.personalizations[0].dynamic_template_data;
    assert.equal(data.CODE, 'conf123');
    assert.equal(data.code, 'conf123');
    assert.equal(data.url, `${SERVER_URL}/api/auth/email-confirmation?confirmation=conf123`);
    assert.deepEqual(data.user, { id: 9, email: 'new@example.test', username: 'new.user' });
    assert.equal(data.subject, undefined, 'no subject is injected for core mails');
    assert.deepEqual(data.meta, {
      templateKey: 'sendgrid:confirm-email',
      payloadVersion: 1,
      coreEmailType: 'email-confirmation',
      strapiVersion: '5.63.0',
    });
    assert.equal(json.reply_to.email, 'support@example.test', 'Reply-To from Strapi is kept');
    assert.equal(json.from.email, 'noreply@sg1.example.test');
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

test('email confirmation through a Mailgun template: template, t:variables, template subject', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('confirm-email')];
  const { h, up, email, service } = await setup({ accounts: [mailgunAccount('mg1')] });
  try {
    await service.setCoreDesign(
      'email-confirmation',
      { providerTemplate: 'mailgun:confirm-email' },
      { id: 1 }
    );
    await sendConfirmation(up, email);
    assert.equal(email.nativeSends.length, 0);
    const form = Object.fromEntries(sends('api.mailgun.net')[0].form);
    assert.equal(form.template, 'confirm-email');
    assert.equal(form.subject, undefined, 'the Mailgun template Subject header is used');
    assert.equal(form.html, undefined);
    const vars = JSON.parse(form['t:variables']);
    assert.equal(vars.url, `${SERVER_URL}/api/auth/email-confirmation?confirmation=conf123`);
    assert.equal(vars.meta.coreEmailType, 'email-confirmation');
    assert.equal(form['h:Reply-To'], 'support@example.test');
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

// ─── Mailgun core path: password reset and admin forgot password ────────────

test('Mailgun: password reset through the chosen template with the v1 payload', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('reset-password')];
  const { h, up, email, service } = await setup({ accounts: [mailgunAccount('mg1')] });
  try {
    await service.setCoreDesign(
      'reset-password',
      { providerTemplate: 'mailgun:reset-password' },
      { id: 1 }
    );
    await sendReset(up, email);
    const form = Object.fromEntries(sends('api.mailgun.net')[0].form);
    assert.equal(form.template, 'reset-password');
    const vars = JSON.parse(form['t:variables']);
    assert.equal(vars.TOKEN, 'tok123');
    assert.equal(vars.url, 'https://app.example.test/reset?code=tok123');
    assert.deepEqual(vars.USER, { id: 7, email: 'user@example.test', username: 'user.seven' });
    assert.equal(vars.meta.strapiVersion, '5.63.0');
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

test('Mailgun: admin forgot password through the chosen template with payload v1', async () => {
  reset();
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('admin-reset')];
  const { h, email, service } = await setup({ accounts: [mailgunAccount('mg1')] });
  try {
    await assert.rejects(
      service.setCoreDesign(
        'admin-forgot-password',
        { providerTemplate: 'mailgun:admin-reset' },
        { id: 2, roles: [{ code: 'strapi-editor' }] }
      ),
      (error) => error.name === 'ForbiddenError'
    );
    await service.setCoreDesign(
      'admin-forgot-password',
      { providerTemplate: 'mailgun:admin-reset' },
      SUPER_ADMIN
    );
    await adminForgotPassword(email);
    assert.equal(email.nativeSends.length, 0, 'Strapi did not render or send its own body');
    const form = Object.fromEntries(sends('api.mailgun.net')[0].form);
    assert.equal(form.template, 'admin-reset');
    assert.equal(form.to, 'admin@example.test');
    assert.equal(form.subject, undefined);
    assert.deepEqual(JSON.parse(form['t:variables']), {
      user: {
        id: 3,
        email: 'admin@example.test',
        firstname: 'Grace',
        lastname: 'Hopper',
      },
      url: `${ADMIN_URL}/auth/reset-password?code=admintok42`,
      token: 'admintok42',
      adminUrl: ADMIN_URL,
      serverUrl: SERVER_URL,
      meta: {
        templateKey: 'mailgun:admin-reset',
        payloadVersion: 1,
        coreEmailType: 'admin-forgot-password',
        locale: 'de-AT',
        strapiVersion: '5.63.0',
      },
    });
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

test('admin forgot password without a provider template: Strapi renders the local body as before', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-admin', 'Admin reset')];
  const { h, email } = await setup({ accounts: [sendgridAccount('sg1')] });
  try {
    await adminForgotPassword(email);
    const json = sends('api.sendgrid.com')[0].json;
    assert.equal(json.template_id, undefined);
    assert.equal(json.subject, 'Reset password');
    assert.match(json.content[1].value, /admintok42/);
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

test('SendGrid: admin forgot password via template, strict error, opt-in Strapi fallback, events', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-admin', 'Admin reset')];
  const { h, email, service } = await setup({ accounts: [sendgridAccount('sg1')] });
  try {
    await service.setCoreDesign(
      'admin-forgot-password',
      { providerTemplate: 'sendgrid:admin-reset' },
      SUPER_ADMIN
    );
    await adminForgotPassword(email);
    const data = sends('api.sendgrid.com')[0].json.personalizations[0].dynamic_template_data;
    assert.equal(data.token, 'admintok42');
    assert.equal(data.meta.coreEmailType, 'admin-forgot-password');

    // The template disappears: strict by default, nothing else is sent.
    state.sendgrid.us = [];
    await service.sync({ force: true });
    h.events.length = 0;
    await assert.rejects(
      adminForgotPassword(email),
      (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
    );
    assert.equal(sends('api.sendgrid.com').length, 1);
    assert.deepEqual(h.events, [
      {
        name: 'magic-mail.provider-template.failed',
        payload: {
          key: 'sendgrid:admin-reset',
          code: 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE',
          coreEmailType: 'admin-forgot-password',
        },
      },
    ]);

    // Opt-in fallback: the Strapi admin email is rendered and sent instead.
    await service.setCoreDesign(
      'admin-forgot-password',
      { providerTemplate: 'sendgrid:admin-reset', fallbackToDesigner: true },
      SUPER_ADMIN
    );
    h.events.length = 0;
    await adminForgotPassword(email);
    const local = sends('api.sendgrid.com')[1].json;
    assert.equal(local.template_id, undefined);
    assert.equal(local.subject, 'Reset password');
    assert.match(local.content[1].value, /admintok42/);
    assert.deepEqual(
      h.events.map((event) => event.name),
      ['magic-mail.provider-template.failed', 'magic-mail.provider-template.fallback']
    );
    assert.deepEqual(h.events[1].payload, {
      key: 'sendgrid:admin-reset',
      code: 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE',
      coreEmailType: 'admin-forgot-password',
      fallback: 'designer',
    });
    const serialized = JSON.stringify(h.events);
    assert.equal(serialized.includes('admin@example.test'), false, 'no addresses in events');
    assert.equal(serialized.includes('admintok42'), false, 'no tokens in events');
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

// ─── Missing url warning ─────────────────────────────────────────────────

test('a core mail whose base URL is not absolute warns once and sends url ""', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-reset', 'Reset password')];
  const warnings = [];
  const log = { ...quietLog, warn: (message) => warnings.push(String(message)) };
  const { h, up, email, service } = await setup({ accounts: [sendgridAccount('sg1')], log });
  try {
    await service.setCoreDesign(
      'reset-password',
      { providerTemplate: 'sendgrid:reset-password' },
      { id: 1 }
    );
    await sendReset(up, email, 'null');
    await sendReset(up, email, '/relative/reset');
    const first = sends('api.sendgrid.com')[0].json.personalizations[0].dynamic_template_data;
    assert.equal(first.url, '');
    const urlWarnings = warnings.filter((message) => message.includes('"url" can not be built'));
    assert.equal(urlWarnings.length, 1, 'warned once per process and core mail');
    assert.match(urlWarnings[0], /reset-password/);
    assert.equal(urlWarnings[0].includes('tok123'), false);
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});

// ─── SendGrid subject injection ────────────────────────────────────────────

test('SendGrid: a passed subject becomes dynamic_template_data.subject unless data sets one', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-news', 'News')];
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });
  const router = h.service('email-router');

  await router.send({
    to: 'a@example.test',
    providerTemplate: 'sendgrid:news',
    subject: 'Per-mail subject\r\nBcc: x@example.test',
    data: { name: 'Ada' },
  });
  let json = sends('api.sendgrid.com')[0].json;
  assert.deepEqual(json.personalizations[0].dynamic_template_data, {
    name: 'Ada',
    subject: 'Per-mail subjectBcc: x@example.test',
  });

  await router.send({
    to: 'a@example.test',
    providerTemplate: 'sendgrid:news',
    subject: 'Ignored',
    data: { subject: 'From data' },
  });
  json = sends('api.sendgrid.com')[1].json;
  assert.equal(json.personalizations[0].dynamic_template_data.subject, 'From data');

  await router.send({ to: 'a@example.test', providerTemplate: 'sendgrid:news', data: {} });
  json = sends('api.sendgrid.com')[2].json;
  assert.deepEqual(json.personalizations[0].dynamic_template_data, {});
});

// ─── Startup check ─────────────────────────────────────────────────────────

test('startup check: syncs a stale list, warns with key and code, stores the result', async () => {
  reset();
  state.sendgrid.us = [sgTemplate('d-reset', 'Reset password')];
  state.mailgun.us.domains['mg.example.test'] = [mgTemplate('admin-reset')];
  const warnings = [];
  const log = { ...quietLog, warn: (message) => warnings.push(String(message)) };
  const h = createStrapi({ accounts: [sendgridAccount('sg1'), mailgunAccount('mg1')], log });
  const service = h.service('provider-templates');
  await service.sync({ force: true });
  await service.setCoreDesign(
    'reset-password',
    { providerTemplate: 'sendgrid:reset-password' },
    { id: 1 }
  );
  await service.setCoreDesign(
    'admin-forgot-password',
    { providerTemplate: 'mailgun:admin-reset' },
    SUPER_ADMIN
  );
  // A key that was never synced (for example typed into a restored database).
  await service.updateState((current) => ({
    ...current,
    coreMails: {
      ...current.coreMails,
      'email-confirmation': { providerTemplate: 'sendgrid:never-synced' },
    },
  }));

  // The Mailgun template is deleted at the provider; the last sync is stale.
  state.mailgun.us.domains['mg.example.test'] = [];
  await service.updateState((current) => ({
    ...current,
    lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  }));
  const syncRequestsBefore = state.requests.filter((r) => r.method === 'GET').length;

  await bootstrap.checkCoreDesignsAtStart(h.strapi, log);

  assert.ok(
    state.requests.filter((r) => r.method === 'GET').length > syncRequestsBefore,
    'the stale list was synced'
  );
  const problems = warnings.filter((message) => message.includes('Core email'));
  assert.equal(problems.length, 2);
  assert.ok(
    problems.some(
      (m) =>
        m.includes('admin-forgot-password') &&
        m.includes('mailgun:admin-reset') &&
        m.includes('MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE')
    )
  );
  assert.ok(
    problems.some(
      (m) =>
        m.includes('email-confirmation') &&
        m.includes('sendgrid:never-synced') &&
        m.includes('MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN')
    )
  );
  const designs = await service.coreDesigns(SUPER_ADMIN);
  assert.equal(designs['reset-password'].usable, true);
  assert.equal(designs['reset-password'].problem, null);
  assert.equal(
    designs['admin-forgot-password'].problem,
    'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE'
  );
  assert.equal(designs['email-confirmation'].problem, 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN');
  assert.ok(Date.parse(designs['admin-forgot-password'].checkedAt) > 0);
  assert.equal(designs['admin-forgot-password'].editable, true);
  const stored = (await service.getState()).coreCheck;
  assert.equal(stored.problems.length, 2);

  // A fresh list is not synced again.
  const before = state.requests.length;
  const fresh = await service.checkCoreDesigns({ syncIfStale: true });
  assert.equal(fresh.synced, false);
  assert.equal(state.requests.length, before);
});

test('startup check without provider-template core emails does nothing', async () => {
  reset();
  const h = createStrapi({ accounts: [sendgridAccount('sg1')] });
  const result = await h.service('provider-templates').checkCoreDesigns();
  assert.deepEqual(result, { checkedAt: null, synced: false, syncError: null, problems: [] });
  assert.equal(state.requests.length, 0);
});

test('a Mailgun template without Subject header is reported as unusable for core emails', async () => {
  reset();
  const noSubject = mgTemplate('plain');
  noSubject.version.headers = {};
  state.mailgun.us.domains['mg.example.test'] = [noSubject];
  const warnings = [];
  const log = { ...quietLog, warn: (message) => warnings.push(String(message)) };
  const { h, up, email, service } = await setup({ accounts: [mailgunAccount('mg1')], log });
  try {
    await service.setCoreDesign('reset-password', { providerTemplate: 'mailgun:plain' }, { id: 1 });
    const designs = await service.coreDesigns();
    assert.equal(designs['reset-password'].usable, false);
    assert.equal(designs['reset-password'].problem, 'MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT');
    const result = await service.checkCoreDesigns({ syncIfStale: false });
    assert.deepEqual(result.problems, [
      {
        coreEmailType: 'reset-password',
        key: 'mailgun:plain',
        code: 'MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT',
      },
    ]);
    assert.ok(warnings.some((m) => m.includes('MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT')));
    // The send fails before anything reaches Mailgun (strict default).
    await assert.rejects(
      sendReset(up, email),
      (error) => error.code === 'MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT'
    );
    assert.equal(sends('api.mailgun.net').length, 0);
  } finally {
    uninstallEmailInterception(h.strapi);
  }
});
