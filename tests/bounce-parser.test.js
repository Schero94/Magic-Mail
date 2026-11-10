'use strict';

/**
 * Bounce parser: RFC 3464 reports from Gmail, Exchange/Outlook and Postfix,
 * a non-standard Exim bounce, a soft (4.x.x) delay, and messages that must
 * be ignored (auto-reply, normal mail). Synthetic fixtures only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseBounce,
  looksLikeBounce,
  reasonCodeFor,
} = require('../server/src/utils/bounce-parser');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'bounces', name));

test('Gmail "address not found" (domain does not exist) is a hard bounce with DNS_NXDOMAIN', async () => {
  const result = await parseBounce(fixture('gmail-address-not-found.eml'));
  assert.equal(result.kind, 'hard');
  assert.equal(result.reasonCode, 'DNS_NXDOMAIN');
  assert.equal(result.standard, true);
  assert.deepEqual(
    result.recipients.map((r) => [r.address, r.action, r.status, r.kind]),
    [['pool-user-1@nowhere.test', 'failed', '5.1.2', 'hard']]
  );
  assert.equal(result.originalMessageId, 'a1b2c3d4e5f6a7b8c9d0e1f2@sender.example');
  assert.equal(result.outboxId, 'qxq9ilna62s28w7z4ickgfqx');
});

test('Exchange/Outlook NDR with text/rfc822-headers', async () => {
  const result = await parseBounce(fixture('outlook-ndr.eml'));
  assert.equal(result.kind, 'hard');
  assert.equal(result.reasonCode, 'SMTP_550_5_1_10');
  assert.equal(result.recipients[0].address, 'missing@fabrikam.example');
  assert.equal(result.originalMessageId, '0123456789abcdef01234567@contoso.example');
});

test('Postfix user unknown', async () => {
  const result = await parseBounce(fixture('postfix-user-unknown.eml'));
  assert.equal(result.kind, 'hard');
  assert.equal(result.reasonCode, 'SMTP_550_5_1_1');
  assert.equal(result.originalMessageId, 'ffeeddccbbaa99887766554433@sender.example');
});

test('Exim bounce without a delivery-status part uses X-Failed-Recipients', async () => {
  const result = await parseBounce(fixture('exim-nonstandard.eml'));
  assert.equal(result.standard, false);
  assert.equal(result.kind, 'hard');
  assert.equal(result.recipients[0].address, 'gone@receiver.example');
  assert.equal(result.reasonCode, 'SMTP_550_5_1_1');
  assert.equal(result.originalMessageId, '11223344556677889900aabb@sender.example');
  assert.equal(result.outboxId, 'abcDEF123');
});

test('a delayed 4.x.x report is a soft bounce', async () => {
  const result = await parseBounce(fixture('soft-delayed.eml'));
  assert.equal(result.kind, 'soft');
  assert.equal(result.recipients[0].action, 'delayed');
  assert.equal(result.reasonCode, 'SMTP_452_4_2_2');
});

test('auto-replies and normal mail are not bounces', async () => {
  assert.equal(await parseBounce(fixture('auto-reply.eml')), null);
  assert.equal(await parseBounce(fixture('normal-mail.eml')), null);
});

test('reason codes never carry free text or addresses', async () => {
  for (const name of [
    'gmail-address-not-found.eml',
    'outlook-ndr.eml',
    'postfix-user-unknown.eml',
    'exim-nonstandard.eml',
    'soft-delayed.eml',
  ]) {
    const result = await parseBounce(fixture(name));
    for (const r of result.recipients) assert.match(r.reasonCode, /^[A-Z0-9_]{3,40}$/);
  }
  assert.equal(reasonCodeFor(null, 'something odd'), 'UNKNOWN');
  assert.equal(reasonCodeFor('5.7.1', 'policy'), 'STATUS_5_7_1');
});

test('oversized or broken input is ignored', async () => {
  assert.equal(await parseBounce(Buffer.alloc(0)), null);
  assert.equal(await parseBounce(Buffer.alloc(1024 * 1024 + 1, 0x61)), null);
  assert.equal(await parseBounce('not a message at all'), null);
});

test('header pre-filter', () => {
  assert.equal(
    looksLikeBounce({ contentType: 'multipart/report; report-type=delivery-status' }),
    true
  );
  assert.equal(
    looksLikeBounce({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' }),
    true
  );
  assert.equal(looksLikeBounce({ subject: 'Undeliverable: Invoice' }), true);
  assert.equal(looksLikeBounce({ from: 'kunde@receiver.example', subject: 'Frage' }), false);
});
