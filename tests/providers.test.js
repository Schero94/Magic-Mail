'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

function loadRouter() {
  delete require.cache[require.resolve('../server/src/services/email-router')];
  return require('../server/src/services/email-router')({ strapi: { log: quietLog } });
}

function setKey() {
  const prev = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
  return () => {
    if (prev === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = prev;
  };
}

test('SendGrid maps array/CSV recipients and uses reply_to + custom_args', async () => {
  const restoreKey = setKey();
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const router = loadRouter();
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 202, headers: { get: () => 'msg-1' }, json: async () => ({}), text: async () => '' };
  };

  try {
    const account = {
      name: 'sg', provider: 'sendgrid', fromEmail: 'from@example.com', fromName: 'From',
      config: encryptCredentials({ apiKey: 'SG.test' }),
    };
    await router.sendViaSendGrid(account, {
      to: ['a@example.com', 'b@example.com'],
      cc: 'c@example.com, d@example.com',
      subject: 'Hi', text: 'body', replyTo: 'reply@example.com',
    });

    const body = JSON.parse(captured.opts.body);
    assert.deepEqual(body.personalizations[0].to, [{ email: 'a@example.com' }, { email: 'b@example.com' }]);
    assert.deepEqual(body.personalizations[0].cc, [{ email: 'c@example.com' }, { email: 'd@example.com' }]);
    assert.equal(body.reply_to.email, 'reply@example.com');
    assert.ok(body.custom_args, 'custom_args must be present (snake_case)');
    assert.equal(body.replyTo, undefined, 'camelCase replyTo must not be sent');
    assert.equal(body.customArgs, undefined, 'camelCase customArgs must not be sent');
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});

test('Mailgun sends a native FormData body without a manual content-type', async () => {
  const restoreKey = setKey();
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const router = loadRouter();
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, json: async () => ({ id: 'mg-1' }), text: async () => '' };
  };

  try {
    const account = {
      name: 'mg', provider: 'mailgun', fromEmail: 'from@example.com', fromName: 'From',
      config: encryptCredentials({ apiKey: 'key-test', domain: 'mg.example.com' }),
    };
    await router.sendViaMailgun(account, {
      to: ['a@example.com', 'b@example.com'], subject: 'Hi', text: 'body',
    });

    assert.ok(captured.opts.body instanceof FormData, 'body must be a WHATWG FormData');
    assert.notEqual(String(captured.opts.body), '[object FormData]... serialized');
    assert.equal(captured.opts.body.get('to'), 'a@example.com, b@example.com');
    assert.equal(captured.opts.body.get('subject'), 'Hi');
    const headerKeys = Object.keys(captured.opts.headers || {}).map((k) => k.toLowerCase());
    assert.ok(!headerKeys.includes('content-type'), 'must not set multipart content-type manually');
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});

test('Gmail raw MIME includes To, Cc, Bcc, Reply-To and a text/plain body', async () => {
  const restoreKey = setKey();
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const router = loadRouter();
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, json: async () => ({ id: 'gmail-1' }), text: async () => '' };
  };

  try {
    const account = {
      name: 'gm', provider: 'gmail-oauth', documentId: 'acc-1',
      fromEmail: 'from@example.com', fromName: 'From',
      oauth: encryptCredentials({
        email: 'from@example.com', accessToken: 'tok',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
      config: encryptCredentials({ clientId: 'cid', clientSecret: 'secret' }),
    };
    await router.sendViaGmailOAuth(account, {
      to: 'user@example.com',
      cc: ['cc1@example.com', 'cc2@example.com'],
      bcc: ['hidden1@example.com', 'hidden2@example.com'],
      subject: 'Plain',
      text: 'just text',
      replyTo: 'reply@example.com',
    });

    const raw = Buffer.from(JSON.parse(captured.opts.body).raw, 'base64url').toString('utf-8');
    assert.match(raw, /^To:\s*user@example\.com$/im, 'To header present');
    assert.match(raw, /^Cc:\s*cc1@example\.com,\s*cc2@example\.com$/im, 'Cc header present');
    assert.match(
      raw,
      /^Bcc:\s*hidden1@example\.com,\s*hidden2@example\.com$/im,
      'Bcc header must be retained because Gmail API has no SMTP envelope'
    );
    assert.match(raw, /Reply-To:\s*reply@example\.com/i, 'Reply-To header present');
    assert.match(raw, /text\/plain/i, 'text-only body is text/plain');
    assert.ok(!/Content-Type:\s*text\/html/i.test(raw), 'text-only body must not be labelled text/html');
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});

test('Microsoft raw MIME includes To, Cc and Bcc recipients', async () => {
  const restoreKey = setKey();
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const router = loadRouter();
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return {
      ok: true,
      status: 202,
      statusText: 'Accepted',
      json: async () => ({}),
      text: async () => '',
    };
  };

  try {
    const account = {
      name: 'ms',
      provider: 'microsoft-oauth',
      documentId: 'acc-2',
      fromEmail: 'from@example.com',
      fromName: 'From',
      oauth: encryptCredentials({
        email: 'from@example.com',
        accessToken: 'tok',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
      config: encryptCredentials({
        clientId: 'cid',
        clientSecret: 'secret',
        tenantId: 'common',
      }),
    };

    await router.sendViaMicrosoftOAuth(account, {
      to: 'user@example.com',
      cc: ['cc1@example.com', 'cc2@example.com'],
      bcc: ['hidden1@example.com', 'hidden2@example.com'],
      subject: 'Recipients',
      text: 'body',
    });

    const raw = Buffer.from(captured.opts.body, 'base64').toString('utf-8');
    assert.match(raw, /^To:\s*user@example\.com$/im, 'To header present');
    assert.match(raw, /^Cc:\s*cc1@example\.com,\s*cc2@example\.com$/im, 'Cc header present');
    assert.match(
      raw,
      /^Bcc:\s*hidden1@example\.com,\s*hidden2@example\.com$/im,
      'Bcc header must be retained because Microsoft Graph MIME has no SMTP envelope'
    );
  } finally {
    global.fetch = originalFetch;
    restoreKey();
  }
});
