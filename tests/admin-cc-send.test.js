'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validate } = require('../server/src/validation');

const CC = 'copy@example.com, second-copy@example.com';

test('account and template test-send schemas retain bounded CC input', () => {
  assert.equal(validate('accounts.test', { testEmail: 'to@example.com', cc: CC }).cc, CC);
  assert.equal(validate('accounts.testStrapiService', { testEmail: 'to@example.com', cc: CC }).cc, CC);
  assert.equal(validate('emailDesigner.testSend', { to: 'to@example.com', cc: CC }).cc, CC);
});

test('account test-send rejects malformed CC before calling the account service', () => {
  assert.throws(
    () => validate('accounts.test', { testEmail: 'to@example.com', cc: 'copy@example.com,invalid' }),
    (error) => error.name === 'ValidationError',
  );
});

test('account test handler forwards CC to its account-manager service', async () => {
  const originalStrapi = global.strapi;
  let captured;
  global.strapi = {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    plugin(name) {
      assert.equal(name, 'magic-mail');
      return { service: () => ({ testAccount: async (...args) => { captured = args; return { success: true }; } }) };
    },
  };

  try {
    const controller = require('../server/src/controllers/accounts');
    const ctx = {
      params: { accountId: 'test-account' },
      request: { body: { testEmail: 'to@example.com', cc: CC } },
      body: null,
    };
    await controller.test(ctx);
    assert.equal(captured[1], 'to@example.com');
    assert.equal(captured[2].cc, CC);
    assert.deepEqual(ctx.body, { success: true });
  } finally {
    if (originalStrapi === undefined) delete global.strapi;
    else global.strapi = originalStrapi;
  }
});

test('account-manager test send forwards CC to the email router', async () => {
  let captured;
  const account = {
    documentId: 'test-account',
    name: 'Test account',
    provider: 'smtp',
    fromEmail: 'sender@example.com',
  };
  const strapi = {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    documents: () => ({ findOne: async () => account }),
    plugin(name) {
      assert.equal(name, 'magic-mail');
      return { service: () => ({ send: async (data) => { captured = data; return { success: true }; } }) };
    },
  };
  const accountManager = require('../server/src/services/account-manager')({ strapi });
  accountManager.resolveDocumentId = async () => account.documentId;

  await accountManager.testAccount(account.documentId, 'to@example.com', { cc: CC });

  assert.equal(captured.to, 'to@example.com');
  assert.equal(captured.cc, CC);
});

test('Strapi service test handler forwards CC into the native email service', async () => {
  const originalStrapi = global.strapi;
  let captured;
  global.strapi = {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    plugin(name) {
      if (name === 'magic-mail') return { service: () => ({}) };
      assert.equal(name, 'email');
      return { service: () => ({ send: async (data) => { captured = data; return { success: true }; } }) };
    },
  };

  try {
    const controller = require('../server/src/controllers/accounts');
    const ctx = {
      request: { body: { testEmail: 'to@example.com', accountName: 'test-account', cc: CC } },
      body: null,
    };
    await controller.testStrapiService(ctx);
    assert.equal(captured.to, 'to@example.com');
    assert.equal(captured.cc, CC);
    assert.equal(captured.accountName, 'test-account');
    assert.equal(ctx.body.success, true);
  } finally {
    if (originalStrapi === undefined) delete global.strapi;
    else global.strapi = originalStrapi;
  }
});

test('template test-send controller forwards CC to the router', async () => {
  let captured;
  const strapi = {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    plugin(name) {
      assert.equal(name, 'magic-mail');
      return {
        service(serviceName) {
          if (serviceName === 'email-designer') {
            return {
              findOne: async () => ({ id: 1, name: 'Test template', templateReferenceId: 'template-1', subject: 'Hello' }),
              renderTemplate: async () => ({ subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }),
            };
          }
          if (serviceName === 'email-router') return { send: async (data) => { captured = data; return { success: true }; } };
          throw new Error(`Unexpected service requested: ${serviceName}`);
        },
      };
    },
  };

  const controller = require('../server/src/controllers/email-designer')({ strapi });
  const ctx = {
    params: { id: 'template-1' },
    request: { body: { to: 'to@example.com', accountName: 'test-account', cc: CC } },
    send(body) { this.body = body; },
    badRequest(message) { throw new Error(message); },
    notFound(message) { throw new Error(message); },
  };

  await controller.testSend(ctx);
  assert.equal(captured.to, 'to@example.com');
  assert.equal(captured.cc, CC);
  assert.equal(captured.accountName, 'test-account');
  assert.equal(ctx.body.success, true);
});

test('both Admin test-send dialogs expose an accessible CC field and forward its value', () => {
  const homePage = readFileSync(path.join(__dirname, '../admin/src/pages/HomePage.jsx'), 'utf8');
  const templateList = readFileSync(path.join(__dirname, '../admin/src/pages/EmailDesigner/TemplateList.jsx'), 'utf8');

  const accountTestSend = readFileSync(path.join(__dirname, '../admin/src/pages/Accounts/TestEmailModal.jsx'), 'utf8');
  assert.match(homePage, /<TestEmailModal/);
  assert.match(homePage, /cc:\s*testOptions\.cc/i);
  assert.match(accountTestSend, /CC recipients/i);
  assert.match(accountTestSend, /<ModalFieldLabel htmlFor=\{ids\.cc\}>\{t\('accounts\.test\.cc'/);
  assert.match(accountTestSend, /cc:\s*normaliseCc\(testCc\)/);
  const templateTestSend = readFileSync(
    path.join(__dirname, '../admin/src/pages/EmailDesigner/TemplateTestSendModal.jsx'),
    'utf8'
  );
  assert.match(templateList, /<TemplateTestSendModal/);
  assert.match(templateTestSend, /CC recipients/i);
  assert.match(templateTestSend, /<Field\.Label>\{t\('templates\.testSend\.cc'/);
  assert.match(templateTestSend, /cc:\s*result\.cc\.length > 0 \? result\.cc\.join\(', '\) : undefined/);
});
