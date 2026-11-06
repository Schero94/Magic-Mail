'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

function setEncryptionKey() {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
  return () => {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  };
}

function createSendHarness() {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const account = {
    name: 'test-sendgrid',
    documentId: 'test-account',
    provider: 'sendgrid',
    fromEmail: 'sender@example.com',
    fromName: 'Test Sender',
    config: encryptCredentials({ apiKey: 'SG.fake-token' }),
  };

  let router;
  const strapi = {
    log: quietLog,
    plugin(name) {
      assert.equal(name, 'magic-mail');
      return {
        service(serviceName) {
          if (serviceName === 'email-router') return router;
          if (serviceName === 'plugin-settings') {
            return { getSettings: async () => ({ enableOpenTracking: false, enableLinkTracking: false }) };
          }
          throw new Error(`Unexpected service requested: ${serviceName}`);
        },
      };
    },
  };

  router = require('../server/src/services/email-router')({ strapi });
  router.selectAccount = async () => account;
  router.checkRateLimits = async () => true;
  router.updateAccountStats = async () => {};

  return { router, strapi };
}

function createContext(body) {
  return {
    request: { body },
    badRequest(message) {
      this.status = 400;
      this.body = { error: message };
    },
    unauthorized(message) {
      this.status = 401;
      this.body = { error: message };
    },
    forbidden(message) {
      this.status = 403;
      this.body = { error: message };
    },
    internalServerError(message) {
      this.status = 500;
      this.body = { error: message };
    },
  };
}

function fakeAcceptedResponse() {
  return {
    ok: true,
    status: 202,
    headers: { get: () => 'fake-message-id' },
    json: async () => ({}),
    text: async () => '',
  };
}

test('Content API send preserves normalized CC recipients through the provider payload', async () => {
  const restoreKey = setEncryptionKey();
  const originalFetch = global.fetch;
  const originalStrapi = global.strapi;
  let capturedBody;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return fakeAcceptedResponse();
  };

  try {
    const { router, strapi } = createSendHarness();
    global.strapi = strapi;
    const controller = require('../server/src/controllers/controller');
    const ctx = createContext({
      to: 'primary@example.com',
      cc: 'CC-One@example.com, cc-two@example.com',
      bcc: 'hidden@example.com',
      subject: 'CC regression test',
      text: 'This message is captured by a fake provider.',
    });

    await controller.send(ctx);

    assert.equal(ctx.body.success, true);
    assert.deepEqual(capturedBody.personalizations[0].to, [{ email: 'primary@example.com' }]);
    assert.deepEqual(capturedBody.personalizations[0].cc, [
      { email: 'cc-one@example.com' },
      { email: 'cc-two@example.com' },
    ]);
    assert.deepEqual(capturedBody.personalizations[0].bcc, [{ email: 'hidden@example.com' }]);
    assert.notDeepEqual(capturedBody.personalizations[0].to, capturedBody.personalizations[0].cc);
    assert.equal(typeof router.send, 'function');
  } finally {
    global.fetch = originalFetch;
    if (originalStrapi === undefined) delete global.strapi;
    else global.strapi = originalStrapi;
    restoreKey();
  }
});

test('Content API send-message preserves To, CC, and BCC through a fake provider', async () => {
  const restoreKey = setEncryptionKey();
  const originalFetch = global.fetch;
  const originalStrapi = global.strapi;
  let capturedBody;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return fakeAcceptedResponse();
  };

  try {
    const { validate } = require('../server/src/validation');
    const validated = validate('content.sendMessage', {
      channel: 'email',
      to: 'primary@example.com',
      cc: 'CC-One@example.com, cc-two@example.com',
      bcc: 'hidden@example.com',
      message: 'validated before routing',
    });
    assert.equal(validated.cc, 'CC-One@example.com, cc-two@example.com');
    assert.equal(validated.bcc, 'hidden@example.com');

    const { strapi } = createSendHarness();
    global.strapi = strapi;
    const controller = require('../server/src/controllers/controller');
    const ctx = createContext({
      channel: 'email',
      to: 'primary@example.com',
      cc: 'CC-One@example.com, cc-two@example.com',
      bcc: 'hidden@example.com',
      subject: 'CC regression through send-message',
      message: 'This message is captured by a fake provider.',
    });

    await controller.sendMessage(ctx);

    assert.equal(ctx.body.success, true);
    assert.deepEqual(capturedBody.personalizations[0].to, [{ email: 'primary@example.com' }]);
    assert.deepEqual(capturedBody.personalizations[0].cc, [
      { email: 'cc-one@example.com' },
      { email: 'cc-two@example.com' },
    ]);
    assert.deepEqual(capturedBody.personalizations[0].bcc, [{ email: 'hidden@example.com' }]);
  } finally {
    global.fetch = originalFetch;
    if (originalStrapi === undefined) delete global.strapi;
    else global.strapi = originalStrapi;
    restoreKey();
  }
});

test('Content API send-message rejects malformed CC before contacting a provider', async () => {
  const restoreKey = setEncryptionKey();
  const originalFetch = global.fetch;
  const originalStrapi = global.strapi;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return fakeAcceptedResponse();
  };

  try {
    const { strapi } = createSendHarness();
    global.strapi = strapi;
    const controller = require('../server/src/controllers/controller');
    const ctx = createContext({
      channel: 'email',
      to: 'primary@example.com',
      cc: 'valid@example.com,not-an-address',
      subject: 'Invalid CC in send-message',
      message: 'This message must not reach a provider.',
    });

    await assert.rejects(controller.sendMessage(ctx), (error) => {
      assert.equal(error.name, 'ValidationError');
      assert.equal(error.details?._form, undefined, 'CC must be a recognized field, not rejected as an unknown key');
      assert.ok(error.details?.cc, 'malformed CC must be reported on the CC field');
      return true;
    });
    assert.equal(providerCalls, 0, 'invalid CC must be rejected before provider dispatch');
  } finally {
    global.fetch = originalFetch;
    if (originalStrapi === undefined) delete global.strapi;
    else global.strapi = originalStrapi;
    restoreKey();
  }
});

test('Content API rejects malformed CSV CC recipients before contacting a provider', async () => {
  const restoreKey = setEncryptionKey();
  const originalFetch = global.fetch;
  const originalStrapi = global.strapi;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return fakeAcceptedResponse();
  };

  try {
    const { strapi } = createSendHarness();
    global.strapi = strapi;
    const controller = require('../server/src/controllers/controller');
    const ctx = createContext({
      to: 'primary@example.com',
      cc: 'valid@example.com,not-an-address',
      subject: 'Invalid CC regression test',
      text: 'This message must not reach a provider.',
    });

    await assert.rejects(controller.send(ctx), (error) => error.name === 'ValidationError');

    assert.equal(providerCalls, 0, 'invalid CC must be rejected before provider dispatch');
  } finally {
    global.fetch = originalFetch;
    if (originalStrapi === undefined) delete global.strapi;
    else global.strapi = originalStrapi;
    restoreKey();
  }
});

test('direct service calls reject invalid array recipients before provider dispatch', async () => {
  const restoreKey = setEncryptionKey();
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return fakeAcceptedResponse();
  };

  try {
    const { router } = createSendHarness();

    await assert.rejects(router.send({
      to: 'primary@example.com',
      cc: ['valid@example.com', 'not-an-address'],
      subject: 'Invalid service CC regression test',
      text: 'This message must not reach a provider.',
    }), /invalid.*cc|cc.*invalid|recipient/i);
    assert.equal(providerCalls, 0);
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});

test('SMTP and Yahoo fake transports receive CC and BCC as separate recipient fields', async () => {
  const restoreKey = setEncryptionKey();
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const nodemailer = require('nodemailer');
  const originalCreateTransport = nodemailer.createTransport;
  const received = [];
  nodemailer.createTransport = () => ({
    sendMail: async (mailOptions) => {
      received.push(mailOptions);
      return { messageId: `fake-${received.length}`, response: 'accepted by fake transport' };
    },
  });

  try {
    const { router } = createSendHarness();
    const emailData = {
      to: 'primary@example.com',
      cc: ['cc-one@example.com', 'cc-two@example.com'],
      bcc: 'hidden@example.com',
      subject: 'Separate recipient fields',
      text: 'Captured locally by a fake transport.',
    };

    await router.sendViaSMTP({
      provider: 'smtp',
      fromEmail: 'sender@example.com',
      fromName: 'Sender',
      config: encryptCredentials({ host: 'smtp.invalid', user: 'fake-user', pass: 'fake-pass' }),
    }, { ...emailData });

    await router.sendViaYahooOAuth({
      provider: 'yahoo-oauth',
      fromEmail: 'sender@example.com',
      fromName: 'Sender',
      oauth: encryptCredentials({
        email: 'sender@example.com',
        accessToken: 'fake-access-token',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      config: encryptCredentials({ clientId: 'fake-client', clientSecret: 'fake-secret' }),
    }, { ...emailData });

    assert.equal(received.length, 2);
    for (const mailOptions of received) {
      assert.equal(mailOptions.to, 'primary@example.com');
      assert.deepEqual(mailOptions.cc, ['cc-one@example.com', 'cc-two@example.com']);
      assert.equal(mailOptions.bcc, 'hidden@example.com');
    }
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    restoreKey();
  }
});

test('Mailgun receives the normalized CC list in its fake multipart request', async () => {
  const restoreKey = setEncryptionKey();
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const originalFetch = global.fetch;
  let capturedForm;
  global.fetch = async (_url, options) => {
    capturedForm = options.body;
    return { ok: true, status: 200, json: async () => ({ id: 'fake-mailgun-message' }), text: async () => '' };
  };

  try {
    const { router } = createSendHarness();
    await router.sendViaMailgun({
      provider: 'mailgun',
      fromEmail: 'sender@example.com',
      fromName: 'Sender',
      config: encryptCredentials({ apiKey: 'fake-key', domain: 'mg.example.invalid' }),
    }, {
      to: 'primary@example.com',
      cc: ['cc-one@example.com', 'cc-two@example.com'],
      bcc: 'hidden@example.com',
      subject: 'Mailgun CC regression test',
      text: 'Captured locally by a fake fetch implementation.',
    });

    assert.equal(capturedForm.get('to'), 'primary@example.com');
    assert.equal(capturedForm.get('cc'), 'cc-one@example.com, cc-two@example.com');
    assert.equal(capturedForm.get('bcc'), 'hidden@example.com');
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});

test('recipient count limits and invalid BCC values are enforced for internal service calls', async () => {
  const restoreKey = setEncryptionKey();
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return fakeAcceptedResponse();
  };

  try {
    const { router } = createSendHarness();
    const base = {
      to: 'primary@example.com',
      subject: 'Bounded recipient regression test',
      text: 'This message must not reach a provider.',
    };

    await assert.rejects(router.send({
      ...base,
      cc: Array.from({ length: 51 }, (_, index) => `cc-${index}@example.com`),
    }), /too many cc recipients/i);
    await assert.rejects(router.send({ ...base, bcc: ['not-an-address'] }), /invalid bcc recipient/i);
    assert.equal(providerCalls, 0);
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});
