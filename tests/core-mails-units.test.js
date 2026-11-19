'use strict';

// Units for the core-mail additions of Strapi RFC #27752: the
// admin-forgot-password payload v1, meta.strapiVersion, the admin
// sendTemplatedEmail recognition, sample data for every core type and the
// provider-template event payload. Synthetic data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CORE_EMAIL_TYPES,
  buildCoreMailPayload,
  coreMailVariableNames,
} = require('../server/src/utils/core-mail-payload');
const { adminForgotPasswordMail } = require('../server/src/bootstrap');
const { emitProviderTemplateEvent } = require('../server/src/utils/provider-template-events');
const { createStrapi } = require('./helpers/provider-template-strapi');

const ADMIN_URL = 'https://cms.example.test/admin';
const TEMPLATE = { subject: 's', text: 't' };
const strapiWith = (config) => ({
  config: { get: (key) => config[key] },
});

test('core email types include the admin forgot-password mail', () => {
  assert.deepEqual(CORE_EMAIL_TYPES, [
    'reset-password',
    'email-confirmation',
    'admin-forgot-password',
  ]);
});

test('admin forgot-password payload v1: user allowlist, built url, token, URLs, meta', () => {
  const payload = buildCoreMailPayload(
    'admin-forgot-password',
    {
      url: `${ADMIN_URL}/auth/reset-password?code=abc123`,
      user: {
        id: 4,
        email: 'a@example.test',
        firstname: 'Ada',
        lastname: 'Lovelace',
        username: 'ada',
        password: 'never',
        resetPasswordToken: 'never',
      },
      adminUrl: ADMIN_URL,
      serverUrl: 'https://cms.example.test',
    },
    { templateKey: 'sendgrid:admin-reset', locale: 'fr', strapiVersion: '5.63.0' }
  );
  assert.deepEqual(payload, {
    user: {
      id: 4,
      email: 'a@example.test',
      username: 'ada',
      firstname: 'Ada',
      lastname: 'Lovelace',
    },
    url: `${ADMIN_URL}/auth/reset-password?code=abc123`,
    token: 'abc123',
    adminUrl: ADMIN_URL,
    serverUrl: 'https://cms.example.test',
    meta: {
      templateKey: 'sendgrid:admin-reset',
      payloadVersion: 1,
      coreEmailType: 'admin-forgot-password',
      locale: 'fr',
      strapiVersion: '5.63.0',
    },
  });
});

test('admin forgot-password: a relative or invalid link gives url "" and no token', () => {
  for (const url of ['/admin/auth/reset-password?code=x', 'javascript:alert(1)', '', null]) {
    const payload = buildCoreMailPayload('admin-forgot-password', { url, user: {} }, {});
    assert.equal(payload.url, '');
    assert.equal(payload.token, '');
  }
});

test('meta.strapiVersion is additive: omitted when unknown, existing keys unchanged', () => {
  const captured = {
    URL: 'https://app.example.test/reset',
    USER: { id: 1, email: 'u@example.test' },
    TOKEN: 't',
  };
  const without = buildCoreMailPayload('reset-password', captured, { templateKey: 'k' });
  assert.deepEqual(Object.keys(without.meta), ['templateKey', 'payloadVersion', 'coreEmailType']);
  const withVersion = buildCoreMailPayload('reset-password', captured, {
    templateKey: 'k',
    strapiVersion: '5.63.0',
  });
  assert.equal(withVersion.meta.strapiVersion, '5.63.0');
  const { meta: a, ...restA } = without;
  const { meta: b, ...restB } = withVersion;
  assert.deepEqual(restA, restB);
  assert.equal(a.payloadVersion, b.payloadVersion);
});

test('variable names for the admin mail list the v1 keys only', () => {
  const names = coreMailVariableNames('admin-forgot-password');
  for (const name of ['user', 'user.email', 'url', 'token', 'adminUrl', 'serverUrl', 'meta']) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(names.includes('meta.strapiVersion'));
  assert.equal(names.includes('TOKEN'), false);
  assert.ok(coreMailVariableNames('reset-password').includes('meta.strapiVersion'));
});

test('admin sendTemplatedEmail call is recognised by template identity or reset link', () => {
  const strapi = strapiWith({
    'admin.absoluteUrl': ADMIN_URL,
    'server.absoluteUrl': 'https://cms.example.test',
    'admin.forgotPassword.emailTemplate': TEMPLATE,
  });
  const data = { url: `${ADMIN_URL}/auth/reset-password?code=x`, user: { email: 'a@x.test' } };
  const options = { to: 'a@x.test' };

  assert.deepEqual(adminForgotPasswordMail(strapi, [options, TEMPLATE, data]), {
    url: data.url,
    user: data.user,
    adminUrl: ADMIN_URL,
    serverUrl: 'https://cms.example.test',
  });
  // A custom template object configured elsewhere: the reset link decides.
  assert.ok(adminForgotPasswordMail(strapi, [options, { subject: 'x', text: 'y' }, data]));
  // Same template, but the host overrode admin.url between calls: identity decides.
  assert.ok(
    adminForgotPasswordMail(strapi, [
      options,
      TEMPLATE,
      { url: 'https://other.example.test/x?code=1', user: {} },
    ])
  );
});

test('other sendTemplatedEmail calls are not treated as the admin mail', () => {
  const strapi = strapiWith({
    'admin.absoluteUrl': ADMIN_URL,
    'admin.forgotPassword.emailTemplate': TEMPLATE,
  });
  const other = { subject: 'Welcome', text: 'Hi' };
  const cases = [
    [{ to: 'a@x.test' }, other, { url: 'https://app.example.test/welcome', user: {} }],
    [{ to: 'a@x.test' }, other, { url: `${ADMIN_URL}/auth/login`, user: {} }],
    [
      { to: 'a@x.test' },
      TEMPLATE,
      { url: `${ADMIN_URL}/auth/reset-password?code=x`, user: {}, extra: 1 },
    ],
    [{ to: 'a@x.test' }, TEMPLATE, { url: `${ADMIN_URL}/auth/reset-password?code=x` }],
    [{ to: 'a@x.test' }, TEMPLATE, { url: 42, user: {} }],
    [{ to: 'a@x.test' }, TEMPLATE, null],
    [null, TEMPLATE, { url: `${ADMIN_URL}/auth/reset-password?code=x`, user: {} }],
  ];
  for (const args of cases) assert.equal(adminForgotPasswordMail(strapi, args), null);
});

test('test-send sample data covers every core mail that uses the template', () => {
  const h = createStrapi();
  const service = h.service('provider-templates');
  const sample = service.sampleData(
    { key: 'sendgrid:shared', usedByCoreMails: ['reset-password', 'admin-forgot-password'] },
    'me@example.test'
  );
  assert.equal(sample.TOKEN, 'sample-token', 'reset-password variables');
  assert.equal(sample.adminUrl, 'https://api.example.test/admin');
  assert.equal(sample.user.email, 'me@example.test');
  assert.equal(
    sample.meta.coreEmailType,
    'reset-password',
    'the first core mail wins shared names'
  );
  assert.equal(sample.name, 'Test User');

  const confirmAndAdmin = service.sampleData(
    { key: 'sendgrid:shared', usedByCoreMails: ['email-confirmation', 'admin-forgot-password'] },
    'me@example.test'
  );
  assert.equal(confirmAndAdmin.CODE, 'sample-code');
  assert.equal(confirmAndAdmin.token, 'sample-token', 'admin token present as well');
  assert.match(confirmAndAdmin.url, /confirmation=sample-code/);

  const plain = service.sampleData({ key: 'sendgrid:x', usedByCoreMails: [] }, 'me@example.test');
  assert.deepEqual(plain, { name: 'Test User', email: 'me@example.test' });
});

test('provider-template events carry key, code and labels only', async () => {
  const events = [];
  const strapi = { eventHub: { emit: async (name, payload) => events.push({ name, payload }) } };
  await emitProviderTemplateEvent(strapi, 'failed', {
    key: 'mailgun:x',
    code: 'HTTP_404',
    coreEmailType: null,
    to: 'leak@example.test',
    data: { token: 'leak' },
  });
  assert.deepEqual(events, [
    {
      name: 'magic-mail.provider-template.failed',
      payload: { key: 'mailgun:x', code: 'HTTP_404', coreEmailType: null },
    },
  ]);

  const warnings = [];
  await emitProviderTemplateEvent(
    {
      log: { warn: (message) => warnings.push(message) },
      eventHub: {
        emit: async () => {
          throw new Error('listener');
        },
      },
    },
    'fallback',
    { key: 'k', code: null }
  );
  assert.equal(warnings.length, 1, 'a failing listener is logged, never thrown');
  await emitProviderTemplateEvent({}, 'failed', { key: 'k', code: null });
});

test('the admin forgot-password design is editable by super admins only', async () => {
  const h = createStrapi();
  const service = h.service('provider-templates');
  const editor = { id: 2, roles: [{ code: 'strapi-editor' }] };
  const designs = await service.coreDesigns(editor);
  assert.equal(designs['admin-forgot-password'].editable, false);
  assert.equal(designs['reset-password'].editable, true);
  assert.equal(designs['admin-forgot-password'].mode, 'designer');
  assert.equal((await service.coreDesigns())['reset-password'].editable, undefined);
  await assert.rejects(
    service.setCoreDesign('admin-forgot-password', { providerTemplate: null }, editor),
    (error) => error.name === 'ForbiddenError'
  );
});
