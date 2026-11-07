'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Magic-Mail registers only email, OAuth, analytics, settings, tracking and delivery webhook routes', () => {
  const adminRoutes = require('../server/src/routes/admin').routes;
  const contentRoutes = require('../server/src/routes/content-api').routes;
  const routes = [...adminRoutes, ...contentRoutes];

  assert.equal(
    routes.some(({ path: routePath }) => /whatsapp/i.test(routePath)),
    false
  );
  assert.equal(
    routes.some(({ handler }) => /whatsapp/i.test(handler)),
    false
  );
  assert.deepEqual(
    contentRoutes.map(({ method, path: routePath }) => `${method} ${routePath}`).sort(),
    [
      'GET /track/click/:emailId/:linkHash/:recipientHash',
      'GET /track/open/:emailId/:recipientHash',
      'POST /send',
      'POST /send-message',
      'POST /webhooks/mailgun/:accountId',
      'POST /webhooks/sendgrid/:accountId',
    ].sort()
  );
});

test('WhatsApp transport is absent from package and Strapi registries', () => {
  const manifest = require('../package.json');
  const services = require('../server/src/services');
  const controllers = require('../server/src/controllers');

  assert.equal(
    Object.keys(manifest.dependencies).some((name) => /baileys|pino|qrcode/i.test(name)),
    false
  );
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

test('legacy messaging columns are gone from the routing-rule schema and rejected by rule updates', () => {
  const schema = require('../server/src/content-types/routing-rule/schema.json');
  const { validate } = require('../server/src/validation');

  assert.deepEqual(
    Object.keys(schema.attributes).filter((key) => /whatsapp|phone/i.test(key)),
    []
  );
  assert.throws(() => validate('routingRules.update', { whatsappFallback: true }));
  assert.throws(() => validate('routingRules.update', { whatsappPhoneField: 'phone' }));
});

/** Recursively lists files below `dir` (relative to the repo root). */
function listFiles(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(relative);
    return [relative];
  });
}

const FORBIDDEN = /whats\s*app|baileys/i;

test('no messaging-transport residue in decoded schemas, translations, sources, docs or dev tooling', () => {
  // JSON is checked after parsing, so \uXXXX escapes can not hide a key.
  const jsonFiles = [
    ...listFiles('server/src/content-types').filter((file) => file.endsWith('.json')),
    ...listFiles('admin/src/translations').filter((file) => file.endsWith('.json')),
  ];
  assert.ok(jsonFiles.length > 5);
  for (const file of jsonFiles) {
    const raw = fs.readFileSync(path.join(root, file), 'utf8');
    const decoded = JSON.stringify(JSON.parse(raw));
    assert.doesNotMatch(decoded, FORBIDDEN, file);
    if (file.startsWith('server/src/content-types')) {
      assert.doesNotMatch(raw, /\\u00[0-9a-f]{2}/i, `${file} must not use unicode escapes`);
    }
  }

  const textFiles = [
    ...listFiles('server/src'),
    ...listFiles('admin/src'),
    ...listFiles('.dev'),
    ...listFiles('.agents'),
    ...listFiles('docs/site'),
    'README.md',
  ].filter((file) => /\.(js|jsx|mjs|ts|tsx|json|md|html)$/.test(file));
  for (const file of textFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, FORBIDDEN, file);
    if (file.startsWith('server/src') || file.startsWith('admin/src')) {
      assert.doesNotMatch(text, /phone ?number/i, file);
    }
  }
});

test('email send-message keeps its email path and has no channel parameter', async () => {
  const emailRouter = require('../server/src/services/email-router')({
    strapi: { log: { debug() {}, info() {}, warn() {}, error() {} } },
  });
  let captured;
  emailRouter.send = async (message) => {
    captured = message;
    return { success: true, emailId: 'fake-email-1' };
  };

  const result = await emailRouter.sendMessage({
    to: 'recipient@example.test',
    cc: ['copy-one@example.test', 'copy-two@example.test'],
    bcc: 'hidden@example.test',
    subject: 'Status',
    message: 'Delivered through the email path',
  });

  assert.deepEqual(captured, {
    to: 'recipient@example.test',
    cc: ['copy-one@example.test', 'copy-two@example.test'],
    bcc: 'hidden@example.test',
    subject: 'Status',
    text: 'Delivered through the email path',
    html: undefined,
    templateId: undefined,
    templateData: undefined,
  });
  assert.deepEqual(
    result,
    { success: true, emailId: 'fake-email-1' },
    'the response carries no channel field'
  );
  await assert.rejects(
    emailRouter.sendMessage({ phoneNumber: '+491234567890', message: 'fake' }),
    /email address/i
  );
});

test('send-message validation accepts email and rejects channel and removed transport fields', () => {
  const { validate } = require('../server/src/validation');

  assert.deepEqual(
    validate('content.sendMessage', {
      to: 'recipient@example.test',
      cc: 'copy@example.test,second-copy@example.test',
      bcc: 'hidden@example.test',
      subject: 'Status',
      message: 'Hello',
    }),
    {
      to: 'recipient@example.test',
      cc: 'copy@example.test,second-copy@example.test',
      bcc: 'hidden@example.test',
      subject: 'Status',
      message: 'Hello',
    }
  );
  assert.throws(
    () =>
      validate('content.sendMessage', {
        to: 'recipient@example.test',
        cc: 'copy@example.test,invalid',
      }),
    (error) => error.name === 'ValidationError' && Boolean(error.details?.cc)
  );
  assert.throws(() =>
    validate('content.sendMessage', {
      channel: 'email',
      to: 'recipient@example.test',
      message: 'channel was removed in 4.0',
    })
  );
  assert.throws(
    () => validate('content.sendMessage', { to: 'not-an-email', message: 'fake' }),
    (error) => error.name === 'ValidationError' && Boolean(error.details?.to)
  );
  assert.throws(() => validate('content.sendMessage', { message: 'missing recipient' }));
  assert.throws(() =>
    validate('content.sendMessage', {
      to: 'recipient@example.test',
      phoneNumber: '+491234567890',
    })
  );
});
