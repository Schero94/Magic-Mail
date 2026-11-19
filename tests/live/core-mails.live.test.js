'use strict';

// Opt-in live suite for the core emails (Strapi RFC #27752) against the REAL
// SendGrid and Mailgun APIs: email confirmation, password reset and the admin
// password reset routed through provider templates, the SendGrid subject
// injection and the startup check.
//
// Run:   npm run test:live            (with the other live suites)
//        LIVE_PROVIDERS=sendgrid,mailgun node --test tests/live/core-mails.live.test.js
// Needs the same ~/.config/magic-mail-live/.env as provider-templates.live.test.js
// (SENDGRID_API_KEY, SENDGRID_FROM, SENDGRID_TEMPLATE_ID, MAILGUN_API_KEY,
// MAILGUN_DOMAIN, MAILGUN_REGION, MAILGUN_TEMPLATE, LIVE_TEST_RECIPIENT). The
// SendGrid key needs Template Engine write access and the Mailgun key template
// write access: this suite creates two synthetic templates
// (`magic-mail-live-core-<random>`) and deletes them again in `after`.
//
// Nothing is delivered: SendGrid sends run in sandbox mode and Mailgun sends
// with o:testmode=yes (forced by installLiveFetch). Values are never printed.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PROVIDERS, installLiveFetch, loadLiveConfig } = require('../helpers/live-env');

const { env, skipReason } = loadLiveConfig({
  sendgrid: ['SENDGRID_API_KEY', 'SENDGRID_FROM', 'SENDGRID_TEMPLATE_ID', 'LIVE_TEST_RECIPIENT'],
  mailgun: [
    'MAILGUN_API_KEY',
    'MAILGUN_DOMAIN',
    'MAILGUN_REGION',
    'MAILGUN_TEMPLATE',
    'LIVE_TEST_RECIPIENT',
  ],
});

const ready = PROVIDERS.filter((provider) => !skipReason(provider));
for (const provider of PROVIDERS) {
  const reason = skipReason(provider);
  if (reason) console.log(`live core-mail suite: ${provider} tests skipped: ${reason}`);
}
const liveFor = (provider) => (name, fn) => test(name, { skip: skipReason(provider) || false }, fn);
const liveSendGrid = liveFor('sendgrid');
const liveMailgun = liveFor('mailgun');

const SUBJECT = 'Magic Mail live test (can be deleted)';
const SYNTHETIC = `magic-mail-live-core-${crypto.randomBytes(4).toString('hex')}`;
const ADMIN_URL = 'https://cms.example.test/admin';
const SERVER_URL = 'https://cms.example.test';
const ADMIN_TEMPLATE = Object.freeze({ subject: 'Reset password', text: 'Reset: <%= url %>' });
const SUPER_ADMIN = { id: 1, roles: [{ code: 'strapi-super-admin' }] };

const sgHost = () => (env.SENDGRID_REGION === 'eu' ? 'api.eu.sendgrid.com' : 'api.sendgrid.com');
const mgHost = () => (env.MAILGUN_REGION === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net');
const sgAuth = () => ({ Authorization: `Bearer ${env.SENDGRID_API_KEY}` });
const mgAuth = () => ({
  Authorization: `Basic ${Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString('base64')}`,
});

let live;
let previousKey;
const created = { sendgridId: null, mailgunName: null };
const cleanup = { sendgrid: null, mailgun: null };

/** Creates the synthetic SendGrid dynamic template whose subject is {{subject}}. */
async function createSendGridTemplate() {
  const response = await fetch(`https://${sgHost()}/v3/templates`, {
    method: 'POST',
    headers: { ...sgAuth(), 'content-type': 'application/json' },
    body: JSON.stringify({ name: SYNTHETIC, generation: 'dynamic' }),
  });
  assert.equal(response.status, 201, 'SendGrid template created (Template Engine write access)');
  const { id } = await response.json();
  created.sendgridId = id;
  const version = await fetch(`https://${sgHost()}/v3/templates/${id}/versions`, {
    method: 'POST',
    headers: { ...sgAuth(), 'content-type': 'application/json' },
    body: JSON.stringify({
      template_id: id,
      active: 1,
      name: 'v1',
      subject: '{{subject}}',
      html_content: '<p>{{name}} {{url}}</p>',
      plain_content: '{{name}} {{url}}',
    }),
  });
  assert.equal(version.status, 201, 'SendGrid template version created');
}

/** Creates the synthetic Mailgun domain template with a Subject header. */
async function createMailgunTemplate() {
  const form = new FormData();
  form.set('name', SYNTHETIC);
  form.set('description', SUBJECT);
  form.set('template', '<p>{{url}} {{user.email}} {{meta.coreEmailType}}</p>');
  form.set('engine', 'handlebars');
  form.set('tag', 'v1');
  form.set('headers', JSON.stringify({ Subject: SUBJECT }));
  const response = await fetch(
    `https://${mgHost()}/v3/${encodeURIComponent(env.MAILGUN_DOMAIN)}/templates`,
    { method: 'POST', headers: mgAuth(), body: form }
  );
  assert.equal(response.status, 200, 'Mailgun template created (template write access)');
  created.mailgunName = SYNTHETIC;
}

test.before(async () => {
  if (ready.length === 0) return;
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  live = installLiveFetch();
  if (ready.includes('sendgrid')) await createSendGridTemplate();
  if (ready.includes('mailgun')) await createMailgunTemplate();
});

test.after(async () => {
  if (ready.length === 0) return;
  // Restore the accounts: delete both synthetic templates and confirm.
  if (created.sendgridId) {
    const response = await fetch(`https://${sgHost()}/v3/templates/${created.sendgridId}`, {
      method: 'DELETE',
      headers: sgAuth(),
    });
    const check = await fetch(`https://${sgHost()}/v3/templates/${created.sendgridId}`, {
      headers: sgAuth(),
    });
    cleanup.sendgrid = { deleteStatus: response.status, afterStatus: check.status };
  }
  if (created.mailgunName) {
    const path = `/v3/${encodeURIComponent(env.MAILGUN_DOMAIN)}/templates/${created.mailgunName}`;
    const response = await fetch(`https://${mgHost()}${path}`, {
      method: 'DELETE',
      headers: mgAuth(),
    });
    const check = await fetch(`https://${mgHost()}${path}`, { headers: mgAuth() });
    cleanup.mailgun = { deleteStatus: response.status, afterStatus: check.status };
  }
  live.restore();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  console.log(JSON.stringify({ cleanup, liveRequests: live.results }, null, 1));
  if (cleanup.sendgrid) assert.equal(cleanup.sendgrid.afterStatus, 404, 'SendGrid cleanup');
  if (cleanup.mailgun) assert.equal(cleanup.mailgun.afterStatus, 404, 'Mailgun cleanup');
});

const interpolate = (layout, data) =>
  layout.replace(/<%=\s*([\w.]+)\s*%>/g, (_, path) =>
    String(path.split('.').reduce((value, part) => value?.[part], data) ?? '')
  );

let h;
let email;
let up;
/** Strapi harness with interception, one live account per ready provider. */
function harness() {
  if (h) return h;
  const { createStrapi, quietLog } = require('../helpers/provider-template-strapi');
  const { encryptCredentials } = require('../../server/src/utils/encryption');
  const { installEmailInterception } = require('../../server/src/bootstrap');
  const accounts = [];
  if (ready.includes('sendgrid')) {
    accounts.push({
      documentId: 'live-sendgrid',
      name: 'live-sendgrid',
      provider: 'sendgrid',
      fromEmail: env.SENDGRID_FROM,
      isActive: true,
      priority: 5,
      config: encryptCredentials({
        apiKey: env.SENDGRID_API_KEY,
        region: env.SENDGRID_REGION === 'eu' ? 'eu' : 'us',
      }),
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
        region: env.MAILGUN_REGION === 'eu' ? 'eu' : 'us',
      }),
    });
  }
  const nativeSends = [];
  const provider = {
    send: async (options) => {
      nativeSends.push(options);
      return { messageId: 'native' };
    },
  };
  const service = {
    send: (options) => provider.send(options),
    sendTemplatedEmail: (options, template, data) =>
      provider.send({
        ...options,
        subject: interpolate(template.subject, data),
        text: interpolate(template.text, data),
      }),
  };
  email = { service, nativeSends };
  const upService = { template: (layout, data) => interpolate(layout, data) };
  up = upService;
  h = createStrapi({
    accounts,
    emailPlugin: { provider, service: () => service },
    usersPermissions: { service: (name) => (name === 'users-permissions' ? upService : null) },
    config: {
      'admin.absoluteUrl': ADMIN_URL,
      'server.absoluteUrl': SERVER_URL,
      'admin.forgotPassword.emailTemplate': ADMIN_TEMPLATE,
      'info.strapi': '5.63.0',
    },
    db: { query: () => ({ findOne: async () => ({ id: 1, preferedLanguage: 'en' }) }) },
  });
  installEmailInterception(h.strapi, quietLog);
  return h;
}

let syncPromise;
const syncOnce = () => {
  syncPromise ??= harness().service('provider-templates').sync({ force: true });
  return syncPromise;
};
const rowKey = (predicate) =>
  harness().tables['plugin::magic-mail.provider-template'].find(predicate)?.key;

/** users-permissions sendConfirmationEmail(), live recipient, synthetic user. */
function confirmEmail() {
  const data = {
    URL: `${SERVER_URL}/api/auth/email-confirmation`,
    SERVER_URL,
    ADMIN_URL,
    USER: { id: 9, email: env.LIVE_TEST_RECIPIENT, username: 'live.user' },
    CODE: crypto.randomBytes(8).toString('hex'),
  };
  const body = up.template('<p><%= URL %>?confirmation=<%= CODE %></p>', data);
  return email.service.send({
    to: env.LIVE_TEST_RECIPIENT,
    subject: 'Account confirmation',
    text: body,
    html: body,
  });
}

/** users-permissions forgotPassword(). */
function resetPassword() {
  const data = {
    URL: 'https://app.example.test/reset',
    SERVER_URL,
    ADMIN_URL,
    USER: { id: 9, email: env.LIVE_TEST_RECIPIENT, username: 'live.user' },
    TOKEN: crypto.randomBytes(8).toString('hex'),
  };
  const body = up.template('<p><%= URL %>?code=<%= TOKEN %></p>', data);
  return email.service.send({
    to: env.LIVE_TEST_RECIPIENT,
    subject: 'Reset password',
    text: body,
    html: body,
  });
}

/** @strapi/admin forgotPassword(). */
function adminForgotPassword() {
  return email.service.sendTemplatedEmail(
    { to: env.LIVE_TEST_RECIPIENT, from: undefined, replyTo: undefined },
    ADMIN_TEMPLATE,
    {
      url: `${ADMIN_URL}/auth/reset-password?code=${crypto.randomBytes(8).toString('hex')}`,
      user: { email: env.LIVE_TEST_RECIPIENT, firstname: 'Live', lastname: 'Test' },
    }
  );
}

const CORE_SENDS = [
  ['email-confirmation', confirmEmail],
  ['reset-password', resetPassword],
  ['admin-forgot-password', adminForgotPassword],
];

// ── SendGrid ──────────────────────────────────────────────────────────────

liveSendGrid('SendGrid: core emails go through the real dynamic template (sandbox)', async () => {
  await syncOnce();
  const key = rowKey((r) => r.provider === 'sendgrid' && r.remoteId === env.SENDGRID_TEMPLATE_ID);
  assert.ok(key, 'SENDGRID_TEMPLATE_ID synced');
  const service = harness().service('provider-templates');
  for (const [type, send] of CORE_SENDS) {
    await service.setCoreDesign(type, { providerTemplate: key }, SUPER_ADMIN);
    const result = await send();
    assert.equal(result.success, true, `${type} accepted by SendGrid`);
    const body = live.sent.sendgrid.at(-1);
    assert.equal(body.template_id, env.SENDGRID_TEMPLATE_ID);
    assert.equal(body.mail_settings.sandbox_mode.enable, true);
    const data = body.personalizations[0].dynamic_template_data;
    assert.equal(data.meta.coreEmailType, type);
    assert.equal(data.meta.payloadVersion, 1);
    assert.equal(data.meta.strapiVersion, '5.63.0');
    assert.match(data.url, /^https:\/\//);
    assert.equal(body.content, undefined, `${type}: no designer body`);
    await service.setCoreDesign(type, { providerTemplate: null }, SUPER_ADMIN);
  }
  assert.equal(email.nativeSends.length, 0);
});

liveSendGrid('SendGrid: a passed subject reaches a {{subject}} template (sandbox)', async () => {
  await syncOnce();
  const key = rowKey((r) => r.provider === 'sendgrid' && r.remoteId === created.sendgridId);
  assert.ok(key, 'synthetic SendGrid template synced');
  const detail = await harness().service('provider-templates').detail(key);
  assert.ok(
    detail.variables.some((v) => v.path === 'subject'),
    'variable detection finds {{subject}} in the real template'
  );
  const result = await harness()
    .service('email-router')
    .send({
      to: env.LIVE_TEST_RECIPIENT,
      providerTemplate: key,
      subject: SUBJECT,
      data: { name: 'Live Test', url: 'https://example.test' },
    });
  assert.equal(result.success, true);
  const body = live.sent.sendgrid.at(-1);
  assert.equal(body.template_id, created.sendgridId);
  assert.equal(body.personalizations[0].dynamic_template_data.subject, SUBJECT);
});

// ── Mailgun ───────────────────────────────────────────────────────────────

liveMailgun(
  'Mailgun: core emails go through a real template with Subject header (test mode)',
  async () => {
    await syncOnce();
    const key = rowKey((r) => r.provider === 'mailgun' && r.name === created.mailgunName);
    assert.ok(key, 'synthetic Mailgun template synced');
    const service = harness().service('provider-templates');
    assert.equal(
      (await service.overview()).templates.find((t) => t.key === key).subject,
      SUBJECT,
      'the Subject header was synced'
    );
    for (const [type, send] of CORE_SENDS) {
      await service.setCoreDesign(type, { providerTemplate: key }, SUPER_ADMIN);
      const result = await send();
      assert.equal(result.success, true, `${type} accepted by Mailgun`);
      const form = Object.fromEntries(live.sent.mailgun.at(-1));
      assert.equal(form.template, created.mailgunName);
      assert.equal(form['o:testmode'], 'yes');
      assert.equal(form.subject, undefined, 'the template Subject header is used');
      const vars = JSON.parse(form['t:variables']);
      assert.equal(vars.meta.coreEmailType, type);
      assert.match(vars.url, /^https:\/\//);
      await service.setCoreDesign(type, { providerTemplate: null }, SUPER_ADMIN);
    }
    assert.equal(email.nativeSends.length, 0);
  }
);

liveMailgun('Mailgun: the startup check flags a real template without Subject header', async () => {
  await syncOnce();
  const service = harness().service('provider-templates');
  const plain = rowKey((r) => r.provider === 'mailgun' && r.name === env.MAILGUN_TEMPLATE);
  const synthetic = rowKey((r) => r.provider === 'mailgun' && r.name === created.mailgunName);
  const plainRow = (await service.overview()).templates.find((t) => t.key === plain);
  await service.setCoreDesign('reset-password', { providerTemplate: synthetic }, SUPER_ADMIN);
  await service.setCoreDesign('admin-forgot-password', { providerTemplate: plain }, SUPER_ADMIN);
  const result = await service.checkCoreDesigns({ syncIfStale: false });
  const flagged = result.problems.map((p) => `${p.coreEmailType}:${p.code}`);
  if (plainRow.subject) {
    assert.deepEqual(flagged, [], 'MAILGUN_TEMPLATE has a Subject header: nothing to flag');
  } else {
    assert.deepEqual(flagged, ['admin-forgot-password:MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT']);
  }
  await service.setCoreDesign('reset-password', { providerTemplate: null }, SUPER_ADMIN);
  await service.setCoreDesign('admin-forgot-password', { providerTemplate: null }, SUPER_ADMIN);
});
