'use strict';

// Unit tests for the provider-template mappers: core-mail payload v1, the
// core-mail capture, provider API helpers, key slugs, the HTML design copy
// and the admin controller contract. Synthetic data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  allowlistUser,
  buildCoreLink,
  buildCoreMailPayload,
  coreEmailTypeFromData,
  coreMailVariableNames,
  createCoreMailCapture,
} = require('../server/src/utils/core-mail-payload');
const {
  codeForStatus,
  pageParam,
  resolveSendGridRegion,
  sendGridApiBaseUrl,
  toIso,
} = require('../server/src/utils/provider-api');
const { slugify, isProviderTemplateKey } = require('../server/src/services/provider-templates');
const { buildHtmlDesign, extractBodyWithStyles } = require('../server/src/utils/html-design');

test('USER is reduced to id, email, username, firstname and lastname', () => {
  assert.deepEqual(
    allowlistUser({
      id: 3,
      documentId: 'abc',
      email: 'u@example.test',
      username: 'u',
      password: 'hash',
      resetPasswordToken: 'secret',
      role: { id: 1 },
      firstname: '',
      lastname: 'Muster',
    }),
    { id: 3, email: 'u@example.test', username: 'u', lastname: 'Muster' }
  );
  assert.deepEqual(allowlistUser(null), {});
  assert.deepEqual(allowlistUser('x'), {});
});

test('core links are built with URL/searchParams and keep an existing query', () => {
  assert.equal(
    buildCoreLink('reset-password', 'https://app.example.test/reset', 'a b&c'),
    'https://app.example.test/reset?code=a+b%26c'
  );
  assert.equal(
    buildCoreLink(
      'email-confirmation',
      'https://api.example.test/api/auth/email-confirmation?x=1',
      'c1'
    ),
    'https://api.example.test/api/auth/email-confirmation?x=1&confirmation=c1'
  );
  assert.equal(buildCoreLink('reset-password', '/relative', 't'), '');
  assert.equal(buildCoreLink('reset-password', 'javascript:alert(1)', 't'), '');
  assert.equal(buildCoreLink('reset-password', '', 't'), '');
});

test('payload v1 keeps the users-permissions names and adds camelCase aliases and meta', () => {
  const payload = buildCoreMailPayload(
    'email-confirmation',
    {
      URL: 'https://api.example.test/api/auth/email-confirmation',
      SERVER_URL: 'https://api.example.test',
      ADMIN_URL: 'https://api.example.test/admin',
      USER: { id: 1, email: 'u@example.test', username: 'u', password: 'x' },
      CODE: 'c0de',
    },
    { templateKey: 'mailgun:confirm', locale: 'de' }
  );
  assert.deepEqual(Object.keys(payload).sort(), [
    'ADMIN_URL',
    'CODE',
    'SERVER_URL',
    'URL',
    'USER',
    'adminUrl',
    'baseUrl',
    'code',
    'meta',
    'serverUrl',
    'url',
    'user',
  ]);
  assert.equal(
    payload.url,
    'https://api.example.test/api/auth/email-confirmation?confirmation=c0de'
  );
  assert.deepEqual(payload.meta, {
    templateKey: 'mailgun:confirm',
    payloadVersion: 1,
    coreEmailType: 'email-confirmation',
    locale: 'de',
  });
  assert.equal(payload.USER.password, undefined);
  assert.equal(payload.TOKEN, undefined);
  assert.throws(() => buildCoreMailPayload('welcome', {}), TypeError);
  assert.ok(coreMailVariableNames('reset-password').includes('TOKEN'));
  assert.ok(coreMailVariableNames('email-confirmation').includes('code'));
});

test('the core-mail capture remembers rendered bodies once, bounded and with expiry', () => {
  let now = 1_000;
  const capture = createCoreMailCapture({ now: () => now });
  assert.equal(coreEmailTypeFromData({ TOKEN: 't' }), 'reset-password');
  assert.equal(coreEmailTypeFromData({ CODE: 'c' }), 'email-confirmation');
  assert.equal(coreEmailTypeFromData({ USER: {} }), null);

  assert.equal(capture.remember('Reset password', { USER: { id: 1 } }), false, 'subject render');
  assert.equal(
    capture.remember('<p>body</p>', { TOKEN: 't', USER: { id: 1, password: 'p' } }),
    true
  );
  assert.equal(capture.take('<p>other</p>'), null);
  const hit = capture.take('<p>body</p>');
  assert.equal(hit.coreEmailType, 'reset-password');
  assert.deepEqual(hit.data.USER, { id: 1 });
  assert.equal(capture.take('<p>body</p>'), null, 'used once');

  capture.remember('<p>late</p>', { CODE: 'c' });
  now += 5 * 60 * 1000 + 1;
  assert.equal(capture.take('<p>late</p>'), null, 'expired');

  for (let i = 0; i < 600; i += 1) capture.remember(`<p>${i}</p>`, { TOKEN: String(i) });
  assert.ok(capture.size() <= 500);
});

test('provider API helpers: regions, status codes, page parameters and dates', () => {
  assert.equal(resolveSendGridRegion(undefined), 'us');
  assert.equal(resolveSendGridRegion('eu'), 'eu');
  assert.equal(resolveSendGridRegion('evil.example'), null);
  assert.equal(sendGridApiBaseUrl('eu'), 'https://api.eu.sendgrid.com');
  assert.equal(codeForStatus(401), 'AUTH');
  assert.equal(codeForStatus(403), 'AUTH');
  assert.equal(codeForStatus(404), 'NOT_FOUND');
  assert.equal(codeForStatus(429), 'RATE_LIMITED');
  assert.equal(codeForStatus(503), 'UNAVAILABLE');
  assert.equal(codeForStatus(400), 'BAD_RESPONSE');
  // Only the parameter is used; the provider-supplied host is never called.
  assert.equal(pageParam('https://evil.example/v3/templates?page_token=abc', 'page_token'), 'abc');
  assert.equal(pageParam('not a url ::', 'p'), null);
  assert.equal(pageParam(null, 'p'), null);
  assert.equal(toIso('2026-11-10 08:30:00'), '2026-11-10T08:30:00.000Z');
  assert.equal(toIso('Mon, 10 Nov 2026 08:30:00 UTC'), '2026-11-10T08:30:00.000Z');
  assert.equal(toIso('garbage'), null);
});

test('template keys are stable slugs and raw provider ids are not keys', () => {
  assert.equal(slugify('Welcome Email'), 'welcome-email');
  assert.equal(slugify('  Ünïcode -- Name!! '), 'unicode-name');
  assert.equal(slugify('***'), 'template');
  assert.equal(slugify('x'.repeat(300)).length, 80);
  assert.equal(isProviderTemplateKey('sendgrid:welcome-email'), true);
  assert.equal(isProviderTemplateKey('mailgun:a'), true);
  assert.equal(isProviderTemplateKey('d-13b8f94fbcae4ec6b75270d6cb59f932'), false);
  assert.equal(isProviderTemplateKey('sendgrid:Welcome'), false);
  assert.equal(isProviderTemplateKey('brevo:welcome'), false);
});

test('the HTML copy design keeps styles and the body in one HTML block', () => {
  assert.equal(
    extractBodyWithStyles(
      '<html><head><STYLE>a{}</STYLE></head><BODY class="x"> <p>Hi</p> </BODY></html>'
    ),
    '<STYLE>a{}</STYLE>\n<p>Hi</p>'
  );
  assert.equal(extractBodyWithStyles('<p>fragment</p>'), '<p>fragment</p>');
  const design = buildHtmlDesign('<p>{{name}}</p>');
  assert.equal(design.schemaVersion, 6);
  assert.equal(design.body.rows[0].columns[0].contents[0].values.html, '<p>{{name}}</p>');
  const start = Date.now();
  extractBodyWithStyles('<style'.repeat(50_000) + '<body>');
  assert.ok(Date.now() - start < 500);
});

test('admin controller: invalid keys are 400, test send defaults to the admin address', async () => {
  const calls = [];
  const strapi = {
    log: { debug() {}, info() {}, warn() {}, error() {} },
    plugin: () => ({
      service: (name) =>
        name === 'provider-templates'
          ? {
              detail: async (key) => ({ key, usedByCoreMails: [] }),
              sampleData: (group, to) => ({ name: 'Test User', email: to }),
            }
          : {
              send: async (payload, options) => {
                calls.push({ payload, options });
                return { success: true, accountUsed: 'sg1' };
              },
            },
    }),
  };
  global.strapi = strapi;
  try {
    const controller = require('../server/src/controllers/provider-templates')({ strapi });
    await assert.rejects(controller.findOne({ params: { key: 'd-raw-id' } }), {
      name: 'ValidationError',
    });

    const ctx = {
      params: { key: encodeURIComponent('sendgrid:welcome') },
      request: { body: {} },
      state: { user: { id: 1, email: 'admin@example.test' } },
    };
    await controller.testSend(ctx);
    assert.deepEqual(ctx.body, { data: { recipient: 'admin@example.test', accountUsed: 'sg1' } });
    assert.deepEqual(calls[0].payload, {
      to: 'admin@example.test',
      providerTemplate: 'sendgrid:welcome',
      templateData: { name: 'Test User', email: 'admin@example.test' },
    });
    assert.equal(calls[0].options.providerTemplateFallback, false);

    await assert.rejects(
      controller.testSend({ ...ctx, request: { body: { to: 'x', extra: 1 } } }),
      { name: 'ValidationError' }
    );
  } finally {
    delete global.strapi;
  }
});

test('admin controller: convert for provider passes the route id (regression: `id` was stripped)', async () => {
  const calls = [];
  const strapi = {
    log: { debug() {}, info() {}, warn() {}, error() {} },
    plugin: () => ({
      service: () => ({
        convertLocalForProvider: async (id) => {
          calls.push(id);
          return { name: 'T', subject: '', html: '', warnings: [] };
        },
      }),
    }),
  };
  global.strapi = strapi;
  try {
    const controller = require('../server/src/controllers/provider-templates')({ strapi });
    const ctx = { params: { id: '1307728057' } };
    await controller.convertForProvider(ctx);
    assert.deepEqual(calls, [1307728057]);
    assert.equal(ctx.body.data.name, 'T');
    await assert.rejects(controller.convertForProvider({ params: { id: 'abc' } }), {
      name: 'ValidationError',
    });
  } finally {
    delete global.strapi;
  }
});
