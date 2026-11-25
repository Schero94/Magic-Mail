'use strict';

/**
 * Regression tests for the November 2026 security audit (MM-SA-*). Each
 * section reproduces one confirmed finding against the real module and must
 * fail on v4.10.0. Synthetic data only; no network beyond 127.0.0.1.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MAGIC_MAIL_ENCRYPTION_KEY =
  process.env.MAGIC_MAIL_ENCRYPTION_KEY || 'synthetic-encryption-key-0123456789abcdef0123';

/** Runs fn and returns the elapsed wall time in milliseconds. */
async function elapsed(fn) {
  const start = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

// ---------------------------------------------------------------------------
// MM-SA-03: bounce parser ReDoS (remote, unauthenticated mail sender)
// ---------------------------------------------------------------------------

const { parseBounce } = require('../server/src/utils/bounce-parser');

/** A non-standard bounce from a "mailer daemon" with an attacker-chosen body. */
function daemonBounce(body, recipients = 2) {
  const failed = Array.from({ length: recipients }, (_, i) => `r${i}@victim.test`).join(', ');
  return Buffer.from(
    [
      'From: Mail Delivery System <mailer-daemon@attacker.test>',
      'To: bounces@sender.example',
      'Subject: Undelivered Mail Returned to Sender',
      `X-Failed-Recipients: ${failed}`,
      'Content-Type: text/plain; charset=us-ascii',
      '',
      body,
    ].join('\r\n')
  );
}

test('MM-SA-03: a long single-line "domain ..." body is parsed within the time budget', async () => {
  // ~900 KB on one line: quadratic `domain .* could not be found` took minutes.
  const body = 'domain '.repeat(130_000);
  let result;
  const ms = await elapsed(async () => {
    result = await parseBounce(daemonBounce(body, 50));
  });
  assert.ok(result, 'still recognised as a bounce');
  assert.ok(ms < 1500, `parseBounce took ${ms.toFixed(0)} ms`);
});

test('MM-SA-03: a body of blank lines does not trigger quadratic header scanning', async () => {
  const body = ' \r\n'.repeat(300_000);
  const ms = await elapsed(() => parseBounce(daemonBounce(body)));
  assert.ok(ms < 1500, `parseBounce took ${ms.toFixed(0)} ms`);
});

test('MM-SA-03: reason codes and inline returned headers keep working', async () => {
  const body = [
    'This is the mail system at host mx.sender.example.',
    'Diagnostic: domain nowhere.test could not be found',
    'Status: 5.1.2',
    '',
    '------ This is a copy of the message headers. ------',
    '   Message-ID: <abcdef0123456789abcdef01@sender.example>',
    'X-MagicMail-Outbox: qxq9ilna62s28w7z4ickgfqx',
  ].join('\r\n');
  const result = await parseBounce(daemonBounce(body, 1));
  assert.equal(result.reasonCode, 'DNS_NXDOMAIN');
  assert.equal(result.originalMessageId, 'abcdef0123456789abcdef01@sender.example');
  assert.equal(result.outboxId, 'qxq9ilna62s28w7z4ickgfqx');
});

// ---------------------------------------------------------------------------
// MM-SA-01: changing the bounce-monitoring IMAP host must not send a stored
// secret to the new host without re-entering it
// ---------------------------------------------------------------------------

const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/** Minimal Strapi for account-manager.updateAccount (one in-memory table). */
function accountStrapi(accounts) {
  return {
    log: quietLog,
    documents: () => ({
      findOne: async ({ documentId }) => accounts.find((r) => r.documentId === documentId) || null,
      findMany: async () => [],
      create: async ({ data }) => data,
      update: async ({ documentId, data }) => {
        const row = accounts.find((r) => r.documentId === documentId);
        Object.assign(row, data);
        return { ...row };
      },
    }),
    plugin: () => ({ service: () => ({}) }),
  };
}

function smtpAccount(bounceMonitor) {
  return {
    documentId: 'acc1',
    name: 'SMTP',
    provider: 'smtp',
    fromEmail: 'noreply@sender.example',
    config: encryptCredentials({
      host: 'smtp.sender.example',
      port: 587,
      user: 'noreply@sender.example',
      pass: 'stored-smtp-secret',
      imapPass: 'stored-imap-secret',
    }),
    bounceMonitor,
  };
}

const monitorAt = (host, extra = {}) => ({
  enabled: true,
  mode: 'imap',
  imap: { host, port: 993, secure: true, ...extra },
});

test('MM-SA-01: a new IMAP host with "use the SMTP login" requires the SMTP password again', async () => {
  const accounts = [smtpAccount(monitorAt('imap.sender.example', { useSmtpLogin: true }))];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  // No `config` at all: the old code stored the new host unchecked.
  await assert.rejects(
    manager.updateAccount('acc1', {
      bounceMonitor: monitorAt('imap.attacker.example', { useSmtpLogin: true }),
    }),
    (err) => err.name === 'ValidationError' && /pass/.test(err.message)
  );
  // The admin UI path: mirrored host plus an empty imapPass.
  await assert.rejects(
    manager.updateAccount('acc1', {
      config: { pass: '********', imapHost: 'imap.attacker.example', imapPass: '' },
      bounceMonitor: monitorAt('imap.attacker.example', { useSmtpLogin: true }),
    }),
    (err) => err.name === 'ValidationError'
  );
  assert.equal(accounts[0].bounceMonitor.imap.host, 'imap.sender.example', 'nothing stored');
});

test('MM-SA-01: switching an existing IMAP host to the SMTP login requires the SMTP password', async () => {
  const accounts = [smtpAccount(monitorAt('imap.other.example', { user: 'b@sender.example' }))];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  await assert.rejects(
    manager.updateAccount('acc1', {
      bounceMonitor: monitorAt('imap.other.example', { useSmtpLogin: true }),
    }),
    (err) => err.name === 'ValidationError' && /pass/.test(err.message)
  );
});

test('MM-SA-01: a separate IMAP password must be re-entered for a new host; fresh secrets pass', async () => {
  const accounts = [smtpAccount(monitorAt('imap.sender.example', { user: 'b@sender.example' }))];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  await assert.rejects(
    manager.updateAccount('acc1', {
      bounceMonitor: monitorAt('imap.attacker.example', { user: 'b@sender.example' }),
    }),
    (err) => err.name === 'ValidationError' && /imapPass/.test(err.message)
  );
  await manager.updateAccount('acc1', {
    config: { imapPass: 'fresh-imap-secret' },
    bounceMonitor: monitorAt('imap.new.example', { user: 'b@sender.example' }),
  });
  assert.equal(accounts[0].bounceMonitor.imap.host, 'imap.new.example');
  assert.equal(decryptCredentials(accounts[0].config).imapPass, 'fresh-imap-secret');
});

test('MM-SA-01: unchanged hosts, port changes and the server-derived IMAP host need no re-entry', async () => {
  const accounts = [smtpAccount(null)];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  // First enable: empty host = imap.<smtp domain>, derived by the server.
  await manager.updateAccount('acc1', { bounceMonitor: monitorAt('', { useSmtpLogin: true }) });
  await manager.updateAccount('acc1', {
    bounceMonitor: monitorAt('imap.sender.example', { useSmtpLogin: true }),
  });
  await manager.updateAccount('acc1', {
    bounceMonitor: monitorAt('imap.sender.example', {
      useSmtpLogin: true,
      port: 143,
      secure: false,
    }),
  });
  assert.equal(accounts[0].bounceMonitor.imap.port, 143);
});
