'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

test('account validation accepts every provider implemented by the router', () => {
  const { validate } = require('../server/src/validation');
  const providers = [
    'smtp', 'nodemailer', 'gmail-oauth', 'microsoft-oauth',
    'yahoo-oauth', 'sendgrid', 'mailgun',
  ];

  for (const provider of providers) {
    const result = validate('accounts.create', {
      name: `${provider} account`,
      provider,
      config: {},
      fromEmail: 'sender@example.com',
    });
    assert.equal(result.provider, provider);
  }

  assert.throws(() => validate('accounts.create', {
    name: 'unsupported',
    provider: 'postmark',
    config: {},
    fromEmail: 'sender@example.com',
  }));
});

test('Zod 4 records work and security-sensitive URLs reject active schemes', () => {
  const { validate } = require('../server/src/validation');

  const rendered = validate('emailDesigner.renderTemplate', {
    data: { firstName: 'Ada' },
  });
  assert.deepEqual(rendered.data, { firstName: 'Ada' });

  assert.throws(() => validate('pluginSettings.update', {
    trackingFallbackUrl: 'javascript:alert(1)',
  }));
  assert.throws(() => validate('pluginSettings.update', {
    trackingBaseUrl: 'data:text/html,boom',
  }));
  assert.throws(() => validate('content.send', {
    to: 'user@example.com',
    from: 'sender@example.com\r\nBcc: victim@example.com',
  }));
  assert.throws(() => validate('whatsapp.saveTemplate', {
    templateName: '__proto__',
    templateContent: 'unsafe',
  }));
});

test('credential encryption round-trips and rejects weak or malformed input', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MAGIC_MAIL_ENCRYPTION_KEY: process.env.MAGIC_MAIL_ENCRYPTION_KEY,
  };
  const encryption = require('../server/src/utils/encryption');

  try {
    process.env.NODE_ENV = 'production';
    process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'x'.repeat(32);
    const encrypted = encryption.encryptCredentials({ password: 'secret' });
    assert.deepEqual(encryption.decryptCredentials(encrypted), { password: 'secret' });
    assert.throws(() => encryption.decryptCredentials({ encrypted: '00:00:00' }));

    process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'too-short';
    assert.throws(() => encryption.encryptCredentials({ password: 'secret' }), /at least 32 bytes/);
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.MAGIC_MAIL_ENCRYPTION_KEY === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous.MAGIC_MAIL_ENCRYPTION_KEY;
  }
});

test('OAuth state enforces PKCE and one-time consumption', async () => {
  const previousSecret = process.env.MAGIC_MAIL_OAUTH_STATE_SECRET;
  process.env.MAGIC_MAIL_OAUTH_STATE_SECRET = 's'.repeat(32);
  const values = new Map();
  const strapi = {
    log: quietLog,
    store: () => ({
      get: async ({ key }) => values.get(key),
      set: async ({ key, value }) => values.set(key, value),
      delete: async ({ key }) => values.delete(key),
    }),
  };
  const { createState, verifyAndConsumeState } = require('../server/src/utils/oauth-state');

  try {
    const created = await createState(strapi, { clientId: 'client', provider: 'gmail' });
    assert.equal(created.codeChallengeMethod, 'S256');
    const consumed = await verifyAndConsumeState(strapi, created.state, 'client');
    assert.equal(consumed.payload.provider, 'gmail');
    assert.ok(consumed.codeVerifier);
    await assert.rejects(() => verifyAndConsumeState(strapi, created.state, 'client'), /already used/);

    const failingStore = {
      log: quietLog,
      store: () => ({ set: async () => { throw new Error('storage down'); } }),
    };
    await assert.rejects(
      () => createState(failingStore, { clientId: 'client', provider: 'gmail' }),
      /Could not persist PKCE verifier/
    );
  } finally {
    if (previousSecret === undefined) delete process.env.MAGIC_MAIL_OAUTH_STATE_SECRET;
    else process.env.MAGIC_MAIL_OAUTH_STATE_SECRET = previousSecret;
  }
});

test('invalid click recipient hash cannot resolve or increment a link', async () => {
  const previous = process.env.APP_KEYS;
  process.env.APP_KEYS = 'tracking-secret-for-tests';
  let linkLookupCount = 0;
  let linkUpdateCount = 0;
  const emailLog = { documentId: 'log-doc', recipient: 'user@example.com' };
  const strapi = {
    log: quietLog,
    documents: (uid) => ({
      findFirst: async () => {
        if (uid === 'plugin::magic-mail.email-log') return emailLog;
        linkLookupCount += 1;
        return { documentId: 'link-doc', originalUrl: 'https://example.com', clickCount: 0 };
      },
      update: async () => { linkUpdateCount += 1; },
    }),
  };
  const analytics = require('../server/src/services/analytics')({ strapi });

  try {
    assert.equal(await analytics.getOriginalUrlFromHash('email-id', 'link', 'invalid'), null);
    assert.equal(linkLookupCount, 0);
    assert.equal(linkUpdateCount, 0);

    const valid = analytics.generateRecipientHash('email-id', emailLog.recipient);
    assert.equal(
      await analytics.getOriginalUrlFromHash('email-id', 'link', valid),
      'https://example.com'
    );
    assert.equal(linkLookupCount, 1);
    assert.equal(linkUpdateCount, 1);
  } finally {
    if (previous === undefined) delete process.env.APP_KEYS;
    else process.env.APP_KEYS = previous;
  }
});

test('tracking pixel bypasses JSON serialization and writes raw GIF bytes', async () => {
  const headers = {};
  let responseBody;
  const analyticsController = require('../server/src/controllers/analytics')({
    strapi: {
      log: quietLog,
      plugin: () => ({
        service: () => ({ recordOpen: async () => null }),
      }),
    },
  });
  const ctx = {
    params: { emailId: 'email', recipientHash: 'hash' },
    request: { headers: {} },
    res: {
      setHeader: (name, value) => { headers[name] = value; },
      end: (value) => { responseBody = value; },
    },
  };

  await analyticsController.trackOpen(ctx);

  assert.equal(headers['Content-Type'], 'image/gif');
  assert.equal(ctx.respond, false);
  assert.equal(Buffer.isBuffer(responseBody), true);
  assert.equal(responseBody.subarray(0, 6).toString('ascii'), 'GIF89a');
});

test('WhatsApp template replacement treats variable names literally', async () => {
  const strapi = {
    log: quietLog,
    store: () => ({
      get: async () => ({ welcome: 'Hello {{name}} / {{.*}}' }),
    }),
  };
  const whatsapp = require('../server/src/services/whatsapp')({ strapi });
  let sent;
  whatsapp.sendMessage = async (phone, message) => {
    sent = { phone, message };
    return { success: true };
  };

  await whatsapp.sendTemplateMessage('+49123456', 'welcome', { name: 'Ada', '.*': 'literal' });
  assert.deepEqual(sent, { phone: '+49123456', message: 'Hello Ada / literal' });
});

test('all declared routes resolve to controller functions and admin routes are protected', () => {
  const controllers = require('../server/src/controllers');
  const adminRoutes = require('../server/src/routes/admin').routes;
  const contentRoutes = require('../server/src/routes/content-api').routes;
  const instances = Object.fromEntries(Object.entries(controllers).map(([name, controller]) => [
    name,
    typeof controller === 'function' ? controller({ strapi: {} }) : controller,
  ]));

  for (const route of [...adminRoutes, ...contentRoutes]) {
    const [controller, method] = route.handler.split('.');
    assert.equal(typeof instances[controller]?.[method], 'function', route.handler);
  }

  for (const route of adminRoutes) {
    const isCallback = /\/oauth\/(gmail|microsoft|yahoo)\/callback$/.test(route.path);
    if (isCallback) {
      assert.equal(route.config.auth, false, route.path);
      continue;
    }
    const policies = route.config.policies || [];
    assert.ok(policies.includes('admin::isAuthenticatedAdmin'), route.path);
    assert.ok(policies.some((policy) => policy?.name === 'admin::hasPermissions'), route.path);
  }
});

test('analytics query validation preserves Strapi document IDs and bounds pagination', () => {
  const { validate } = require('../server/src/validation');
  const query = validate('analytics.statsQuery', {
    accountId: 'q1w2e3r4t5y6u7i8o9p0',
    templateId: '42',
  });
  assert.equal(query.accountId, 'q1w2e3r4t5y6u7i8o9p0');
  assert.equal(query.templateId, 42);
  assert.throws(() => validate('analytics.logsQuery', { pageSize: '1000' }));
});

test('SMTP transport blocks file/URL reads and protected header overrides', async () => {
  const previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
  const nodemailer = require('nodemailer');
  const originalCreateTransport = nodemailer.createTransport;
  let transportConfig;
  let mailOptions;
  nodemailer.createTransport = (config) => {
    transportConfig = config;
    return {
      sendMail: async (options) => {
        mailOptions = options;
        return { messageId: 'test-message' };
      },
    };
  };

  try {
    delete require.cache[require.resolve('../server/src/services/email-router')];
    const { encryptCredentials } = require('../server/src/utils/encryption');
    const router = require('../server/src/services/email-router')({ strapi: { log: quietLog } });
    await router.sendViaSMTP({
      fromEmail: 'sender@example.com',
      fromName: 'Sender',
      config: encryptCredentials({
        host: 'smtp.example.com',
        port: 587,
        user: 'sender@example.com',
        pass: 'secret',
      }),
    }, {
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Test',
      headers: { Subject: 'override', 'X-Custom': 'allowed' },
    });

    assert.equal(transportConfig.disableFileAccess, true);
    assert.equal(transportConfig.disableUrlAccess, true);
    assert.equal(mailOptions.disableFileAccess, true);
    assert.equal(mailOptions.disableUrlAccess, true);
    assert.equal(mailOptions.headers.Subject, undefined);
    assert.equal(mailOptions.headers['X-Custom'], 'allowed');
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    delete require.cache[require.resolve('../server/src/services/email-router')];
    if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  }
});
