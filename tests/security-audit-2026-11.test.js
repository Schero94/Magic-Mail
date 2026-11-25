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
