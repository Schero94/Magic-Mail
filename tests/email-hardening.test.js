'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

test('attachment metadata rejects CR/LF and invalid MIME/encoding', () => {
  const { validate } = require('../server/src/validation');
  const base = { to: 'user@example.com', subject: 'Hi', text: 'body' };

  assert.throws(() => validate('content.send', {
    ...base,
    attachments: [{ filename: 'a\r\nContent-Type: text/html', content: 'x' }],
  }), 'CR/LF in filename must be rejected');

  assert.throws(() => validate('content.send', {
    ...base,
    attachments: [{ contentType: 'text/html\r\nX-Injected: 1', content: 'x' }],
  }), 'CR/LF in contentType must be rejected');

  assert.throws(() => validate('content.send', {
    ...base,
    attachments: [{ encoding: 'weird-encoding', content: 'x' }],
  }), 'unknown encoding must be rejected');

  const ok = validate('content.send', {
    ...base,
    attachments: [{ filename: 'report.pdf', contentType: 'application/pdf', encoding: 'base64', content: 'x' }],
  });
  assert.equal(ok.attachments[0].filename, 'report.pdf');
});

test('email HTML is sanitized with the allowlist (no script/iframe/event handlers)', () => {
  const router = require('../server/src/services/email-router')({ strapi: { log: quietLog } });
  const data = {
    to: 'user@example.com',
    subject: 'Newsletter',
    html: '<p>Hello</p><script>alert(1)</script><iframe src="evil"></iframe><a href="javascript:alert(2)" onclick="x()">link</a>',
    text: 'Hello',
  };

  router.validateEmailSecurity(data);

  assert.ok(!/<script/i.test(data.html), 'script tag removed');
  assert.ok(!/<iframe/i.test(data.html), 'iframe removed');
  assert.ok(!/onclick/i.test(data.html), 'inline event handler removed');
  assert.ok(!/javascript:/i.test(data.html), 'javascript: scheme removed');
  assert.ok(/Hello/.test(data.html), 'legitimate content preserved');
});
