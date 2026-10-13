'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Magic-Mail registers only email, OAuth, analytics, settings, and tracking routes', () => {
  const adminRoutes = require('../server/src/routes/admin').routes;
  const contentRoutes = require('../server/src/routes/content-api').routes;
  const routes = [...adminRoutes, ...contentRoutes];

  assert.equal(routes.some(({ path: routePath }) => /whatsapp/i.test(routePath)), false);
  assert.equal(routes.some(({ handler }) => /whatsapp/i.test(handler)), false);
  assert.deepEqual(
    contentRoutes.map(({ method, path: routePath }) => `${method} ${routePath}`).sort(),
    [
      'GET /track/click/:emailId/:linkHash/:recipientHash',
      'GET /track/open/:emailId/:recipientHash',
      'POST /send',
      'POST /send-message',
    ].sort()
  );
});

test('WhatsApp transport is absent from package and Strapi registries', () => {
  const manifest = require('../package.json');
  const services = require('../server/src/services');
  const controllers = require('../server/src/controllers');

  assert.equal(Object.keys(manifest.dependencies).some((name) => /baileys|pino|qrcode/i.test(name)), false);
  assert.equal(Object.hasOwn(services, 'whatsapp'), false);
  assert.equal(Object.hasOwn(controllers, 'whatsapp'), false);
  assert.equal(fs.existsSync(path.join(root, 'server/src/services/whatsapp.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'server/src/controllers/whatsapp.js')), false);
});

test('react-intl is a Strapi-host peer and a current 6.x development dependency', () => {
  const manifest = require('../package.json');

  assert.equal(manifest.dependencies['react-intl'], undefined);
  assert.equal(manifest.devDependencies['react-intl'], '^6.8.9');
  assert.equal(manifest.peerDependencies['react-intl'], '^6.6.2');
});

test('admin navigation and email routing UI expose no messaging transport controls', () => {
  const adminApp = fs.readFileSync(path.join(root, 'admin/src/pages/App.jsx'), 'utf8');
  const routingRules = fs.readFileSync(path.join(root, 'admin/src/pages/RoutingRules.jsx'), 'utf8');

  assert.doesNotMatch(adminApp, /whatsapp/i);
  assert.doesNotMatch(routingRules, /whatsapp/i);
});

test('existing routing metadata columns remain in the Strapi schema but are not accepted by rule updates', () => {
  const schema = require('../server/src/content-types/routing-rule/schema.json');
  const { validate } = require('../server/src/validation');

  assert.equal(Object.hasOwn(schema.attributes, 'whatsappFallback'), true);
  assert.equal(Object.hasOwn(schema.attributes, 'whatsappPhoneField'), true);
  assert.throws(() => validate('routingRules.update', { whatsappFallback: true }));
  assert.throws(() => validate('routingRules.update', { whatsappPhoneField: 'phone' }));
});

test('email send-message keeps its email path and rejects transport selection', async () => {
  const emailRouter = require('../server/src/services/email-router')({
    strapi: { log: { debug() {}, info() {}, warn() {}, error() {} } },
  });
  let captured;
  emailRouter.send = async (message) => {
    captured = message;
    return { success: true, emailId: 'fake-email-1' };
  };

  const result = await emailRouter.sendMessage({
    channel: 'email',
    to: 'recipient@example.test',
    subject: 'Status',
    message: 'Delivered through the email path',
  });

  assert.deepEqual(captured, {
    to: 'recipient@example.test',
    subject: 'Status',
    text: 'Delivered through the email path',
    html: undefined,
    templateId: undefined,
    templateData: undefined,
  });
  assert.deepEqual(result, { success: true, emailId: 'fake-email-1', channel: 'email' });
  await assert.rejects(
    emailRouter.sendMessage({ channel: 'whatsapp', phoneNumber: '+491234567890', message: 'fake' }),
    /email delivery only/i
  );
  await assert.rejects(
    emailRouter.sendMessage({ channel: 'auto', phoneNumber: '+491234567890', message: 'fake' }),
    /email address/i
  );
});

test('send-message validation accepts email and rejects removed transport fields', () => {
  const { validate } = require('../server/src/validation');

  assert.deepEqual(
    validate('content.sendMessage', {
      channel: 'email',
      to: 'recipient@example.test',
      subject: 'Status',
      message: 'Hello',
    }),
    {
      channel: 'email',
      to: 'recipient@example.test',
      subject: 'Status',
      message: 'Hello',
    }
  );
  assert.throws(() => validate('content.sendMessage', {
    channel: 'whatsapp', phoneNumber: '+491234567890', message: 'fake',
  }));
  assert.throws(() => validate('content.sendMessage', {
    channel: 'email', to: 'recipient@example.test', phoneNumber: '+491234567890',
  }));
});
