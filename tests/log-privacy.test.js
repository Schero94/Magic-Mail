'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function captureLogger() {
  const entries = [];
  const log = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args) => entries.push(args.map((value) => (
        typeof value === 'string' ? value : JSON.stringify(value)
      )).join(' ')),
    ])
  );
  return { log, entries };
}

test('email send helper does not log recipient or message content', async () => {
  const { log, entries } = captureLogger();
  const router = require('../server/src/services/email-router')({ strapi: { log } });
  router.send = async () => ({ success: true, messageId: 'fake-message-id' });

  await router.sendMessage({
    channel: 'email',
    to: 'person@example.test',
    subject: 'private subject',
    text: 'private message body',
  });

  const output = entries.join('\n');
  assert.doesNotMatch(output, /person@example\.test|private subject|private message body/);
});

test('Google OAuth logs neither profile data nor tokens', async () => {
  const { log, entries } = captureLogger();
  const oauth = require('../server/src/services/oauth')({ strapi: { log } });
  const previousFetch = global.fetch;
  const payloads = [
    { access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_in: 3600 },
    { email: 'person@example.test', name: 'Private Profile' },
  ];
  global.fetch = async () => ({ ok: true, status: 200, json: async () => payloads.shift() });

  try {
    const result = await oauth.exchangeGoogleCode('fake-code', 'fake-client-id', 'fake-client-secret');
    assert.equal(result.email, 'person@example.test');
    assert.equal(result.accessToken, 'fake-access-token');
    assert.equal(result.refreshToken, 'fake-refresh-token');
    const output = entries.join('\n');
    assert.doesNotMatch(output, /person@example\.test|Private Profile|fake-access-token|fake-refresh-token|fake-client-secret/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('Microsoft and Yahoo OAuth logs do not disclose profile addresses', async () => {
  const { log, entries } = captureLogger();
  const oauth = require('../server/src/services/oauth')({ strapi: { log } });
  const previousFetch = global.fetch;
  const privateEmail = 'private-user@example.test';
  const idPayload = Buffer.from(JSON.stringify({ email: privateEmail })).toString('base64url');
  const microsoftReplies = [
    {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fake-ms-access', refresh_token: 'fake-ms-refresh', id_token: `e30.${idPayload}.sig` }),
    },
  ];

  try {
    global.fetch = async () => microsoftReplies.shift();
    const microsoft = await oauth.exchangeMicrosoftCode(
      'fake-code', 'fake-client-id', 'fake-client-secret', 'fake-tenant-id'
    );
    assert.equal(microsoft.email, privateEmail);

    const yahooReplies = [
      { ok: true, status: 200, json: async () => ({ access_token: 'fake-yahoo-access', refresh_token: 'fake-yahoo-refresh' }) },
      { ok: true, status: 200, json: async () => ({ email: privateEmail, name: 'Private Profile' }) },
    ];
    global.fetch = async () => yahooReplies.shift();
    const yahoo = await oauth.exchangeYahooCode('fake-code', 'fake-client-id', 'fake-client-secret');
    assert.equal(yahoo.email, privateEmail);
    assert.doesNotMatch(entries.join('\n'), /private-user@example\.test|Private Profile|fake-ms-access|fake-yahoo-access/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('Microsoft Graph profile fallback does not log user profile payloads', async () => {
  const { log, entries } = captureLogger();
  const oauth = require('../server/src/services/oauth')({ strapi: { log } });
  const previousFetch = global.fetch;
  const replies = [
    { ok: true, status: 200, json: async () => ({ access_token: 'fake-graph-access', refresh_token: 'fake-graph-refresh' }) },
    { ok: true, status: 200, json: async () => ({ mail: 'graph-user@example.test', displayName: 'Private Graph Profile' }) },
  ];
  global.fetch = async () => replies.shift();

  try {
    const result = await oauth.exchangeMicrosoftCode(
      'fake-code', 'fake-client-id', 'fake-client-secret', 'fake-tenant-id'
    );
    assert.equal(result.email, 'graph-user@example.test');
    assert.doesNotMatch(entries.join('\n'), /graph-user@example\.test|Private Graph Profile|fake-graph-access/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('OAuth provider error bodies stay out of logs and thrown messages', async () => {
  const { log, entries } = captureLogger();
  const oauth = require('../server/src/services/oauth')({ strapi: { log } });
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => 'private@example.test access_token=fake-provider-secret',
  });

  try {
    await assert.rejects(
      oauth.exchangeMicrosoftCode('fake-code', 'fake-client-id', 'fake-client-secret', 'fake-tenant'),
      (error) => {
        assert.match(error.message, /502/);
        assert.doesNotMatch(error.message, /private@example\.test|fake-provider-secret/);
        return true;
      }
    );
    assert.doesNotMatch(entries.join('\n'), /private@example\.test|fake-provider-secret/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('tracking diagnostics do not log email HTML when no links are found', async () => {
  const { log, entries } = captureLogger();
  const strapi = {
    log,
    config: { get: () => 'https://app.example.test' },
    plugin: () => ({ service: () => ({ getSettings: async () => ({}) }) }),
    documents: () => ({ findFirst: async () => ({ documentId: 'fake-email-log' }) }),
  };
  const analytics = require('../server/src/services/analytics')({ strapi });
  const html = '<p>private@example.test private message content</p>';

  assert.equal(await analytics.rewriteLinksForTracking(html, 'fake-email', 'fake-recipient-hash'), html);
  assert.doesNotMatch(entries.join('\n'), /private@example\.test|private message content/);
});

test('tracking click logs omit destination URLs and recipient identifiers', async () => {
  const { log, entries } = captureLogger();
  const documents = {
    'plugin::magic-mail.email-log': {
      findFirst: async () => ({ documentId: 'fake-log-doc', recipient: 'person@example.test', clickCount: 0 }),
      update: async () => ({}),
    },
    'plugin::magic-mail.email-event': { create: async ({ data }) => data },
  };
  const analytics = require('../server/src/services/analytics')({
    strapi: { log, documents: (uid) => documents[uid] },
  });
  const previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);

  try {
    const emailId = 'fake-email-id';
    const recipientHash = analytics.generateRecipientHash(emailId, 'person@example.test');
    await analytics.recordClick(
      emailId,
      'fake-link-hash',
      recipientHash,
      'https://destination.example.test/private?token=secret-value',
      { ip: '127.0.0.1', headers: {} }
    );
    assert.doesNotMatch(entries.join('\n'), /destination\.example\.test|secret-value|person@example\.test|fake-email-id/);
  } finally {
    if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  }
});

test('provider failure logging does not include response bodies or message fields', async () => {
  const { log, entries } = captureLogger();
  const previousFetch = global.fetch;
  const previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const router = require('../server/src/services/email-router')({ strapi: { log } });
  global.fetch = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => 'private@example.test response-body-secret',
  });

  try {
    await assert.rejects(router.sendViaSendGrid({
      name: 'fake account',
      provider: 'sendgrid',
      fromEmail: 'sender@example.test',
      config: encryptCredentials({ apiKey: 'fake-sendgrid-key' }),
    }, {
      to: 'private@example.test',
      subject: 'private subject',
      text: 'private body',
    }));

    const output = entries.join('\n');
    assert.doesNotMatch(output, /private@example\.test|response-body-secret|fake-sendgrid-key|private subject|private body/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  }
});

test('shared controller error handler logs only a safe error class', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server/src/validation.js'), 'utf8');
  const handler = source.slice(source.indexOf('function handleControllerError'));

  assert.match(handler, /strapi\.log\.error\(`\$\{logPrefix\}: \$\{err\?\.name \|\| 'Error'\}`\)/);
  assert.match(handler, /strapi\.log\.warn\(`\$\{logPrefix\}: \$\{err\.name\}`\)/);
  assert.doesNotMatch(handler, /JSON\.stringify\(err\.details\)|strapi\.log\.(?:error|warn)\([^\n]*,\s*err\s*\)/);
});
