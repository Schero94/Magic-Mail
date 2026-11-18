'use strict';

// Unit tests for the Brevo adapter (server/src/providers/brevo.js): config
// normalisation, the send body builder with the real router helpers, error
// hints, template variables, webhook authentication and the event mapping of
// the official Brevo example payloads (tests/fixtures/webhooks/brevo-events.json).
// Synthetic data only; no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const brevo = require('../server/src/providers/brevo');
const { getAdapter, TEMPLATE_PROVIDERS, WEBHOOK_PROVIDERS } = require('../server/src/providers');
const {
  BREVO_WEBHOOK_TOKEN,
  PIXEL_PNG,
  accountFor,
  createHarness,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');

const internals = brevo.__test__;
const EVENTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'webhooks', 'brevo-events.json'), 'utf8')
);
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

/**
 * Real router helpers (providerSendHelpers) on a harness router.
 *
 * @returns {{h: object, account: object, restore: () => void}}
 */
function helpers() {
  const restore = withEncryptionKey();
  const account = accountFor('brevo');
  const { router } = createHarness([account]);
  const h = require('../server/src/services/email-router').__test__.providerSendHelpers(router);
  return { h, account, restore };
}

/**
 * Builds a request body the way send() does (validation first).
 *
 * @param {object} emailData
 * @param {{template?: object|null, account?: object}} [options]
 * @returns {object}
 */
function build(emailData, { template = null, account: override } = {}) {
  const { h, account, restore } = helpers();
  try {
    // Provider-template sends carry __providerTemplate (no subject/body check).
    const data = template ? { ...emailData, __providerTemplate: { rowsByAccount: {} } } : emailData;
    h.validateEmailSecurity(data);
    const target = typeof override === 'function' ? override() : override || account;
    return internals.buildSendRequest({ account: target, emailData: data, template, h });
  } finally {
    restore();
  }
}

// ── registry and config ─────────────────────────────────────────────────────

test('the registry exposes the Brevo adapter for sends, templates and webhooks', () => {
  assert.equal(getAdapter('brevo'), brevo);
  assert.ok(TEMPLATE_PROVIDERS.includes('brevo'));
  assert.ok(WEBHOOK_PROVIDERS.includes('brevo'));
  assert.deepEqual([...brevo.SECRET_FIELDS], ['apiKey', 'webhookToken']);
  assert.deepEqual([...brevo.IDENTITY_FIELDS], []);
  assert.equal(brevo.label, 'Brevo');
});

test('normalizeConfig trims, keeps only known fields and requires the key on create', () => {
  assert.deepEqual(
    brevo.normalizeConfig(
      { apiKey: '  xkeysib-synthetic-0000000000  ', extra: 'dropped', host: 'evil.example.test' },
      { creating: true }
    ),
    { apiKey: 'xkeysib-synthetic-0000000000' }
  );
  for (const apiKey of [undefined, '', '   ', '********']) {
    assert.throws(
      () => brevo.normalizeConfig({ apiKey }, { creating: true }),
      (error) =>
        error.name === 'ValidationError' &&
        JSON.stringify(error.details) === JSON.stringify({ config: ['apiKey: Required'] })
    );
  }
  assert.throws(() => brevo.normalizeConfig(null), /Invalid configuration/);
  assert.throws(() => brevo.normalizeConfig([]), /Invalid configuration/);
});

test('normalizeConfig rejects malformed secrets without echoing them', () => {
  const secret = 'xkeysib with spaces SECRET-VALUE';
  for (const config of [
    { apiKey: secret },
    { apiKey: 'short' },
    { apiKey: 1234567890123456 },
    { apiKey: 'xkeysib-synthetic-0000000000', webhookToken: 'too-short' },
    { apiKey: 'xkeysib-synthetic-0000000000', webhookToken: 'has space '.repeat(5) },
  ]) {
    let caught;
    try {
      brevo.normalizeConfig(config, { creating: true });
    } catch (error) {
      caught = error;
    }
    assert.equal(caught?.name, 'ValidationError');
    assert.ok(Array.isArray(caught.details.config));
    const text = JSON.stringify({ message: caught.message, details: caught.details });
    assert.ok(!text.includes('SECRET-VALUE') && !text.includes('has space'), 'no value echo');
  }
});

test('normalizeConfig on update keeps masks and treats an empty token as "unchanged"', () => {
  assert.deepEqual(brevo.normalizeConfig({ apiKey: '********', webhookToken: '********' }), {
    apiKey: '********',
    webhookToken: '********',
  });
  assert.deepEqual(brevo.normalizeConfig({ apiKey: '********', webhookToken: '' }), {
    apiKey: '********',
  });
  assert.deepEqual(brevo.normalizeConfig({}), {});
});

test('prepareConfigForCreate generates a 256-bit base64url webhook token only when missing', () => {
  const first = brevo.prepareConfigForCreate({ apiKey: 'xkeysib-synthetic-0000000000' });
  const second = brevo.prepareConfigForCreate({ apiKey: 'xkeysib-synthetic-0000000000' });
  assert.match(first.webhookToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.webhookToken, second.webhookToken);
  const given = 'g'.repeat(40);
  assert.equal(brevo.prepareConfigForCreate({ webhookToken: given }).webhookToken, given);
  const created = brevo.normalizeConfig(
    { apiKey: 'xkeysib-synthetic-0000000000', webhookToken: '********' },
    { creating: true }
  );
  assert.equal(created.webhookToken, undefined, 'a mask is never stored on create');
});

test('account create generates the token; the account DTO masks both secrets', async () => {
  const restore = withEncryptionKey();
  try {
    const { accountManager } = createHarness([]);
    assert.equal(accountManager._isSecretKey('webhookToken'), true);
    assert.equal(accountManager._isSecretKey('apiKey'), true);
    const masked = accountManager._maskSecrets({ apiKey: 'xkeysib-a', webhookToken: 'b' });
    assert.deepEqual(masked, { apiKey: '********', webhookToken: '********' });
  } finally {
    restore();
  }
});

// ── send body ───────────────────────────────────────────────────────────────

test('send body: sender, deduped recipients with names, html and text, tags, correlation', () => {
  const body = build({
    to: ['Ada <ada@example.test>', 'ADA@example.test'],
    cc: 'Bob <bob@example.test>, ada@example.test',
    bcc: ['carol@example.test', 'bob@example.test'],
    subject: 'Order\r\nBcc: evil@example.test',
    html: '<p>Hi</p>',
    text: 'Hi',
    type: 'notification',
    __logDocumentId: 'logdoc123',
  });
  assert.deepEqual(body.sender, { email: 'noreply@brevo.example.test', name: 'Test Sender' });
  assert.deepEqual(body.to, [{ email: 'ada@example.test', name: 'Ada' }]);
  assert.deepEqual(body.cc, [{ email: 'bob@example.test', name: 'Bob' }]);
  assert.deepEqual(body.bcc, [{ email: 'carol@example.test' }]);
  assert.equal(body.subject, 'OrderBcc: evil@example.test', 'CR/LF stripped');
  assert.equal(body.htmlContent, '<p>Hi</p>');
  assert.equal(body.textContent, 'Hi');
  assert.deepEqual(body.tags, ['magic-mail', 'notification']);
  assert.equal(body.headers['X-Mailin-custom'], 'magicmail_id=logdoc123');
  assert.equal(body.headers['X-Email-Type'], 'notification');
  assert.equal(body.headers['Auto-Submitted'], 'auto-generated');
  assert.equal(body.templateId, undefined);
  assert.equal(body.params, undefined);
});

test('send body: text-only mail sends textContent only; empty cc/bcc are left out', () => {
  const body = build({ to: 'a@example.test', subject: 's', text: 'plain' });
  assert.equal(body.textContent, 'plain');
  assert.equal(body.htmlContent, undefined);
  assert.equal(body.cc, undefined);
  assert.equal(body.bcc, undefined);
  assert.equal(body.headers['X-Mailin-custom'], undefined, 'no log id, no correlation');
  assert.deepEqual(body.tags, ['magic-mail', 'transactional']);
});

test('send body: display names are cut to 70 characters', () => {
  const long = 'N'.repeat(90);
  const body = build({ to: `${long} <a@example.test>`, subject: 's', text: 't' });
  assert.equal(body.to[0].name.length, 70);
});

test('send body: Brevo-interpreted caller headers are dropped, X-Mailin-custom is ours', () => {
  const body = build({
    to: 'a@example.test',
    subject: 's',
    text: 't',
    __logDocumentId: 'logdoc9',
    headers: {
      'X-Mailin-custom': 'magicmail_id=spoofed',
      'x-mailin-tag': 'x',
      'X-Sib-Sandbox': 'drop',
      'x-sib-anything': 'x',
      'X-Campaign': 'c1',
      'X-Mailer': 'spoof',
      'sender.ip': '192.0.2.1',
      IdempotencyKey: 'abc',
      Bcc: 'evil@example.test',
    },
  });
  const names = Object.keys(body.headers).map((name) => name.toLowerCase());
  assert.ok(!names.includes('x-sib-sandbox') && !names.includes('x-sib-anything'));
  assert.ok(!names.includes('x-mailin-tag'));
  assert.ok(!names.includes('sender.ip') && !names.includes('idempotencykey'));
  assert.ok(!names.includes('bcc'));
  assert.equal(body.headers['X-Mailin-custom'], 'magicmail_id=logdoc9');
  assert.equal(body.headers['X-Campaign'], 'c1');
  assert.equal(body.headers['X-Mailer'], 'MagicMail/1.0');
});

test('send body: one replyTo object; several reply-to addresses are refused', () => {
  const one = build({
    to: 'a@example.test',
    subject: 's',
    text: 't',
    replyTo: 'S <s@example.test>',
  });
  assert.deepEqual(one.replyTo, { email: 's@example.test', name: 'S' });
  const fromAccount = build(
    { to: 'a@example.test', subject: 's', text: 't' },
    { account: () => ({ ...accountFor('brevo'), replyTo: 'help@example.test' }) }
  );
  assert.deepEqual(fromAccount.replyTo, { email: 'help@example.test' });
  assert.throws(
    () =>
      build({
        to: 'a@example.test',
        subject: 's',
        text: 't',
        replyTo: ['s@example.test', 'o@example.test'],
      }),
    (error) => error.name === 'ValidationError' && /one reply-to/.test(error.message)
  );
});

test('send body: attachments become base64 content + name; cid and unknown types are refused', () => {
  const body = build({
    to: 'a@example.test',
    subject: 's',
    text: 't',
    attachments: [
      { filename: 'receipt.pdf', content: 'PDF', contentType: 'application/pdf' },
      { filename: 'logo.PNG', content: PIXEL_PNG, encoding: 'base64' },
    ],
  });
  assert.deepEqual(body.attachment, [
    { content: Buffer.from('PDF').toString('base64'), name: 'receipt.pdf' },
    { content: PIXEL_PNG, name: 'logo.PNG' },
  ]);
  assert.throws(
    () =>
      build({
        to: 'a@example.test',
        subject: 's',
        html: '<img src="cid:logo">',
        attachments: [{ cid: 'logo', content: PIXEL_PNG, encoding: 'base64' }],
      }),
    (error) => error.name === 'ValidationError' && /inline \(cid\)/.test(error.message)
  );
  for (const filename of ['script.exe', 'noextension', 'archive.7z']) {
    assert.throws(
      () =>
        build({
          to: 'a@example.test',
          subject: 's',
          text: 't',
          attachments: [{ filename, content: 'x' }],
        }),
      (error) => error.name === 'ValidationError' && /file type/.test(error.message)
    );
  }
  assert.throws(
    () =>
      build({
        to: 'a@example.test',
        subject: 's',
        text: 't',
        attachments: [{ path: '/etc/passwd' }],
      }),
    /File-path and URL attachments are not supported/
  );
});

test('send body: provider template uses templateId + params, keeps an explicit subject only', () => {
  const variables = { name: 'Ada', order: { id: 7 } };
  const template = { remoteId: '42', name: 'Welcome', scope: 'default', subject: 'T', variables };
  const fromTemplate = build(
    { to: 'a@example.test', html: '<p>ignored</p>', text: 'ignored' },
    { template }
  );
  assert.equal(fromTemplate.templateId, 42);
  assert.deepEqual(fromTemplate.params, variables);
  assert.equal(fromTemplate.subject, undefined, 'the template subject applies');
  assert.equal(fromTemplate.htmlContent, undefined);
  assert.equal(fromTemplate.textContent, undefined);
  const override = build({ to: 'a@example.test', subject: 'Mine' }, { template });
  assert.equal(override.subject, 'Mine');
  assert.deepEqual(
    build({ to: 'a@example.test' }, { template: { ...template, variables: null } }).params,
    {}
  );
  assert.throws(
    () => build({ to: 'a@example.test' }, { template: { ...template, remoteId: 'welcome' } }),
    (error) => error.code === 'MAGIC_MAIL_ACCOUNT_CONFIG'
  );
});

// ── errors and hints ────────────────────────────────────────────────────────

test('hintFor maps statuses and specific codes to stable BREVO_* hints', () => {
  assert.equal(brevo.hintFor(401), 'BREVO_INVALID_KEY');
  assert.equal(brevo.hintFor(401, 'AUTH'), 'BREVO_INVALID_KEY');
  assert.equal(brevo.hintFor(403, 'AUTH'), 'BREVO_FORBIDDEN');
  assert.equal(brevo.hintFor(429), 'BREVO_RATE_LIMITED');
  assert.equal(brevo.hintFor(undefined, 'RATE_LIMITED'), 'BREVO_RATE_LIMITED');
  assert.equal(brevo.hintFor(413, 'MAGIC_MAIL_MESSAGE_TOO_LARGE'), 'BREVO_TOO_LARGE');
  assert.equal(brevo.hintFor(503), 'BREVO_UNAVAILABLE');
  assert.equal(brevo.hintFor(undefined, 'UNAVAILABLE'), 'BREVO_UNAVAILABLE');
  assert.equal(brevo.hintFor(401, 'BREVO_IP_NOT_AUTHORIZED'), 'BREVO_IP_NOT_AUTHORIZED');
  assert.equal(brevo.hintFor(400, 'BREVO_SENDER_NOT_VERIFIED'), 'BREVO_SENDER_NOT_VERIFIED');
  assert.equal(brevo.hintFor(400), null);
  assert.equal(brevo.hintFor(undefined, 'CREDENTIALS'), null);
  for (const [code, text] of Object.entries(brevo.HINTS)) {
    assert.match(code, /^BREVO_[A-Z_]+$/);
    assert.ok(text.length > 20 && !/[<{}]/.test(text), code);
  }
});

test('errorBodyHint reads documented codes and known messages, nothing else', () => {
  const hint = (status, body) => internals.errorBodyHint(JSON.stringify(body), status);
  assert.equal(hint(400, { code: 'not_enough_credits', message: 'x' }), 'BREVO_NO_CREDITS');
  assert.equal(
    hint(400, { code: 'account_under_validation', message: 'x' }),
    'BREVO_ACCOUNT_UNDER_VALIDATION'
  );
  assert.equal(hint(403, { code: 'permission_denied', message: 'x' }), 'BREVO_FORBIDDEN');
  assert.equal(
    hint(401, {
      code: 'unauthorized',
      message:
        'Unable to authenticate. We have detected you are using an unrecognised IP address 192.0.2.10.',
    }),
    'BREVO_IP_NOT_AUTHORIZED'
  );
  assert.equal(
    hint(400, {
      code: 'invalid_parameter',
      message:
        'Sending has been rejected because the sender you used noreply@example.test is not valid. Validate your sender or authenticate your domain',
    }),
    'BREVO_SENDER_NOT_VERIFIED'
  );
  assert.equal(
    hint(400, { code: 'invalid_parameter', message: 'Template not found' }),
    'BREVO_TEMPLATE_NOT_FOUND'
  );
  assert.equal(hint(401, { code: 'unauthorized', message: 'Key not found' }), null);
  assert.equal(hint(400, { code: 'invalid_parameter', message: 'to is missing' }), null);
  assert.equal(internals.errorBodyHint('not json', 400), null);
  assert.equal(internals.errorBodyHint(null, 400), null);
});

test('the error-message patterns run in linear time on adversarial input', () => {
  const inputs = [
    `sender${' '.repeat(100_000)}`,
    `sender${'a'.repeat(120)}`.repeat(5_000),
    `template${'x'.repeat(100_000)}`,
    'unrecognised i'.repeat(50_000),
    `${'authorised_'.repeat(50_000)}!`,
  ];
  const started = process.hrtime.bigint();
  for (const input of inputs) {
    internals.SENDER_MESSAGE.test(input);
    internals.TEMPLATE_MESSAGE.test(input);
    internals.IP_MESSAGE.test(input);
    internals.errorBodyHint(JSON.stringify({ code: 'x', message: input }), 400);
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 500, `patterns took ${ms} ms`);
});

test('rateLimitResetMs reads x-sib-ratelimit-reset as seconds remaining, bounded to 24 h', () => {
  const at = (value) => ({
    headers: new Headers(value === null ? {} : { 'x-sib-ratelimit-reset': value }),
  });
  assert.equal(internals.rateLimitResetMs(at('45')), 45_000);
  assert.equal(internals.rateLimitResetMs(at('0')), 0);
  assert.equal(internals.rateLimitResetMs(at('86401')), 0);
  assert.equal(internals.rateLimitResetMs(at('1.5')), 0);
  assert.equal(internals.rateLimitResetMs(at('soon')), 0);
  assert.equal(internals.rateLimitResetMs(at(null)), 0);
});

// ── template variables ──────────────────────────────────────────────────────

test('templateVariables maps params.<path> to Magic Mail data keys', () => {
  const source = [
    'Hi {{ params.name }} {{params.order.id}}',
    '{{ params.coupon | default : "none" }}',
    '{% if params.vip %}VIP{% endif %}',
    '{% for item in params.items %}{{ item.label }}{% endfor %}',
    '{{ contact.FIRSTNAME }} {{ myparams.x }} {{ params. }} {{ params.1bad }}',
    '{{ params.name }}',
  ].join('\n');
  const { variables, truncated } = brevo.templateVariables(source);
  assert.equal(truncated, false);
  assert.deepEqual(
    variables.map((v) => [v.path, v.root, v.blocks]),
    [
      ['coupon', 'coupon', []],
      ['items', 'items', ['for']],
      ['name', 'name', []],
      ['order.id', 'order', []],
      ['vip', 'vip', ['if']],
    ]
  );
  assert.deepEqual(brevo.templateVariables(undefined), { variables: [], truncated: false });
  const many = Array.from({ length: 5 }, (_, i) => `{{ params.v${i} }}`).join('');
  assert.equal(brevo.templateVariables(many, { maxVariables: 3 }).truncated, true);
});

test('templateVariables stays linear on unclosed and repeated tags', () => {
  const inputs = ['{{'.repeat(300_000), '{% params.'.repeat(80_000), `{{ ${'params.a'.repeat(90)}`];
  const started = process.hrtime.bigint();
  for (const input of inputs) brevo.templateVariables(input);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1000, `took ${ms} ms`);
});

// ── webhook ─────────────────────────────────────────────────────────────────

const config = { apiKey: 'xkeysib-synthetic-0000000000', webhookToken: BREVO_WEBHOOK_TOKEN };
const body = (value) => Buffer.from(JSON.stringify(value));

test('webhook auth: bearer token and custom header accepted; wrong, missing or other scheme are 401', async () => {
  const event = EVENTS.Delivered;
  const call = (headers, cfg = config) =>
    brevo.webhook({ config: cfg, rawBody: body(event), headers, now: NOW });
  assert.equal((await call({ authorization: `Bearer ${BREVO_WEBHOOK_TOKEN}` })).status, 200);
  assert.equal((await call({ authorization: `bearer   ${BREVO_WEBHOOK_TOKEN}` })).status, 200);
  assert.equal((await call({ 'x-magic-mail-webhook-token': BREVO_WEBHOOK_TOKEN })).status, 200);
  assert.equal((await call({ authorization: `Bearer ${BREVO_WEBHOOK_TOKEN}x` })).status, 401);
  assert.equal((await call({ authorization: 'Bearer short' })).status, 401);
  assert.equal((await call({ authorization: `Basic ${BREVO_WEBHOOK_TOKEN}` })).status, 401);
  assert.equal(
    (
      await call({
        authorization: 'Basic abc',
        'x-magic-mail-webhook-token': BREVO_WEBHOOK_TOKEN,
      })
    ).status,
    401,
    'an Authorization header with another scheme is not overridden by the custom header'
  );
  assert.equal((await call({ authorization: BREVO_WEBHOOK_TOKEN })).status, 401);
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ authorization: ['Bearer x', 'Bearer y'] })).status, 401);
  for (const webhookToken of [undefined, '', '********']) {
    const result = await call(
      { authorization: `Bearer ${webhookToken}` },
      { ...config, webhookToken }
    );
    assert.equal(result.status, 401, 'no usable token in the config');
  }
});

test('webhook: malformed bodies are 400 after authentication; the replay key hashes the body', async () => {
  const headers = { authorization: `Bearer ${BREVO_WEBHOOK_TOKEN}` };
  for (const raw of [
    Buffer.from('not json'),
    Buffer.from('"text"'),
    Buffer.from('null'),
    Buffer.alloc(0),
  ]) {
    const result = await brevo.webhook({ config, rawBody: raw, headers, now: NOW });
    assert.equal(result.status, 400);
  }
  const unauthenticated = await brevo.webhook({
    config,
    rawBody: Buffer.from('not json'),
    headers: {},
    now: NOW,
  });
  assert.equal(unauthenticated.status, 401, 'authentication runs before parsing');
  const a = await brevo.webhook({ config, rawBody: body(EVENTS.Delivered), headers, now: NOW });
  const b = await brevo.webhook({ config, rawBody: body(EVENTS.Delivered), headers, now: NOW });
  assert.match(a.replayKey, /^[0-9a-f]{64}$/);
  assert.equal(a.replayKey, b.replayKey);
});

test('webhook: a batched array is mapped event by event and bounded', async () => {
  const headers = { authorization: `Bearer ${BREVO_WEBHOOK_TOKEN}` };
  const batch = Object.values(EVENTS);
  const result = await brevo.webhook({ config, rawBody: body(batch), headers, now: NOW });
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.events.map((event) => event.kind),
    [
      'clicked',
      'deferred',
      'delivered',
      'deferred',
      'bounced',
      'complained',
      'opened',
      'bounced',
      'blocked',
      'bounced',
      'unsubscribed',
    ]
  );
  const huge = Array.from({ length: internals.MAX_WEBHOOK_EVENTS + 50 }, () => EVENTS.Delivered);
  const bounded = await brevo.webhook({ config, rawBody: body(huge), headers, now: NOW });
  assert.equal(bounded.events.length, internals.MAX_WEBHOOK_EVENTS);
});

test('event mapping of the official examples (exact event names)', () => {
  const map = (name, overrides = {}) => internals.mapEvent({ ...EVENTS[name], ...overrides }, NOW);
  const expected = {
    Sent: null,
    Clicked: { kind: 'clicked', reasonCode: 'BREVO_CLICK', suppress: null, notDelivered: false },
    Deferred: { kind: 'deferred', reasonCode: 'BREVO_DEFERRED', suppress: null },
    Delivered: { kind: 'delivered', reasonCode: 'BREVO_DELIVERED', suppress: null },
    'Soft bounced': { kind: 'deferred', reasonCode: 'BREVO_SOFT_BOUNCE', suppress: null },
    'Hard bounced': { kind: 'bounced', reasonCode: 'BREVO_HARD_BOUNCE', suppress: 'bounce' },
    Spam: { kind: 'complained', reasonCode: 'BREVO_SPAM', suppress: 'complaint' },
    'First opening': null,
    Opened: { kind: 'opened', reasonCode: 'BREVO_OPENED' },
    'Invalid email': {
      kind: 'bounced',
      reasonCode: 'BREVO_INVALID_EMAIL',
      suppress: 'bounce',
      notDelivered: true,
    },
    Blocked: { kind: 'blocked', reasonCode: 'BREVO_BLOCKED', suppress: null, notDelivered: true },
    Unsubscribed: { kind: 'unsubscribed', reasonCode: 'BREVO_UNSUBSCRIBED' },
    'Proxy open': null,
    'Unique proxy open': null,
  };
  for (const [name, want] of Object.entries(expected)) {
    const got = map(name);
    if (want === null) {
      assert.equal(got, null, `${name} is ignored`);
      continue;
    }
    for (const [key, value] of Object.entries(want))
      assert.equal(got[key], value, `${name}.${key}`);
    assert.equal(got.messageId, normalize(EVENTS[name]['message-id']), `${name} message id`);
    assert.equal(got.recipient, 'recipient@example.test');
    assert.match(got.eventId, /^[0-9a-f]{64}$/);
  }
  // The documented "Error" example carries event "invalid_email" (doc bug);
  // the real `error` event maps to dropped.
  assert.equal(EVENTS.Error.event, 'invalid_email');
  const error = map('Error', { event: 'error' });
  assert.equal(error.kind, 'dropped');
  assert.equal(error.notDelivered, true);
  assert.equal(error.reasonCode, 'BREVO_ERROR');
  // Configuration-style aliases.
  assert.equal(map('Hard bounced', { event: 'hardBounce' }).reasonCode, 'BREVO_HARD_BOUNCE');
  assert.equal(map('Soft bounced', { event: 'softBounce' }).kind, 'deferred');
  assert.equal(map('Invalid email', { event: 'invalid' }).suppress, 'bounce');
  assert.equal(map('Delivered', { event: 'something_new' }), null);
  assert.equal(map('Delivered', { event: '__proto__' }), null);
  assert.equal(internals.mapEvent(null), null);
  assert.equal(internals.mapEvent([EVENTS.Delivered]), null);
});

/** @param {string} id @returns {string|null} */
function normalize(id) {
  return require('../server/src/utils/message-id').normalizeMessageId(id);
}

test('event mapping: correlation from X-Mailin-custom, click url, recipient, ids', () => {
  const clicked = internals.mapEvent(
    { ...EVENTS.Clicked, 'X-Mailin-custom': 'magicmail_id=logdoc42' },
    NOW
  );
  assert.equal(clicked.magicmailId, 'logdoc42');
  assert.equal(clicked.url, 'https://shop.example.test/product');
  assert.equal(clicked.messageId, '201798300811.5787683@relay.example.test');
  for (const custom of ['some_custom_header', 'magicmail_id=bad id', 'magicmail_id=', 7]) {
    assert.equal(
      internals.mapEvent({ ...EVENTS.Delivered, 'X-Mailin-custom': custom }, NOW).magicmailId,
      null
    );
  }
  const withBrackets = internals.mapEvent(
    {
      ...EVENTS.Delivered,
      'message-id': '<abc.123@smtp-relay.mailin.fr>',
      email: ' Ada@Example.TEST ',
    },
    NOW
  );
  assert.equal(withBrackets.messageId, 'abc.123@smtp-relay.mailin.fr');
  assert.equal(withBrackets.recipient, 'ada@example.test');
  const a = internals.mapEvent(EVENTS.Delivered, NOW);
  const b = internals.mapEvent({ ...EVENTS.Delivered }, NOW);
  const c = internals.mapEvent(
    { ...EVENTS.Delivered, ts_event: EVENTS.Delivered.ts_event + 1 },
    NOW
  );
  assert.equal(a.eventId, b.eventId, 'a retried event keeps its id');
  assert.notEqual(a.eventId, c.eventId);
  assert.notEqual(
    internals.mapEvent(EVENTS.Clicked, NOW).eventId,
    internals.mapEvent({ ...EVENTS.Clicked, link: 'https://shop.example.test/other' }, NOW).eventId
  );
});

test('event time: ts_event, then ts, then ts_epoch in ms or seconds; implausible values are null', () => {
  assert.equal(internals.eventTimeMs({ ts_event: 1604933654, ts: 1 }, NOW), 1604933654000);
  assert.equal(internals.eventTimeMs({ ts: 1604933619 }, NOW), 1604933619000);
  assert.equal(internals.eventTimeMs({ ts_epoch: 1534486682000 }, NOW), 1534486682000);
  assert.equal(internals.eventTimeMs({ ts_epoch: 1604933623 }, NOW), 1604933623000);
  assert.equal(internals.eventTimeMs({ ts_event: 1 }, NOW), null);
  assert.equal(internals.eventTimeMs({ ts_event: NOW / 1000 + 3 * 86400 }, NOW), null);
  assert.equal(internals.eventTimeMs({ ts_event: '1604933654' }, NOW), null);
  assert.equal(internals.eventTimeMs({}, NOW), null);
});

test('tokensMatch compares tokens of different lengths without throwing', () => {
  assert.equal(internals.tokensMatch('a', 'a'.repeat(64)), false);
  assert.equal(internals.tokensMatch('same-token-value', 'same-token-value'), true);
  assert.equal(internals.presentedToken({ 'x-magic-mail-webhook-token': 'x'.repeat(600) }), null);
});
