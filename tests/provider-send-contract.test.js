'use strict';

// Contract tests for normal (non-template) sends: every SendGrid and Mailgun
// request the send path builds, and every fake provider response, is checked
// against the official OpenAPI documents vendored in tests/fixtures/openapi
// (byte-identical copies of the provider-templates branch, pinned below):
// - SendGrid: twilio/sendgrid-oai tsg_mail_v3.json, POST /v3/mail/send
// - Mailgun: documentation.mailgun.com/_bundle/docs/mailgun/api-reference/send/mailgun.json,
//   POST /v3/{domain_name}/messages
// Rules the schemas can not express (unique recipients, reserved headers,
// size limits, 16 KB of Mailgun send options) are asserted directly.
// Synthetic data only; fetch is faked.

const test = require('node:test');
const assert = require('node:assert/strict');

const { OpenApiContract, fixtureSha256 } = require('./helpers/openapi-contract');
const {
  PIXEL_PNG,
  accountFor,
  createHarness,
  fakeFetch,
  jsonResponse,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');
const { classifyDeliveryError } = require('../server/src/utils/delivery-outcome');
const { toClientSendMessage } = require('../server/src/utils/client-errors');

/** SHA-256 of the vendored files and of the official sources they were extracted from. */
const PINNED = {
  'sendgrid-mail': {
    file: '9364edadd1565ffc917cb1d8eaf14e6d6967f86f9eed6bfd9d19653efc7302f5',
    source: '1bf9b256780b4c32a48e054eb9a8f93c03b586f9586d12b0ebbcdde9c170fac3',
  },
  mailgun: {
    file: '8d7672d8215cec03e04f581834d9b5aad5cf4d8372afb55348f8a9af9ecf5d4b',
    source: '3bf29afd36c06a9a7998ed492838ed3fd4a1f4578799af285998ad73de1f8151',
  },
};

/**
 * Where the official OpenAPI document contradicts long-standing API
 * behaviour. Everything else must match the spec exactly.
 */
const KNOWN_DEVIATIONS = [
  {
    contract: 'sendgrid-mail',
    pattern: /^body\/custom_args must be string$/,
    reason:
      'Pre-existing (4.x): Magic Mail sends top-level custom_args as an object of strings. The spec types it as a string; the personalization-level custom_args is an object and the Mail Send docs describe both as key/value pairs.',
  },
];

const sgMail = new OpenApiContract('sendgrid-mail');
const mailgun = new OpenApiContract('mailgun');

const withoutKnown = (contract, errors) =>
  errors.filter(
    (error) => !KNOWN_DEVIATIONS.some((d) => d.contract === contract.name && d.pattern.test(error))
  );

/** Headers SendGrid reserves (tsg_mail_v3.json `headers` description, Mail Send errors). */
const SENDGRID_RESERVED_HEADERS = [
  'x-sg-id',
  'x-sg-eid',
  'received',
  'dkim-signature',
  'content-type',
  'content-transfer-encoding',
  'to',
  'from',
  'subject',
  'reply-to',
  'cc',
  'bcc',
];

/**
 * Sends `message` through send() with one account and returns the request.
 *
 * @param {'sendgrid'|'mailgun'} provider
 * @param {object} message
 * @param {object} [config] - Extra account config
 * @returns {Promise<object>} The recorded request
 */
async function capture(provider, message, config = {}) {
  const restoreKey = withEncryptionKey();
  const fake = fakeFetch();
  try {
    const { router } = createHarness([accountFor(provider, config)]);
    await router.send(message);
    assert.equal(fake.calls.length, 1);
    return fake.calls[0];
  } finally {
    fake.restore();
    restoreKey();
  }
}

/** Asserts that a recorded SendGrid request satisfies the contract and invariants. */
function assertSendGridRequest(call) {
  assert.deepEqual(
    withoutKnown(
      sgMail,
      sgMail.checkRequest({ method: call.method, url: call.url, json: call.json })
    ),
    [],
    'SendGrid request matches tsg_mail_v3.json'
  );
  const body = call.json;
  const addresses = body.personalizations.flatMap((p) =>
    [...(p.to || []), ...(p.cc || []), ...(p.bcc || [])].map((entry) => entry.email.toLowerCase())
  );
  assert.equal(new Set(addresses).size, addresses.length, 'every address appears once');
  for (const name of Object.keys(body.headers || {})) {
    assert.ok(!SENDGRID_RESERVED_HEADERS.includes(name.toLowerCase()), `reserved header ${name}`);
  }
  assert.ok(Object.values(body.custom_args).every((value) => typeof value === 'string'));
  assert.ok(call.bodyBytes < 30_000_000);
  assert.ok(!(body.reply_to && body.reply_to_list), 'reply_to and reply_to_list are exclusive');
}

/** Asserts that a recorded Mailgun request satisfies the contract and the 16 KB rule. */
function assertMailgunRequest(call) {
  assert.deepEqual(
    mailgun.checkRequest({ method: call.method, url: call.url, form: call.form }),
    [],
    'Mailgun request matches the messages operation'
  );
  const optionBytes = call.form
    .filter(([name]) => /^[ohvt]:/.test(name))
    .reduce((sum, [name, value]) => sum + Buffer.byteLength(name) + Buffer.byteLength(value), 0);
  assert.ok(optionBytes <= 16384, 'send options are at most 16 KB');
  for (const [name, value] of call.form.filter(([n]) => n === 'o:tag')) {
    assert.match(value, /^[A-Za-z0-9_.-]{1,128}$/, name);
  }
}

test('the vendored OpenAPI files are the pinned copies', () => {
  for (const [name, pin] of Object.entries(PINNED)) {
    assert.equal(fixtureSha256(name), pin.file, `${name}.json changed`);
    const contract = name === 'mailgun' ? mailgun : sgMail;
    assert.equal(contract.source.sha256, pin.source, `${name} official source`);
  }
  // The known deviation is still in the spec; remove it here once fixed upstream.
  assert.equal(
    sgMail.spec.components.requestBodies.PostMailSend.content['application/json'].schema.properties
      .custom_args.type,
    'string'
  );
});

test('SendGrid: several replyTo addresses become reply_to_list (no reply_to)', async () => {
  const call = await capture('sendgrid', {
    to: 'a@example.test',
    subject: 's',
    text: 't',
    replyTo: ['Support <support@example.test>', 'ops@example.test'],
  });
  assertSendGridRequest(call);
  assert.equal(call.json.reply_to, undefined);
  assert.deepEqual(call.json.reply_to_list, [
    { email: 'support@example.test', name: 'Support' },
    { email: 'ops@example.test' },
  ]);
});

test('SendGrid: one replyTo address becomes reply_to', async () => {
  const call = await capture('sendgrid', {
    to: 'a@example.test',
    subject: 's',
    text: 't',
    replyTo: 'support@example.test',
  });
  assertSendGridRequest(call);
  assert.deepEqual(call.json.reply_to, { email: 'support@example.test' });
  assert.equal(call.json.reply_to_list, undefined);
});

test('SendGrid: inline cid image, attachment, text before html, cc/bcc, names, metadata', async () => {
  const call = await capture('sendgrid', {
    to: ['Ada <ada@example.test>', 'ADA@example.test'],
    cc: 'Bob <bob@example.test>, ada@example.test',
    bcc: ['carol@example.test'],
    subject: 'All fields',
    text: 'plain',
    html: '<p>Hi</p><img src="cid:logo"><a href="https://shop.example.test/a">Shop</a>',
    headers: { 'X-SG-ID': 'spoof', 'X-SG-EID': 'spoof', 'X-Campaign': 'c1' },
    attachments: [
      { cid: 'logo', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
      { filename: 'r.txt', content: 'receipt', contentType: 'text/plain' },
    ],
  });
  assertSendGridRequest(call);
  const body = call.json;
  assert.deepEqual(body.personalizations[0].to, [{ email: 'ada@example.test', name: 'Ada' }]);
  assert.deepEqual(body.personalizations[0].cc, [{ email: 'bob@example.test', name: 'Bob' }]);
  assert.deepEqual(body.personalizations[0].bcc, [{ email: 'carol@example.test' }]);
  assert.deepEqual(
    body.content.map((part) => part.type),
    ['text/plain', 'text/html']
  );
  assert.deepEqual(
    body.attachments.map(({ content, ...rest }) => rest),
    [
      { filename: 'logo', type: 'image/png', disposition: 'inline', content_id: 'logo' },
      { filename: 'r.txt', type: 'text/plain', disposition: 'attachment' },
    ]
  );
  assert.equal(body.headers['X-Campaign'], 'c1');
  assert.equal(body.custom_args.magicmail_id, 'logdoc123');
  assert.deepEqual(body.tracking_settings, {
    click_tracking: { enable: false },
    open_tracking: { enable: false },
  });
});

test('SendGrid: EU accounts call a host listed in the spec servers', async () => {
  const eu = await capture(
    'sendgrid',
    { to: 'a@example.test', subject: 's', text: 't' },
    {
      region: 'eu',
    }
  );
  const us = await capture('sendgrid', { to: 'a@example.test', subject: 's', text: 't' });
  assertSendGridRequest(eu);
  assertSendGridRequest(us);
  assert.deepEqual(
    sgMail.spec.servers.map((server) => `${server.url}/v3/mail/send`).sort(),
    [eu.url, us.url].sort()
  );
});

test('SendGrid: a body of 30 MB or more never reaches fetch', async () => {
  const restoreKey = withEncryptionKey();
  const fake = fakeFetch();
  try {
    const { router } = createHarness([accountFor('sendgrid')]);
    await assert.rejects(
      router.send({
        to: 'a@example.test',
        subject: 's',
        text: 't',
        attachments: [{ filename: 'big.bin', content: Buffer.alloc(23_000_000, 1) }],
      }),
      (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE'
    );
    assert.equal(fake.calls.length, 0);
  } finally {
    fake.restore();
    restoreKey();
  }
});

/** Spec example body of a SendGrid response (components.responses.PostMailSend<status>). */
function sendGridExample(status) {
  const response = sgMail.spec.components.responses[`PostMailSend${status}`];
  return Object.values(response.content['application/json'].examples)[0].value;
}

test('SendGrid responses: 202 with X-Message-Id, documented errors, sandbox 200', async () => {
  const restoreKey = withEncryptionKey();
  try {
    const url = 'https://api.sendgrid.com/v3/mail/send';
    assert.deepEqual(sgMail.checkResponse({ method: 'POST', url, status: 202 }), []);
    let fake = fakeFetch(() => jsonResponse(202, undefined, { 'x-message-id': 'sgid-1' }));
    const { router } = createHarness([]);
    const message = () => ({ to: 'a@example.test', subject: 's', text: 't' });
    assert.equal(
      (await router.sendViaSendGrid(accountFor('sendgrid'), message())).messageId,
      'sgid-1'
    );
    fake.restore();

    for (const status of [400, 401, 403, 413]) {
      const example = sendGridExample(status);
      // A body that echoes an address must never reach the caller.
      const body = {
        errors: [
          ...example.errors,
          { message: 'leak@example.test is invalid', field: 'personalizations.0.to.0.email' },
        ],
      };
      assert.deepEqual(sgMail.checkResponse({ method: 'POST', url, status, json: body }), []);
      fake = fakeFetch(() => jsonResponse(status, body));
      const error = await router.sendViaSendGrid(accountFor('sendgrid'), message()).catch((e) => e);
      fake.restore();
      assert.equal(error.status, status);
      assert.equal(error.provider, 'sendgrid');
      assert.deepEqual(error.providerFields, ['personalizations.0.to.0.email']);
      const client = toClientSendMessage(error);
      assert.equal(client, `SendGrid API request failed: ${status}`);
      assert.ok(!JSON.stringify({ ...error, client }).includes('leak@example.test'));
      assert.equal(
        classifyDeliveryError(error),
        status === 401 || status === 403 ? 'transient' : 'permanent'
      );
    }

    // Sandbox mode answers 200 without X-Message-Id (Sandbox Mode docs);
    // the spec lists only 202, so the response is not contract-checked.
    fake = fakeFetch(() => jsonResponse(200));
    assert.deepEqual(await router.sendViaSendGrid(accountFor('sendgrid'), message()), {
      messageId: null,
      response: 'Accepted',
    });
    fake.restore();
  } finally {
    restoreKey();
  }
});

test('Mailgun: the full form matches the spec (h:, inline, attachment, o:tracking-*, o:tag, v:)', async () => {
  const call = await capture(
    'mailgun',
    {
      to: ['Ada <ada@example.test>', 'bob@example.test'],
      cc: 'carol@example.test',
      bcc: 'dave@example.test',
      subject: 'All fields',
      text: 'plain',
      html: '<p>Hi</p><img src="cid:logo.png"><a href="https://shop.example.test/a">Shop</a>',
      replyTo: 'support@example.test',
      headers: { 'X-Campaign': 'c1' },
      type: 'marketing',
      priority: 'low',
      unsubscribeUrl: 'https://example.test/u',
      attachments: [
        { cid: 'logo.png', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
        { filename: 'r.txt', content: 'receipt', contentType: 'text/plain' },
      ],
    },
    { region: 'eu' }
  );
  assertMailgunRequest(call);
  const values = (name) => call.form.filter(([key]) => key === name).map(([, value]) => value);
  assert.deepEqual(values('h:Reply-To'), ['support@example.test']);
  assert.deepEqual(values('h:X-Campaign'), ['c1']);
  assert.deepEqual(values('o:tracking-opens'), ['no']);
  assert.deepEqual(values('o:tracking-clicks'), ['no']);
  assert.deepEqual(values('o:tag'), ['marketing']);
  assert.deepEqual(values('v:magicmail_email_type'), ['marketing']);
  assert.deepEqual(values('v:magicmail_priority'), ['low']);
  assert.deepEqual(values('v:magicmail_id'), ['logdoc123']);
  assert.deepEqual(call.files, [
    { field: 'inline', filename: 'logo.png', type: 'image/png', size: 68 },
    { field: 'attachment', filename: 'r.txt', type: 'text/plain', size: 7 },
  ]);
  assert.equal(call.url, 'https://api.eu.mailgun.net/v3/mg.example.test/messages');
});

test('Mailgun: region URLs are the spec servers', async () => {
  const us = await capture('mailgun', { to: 'a@example.test', subject: 's', text: 't' });
  const eu = await capture(
    'mailgun',
    { to: 'a@example.test', subject: 's', text: 't' },
    {
      region: 'eu',
    }
  );
  assertMailgunRequest(us);
  assertMailgunRequest(eu);
  assert.deepEqual(
    mailgun.spec.servers.map((server) => new URL(server.url).host).sort(),
    [new URL(us.url).host, new URL(eu.url).host].sort()
  );
});

test('Mailgun responses: 200 id without brackets; 400 permanent; 401 "Forbidden" and 429 transient; 500 ambiguous', async () => {
  const restoreKey = withEncryptionKey();
  try {
    const url = 'https://api.mailgun.net/v3/mg.example.test/messages';
    const op = mailgun.spec.paths['/v3/{domain_name}/messages'].post;
    const example = (status) =>
      Object.values(op.responses[status].content['application/json'].examples)[0].value;
    const { router } = createHarness([]);
    const message = () => ({ to: 'a@example.test', subject: 's', text: 't' });

    const ok = { id: '<20261118.1@mg.example.test>', message: 'Queued. Thank you.' };
    assert.deepEqual(mailgun.checkResponse({ method: 'POST', url, status: 200, json: ok }), []);
    let fake = fakeFetch(() => jsonResponse(200, ok));
    const result = await router.sendViaMailgun(accountFor('mailgun'), message());
    fake.restore();
    assert.equal(result.messageId, '20261118.1@mg.example.test');

    const expected = { 400: 'permanent', 401: 'transient', 429: 'transient', 500: 'ambiguous' };
    for (const [status, errorClass] of Object.entries(expected)) {
      const body = example(status);
      assert.deepEqual(
        mailgun.checkResponse({ method: 'POST', url, status: Number(status), json: body }),
        [],
        `fake ${status} matches the spec`
      );
      fake = fakeFetch(() => jsonResponse(Number(status), body));
      const error = await router.sendViaMailgun(accountFor('mailgun'), message()).catch((e) => e);
      fake.restore();
      assert.equal(error.status, Number(status));
      assert.equal(error.provider, 'mailgun');
      assert.equal(classifyDeliveryError(error), errorClass, `status ${status}`);
      assert.equal(toClientSendMessage(error), `Mailgun API request failed: ${status}`);
    }
  } finally {
    restoreKey();
  }
});
