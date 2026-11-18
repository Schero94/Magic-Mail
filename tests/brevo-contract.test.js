'use strict';

// Contract tests for the Brevo adapter against Brevo's official OpenAPI
// documents, vendored (only the operations Magic Mail calls) in
// tests/fixtures/openapi and pinned below:
// - brevo-email.json from https://developers.brevo.com/openapi/email-api.json
//   (POST /smtp/email, GET /smtp/templates, GET /smtp/templates/{templateId})
// - brevo-account.json from https://developers.brevo.com/openapi/accounts-and-settings.json
//   (GET /account, POST /webhooks)
// Both list the server https://api.brevo.com/v3. Rules the schemas can not
// express (unique recipients, reserved headers, 70-character names, size
// limit, one reply-to) are asserted directly. Spec deviations found while
// building the adapter are listed in KNOWN_DEVIATIONS and asserted, so a fix
// upstream shows up here. Synthetic data only; fetch is faked.

const test = require('node:test');
const assert = require('node:assert/strict');

const { OpenApiContract, fixtureSha256 } = require('./helpers/openapi-contract');
const {
  BREVO_WEBHOOK_TOKEN,
  accountFor,
  createHarness,
  fakeFetch,
  jsonResponse,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');
const { brevoTemplate } = require('./helpers/fake-brevo');
const brevo = require('../server/src/providers/brevo');

/** SHA-256 of the vendored files and of the official sources they were extracted from. */
const PINNED = {
  'brevo-email': {
    file: 'bed15d6f3a496b6f219d00bb40e7d8496f1fdb6b866346f3c4a893b1cc3e2177',
    source: 'd56adf661e413abc2436312fce0e83ee4219635bec4066c562ea6c9f5f77d43c',
    url: 'https://developers.brevo.com/openapi/email-api.json',
  },
  'brevo-account': {
    file: 'c295294bd39a378152105092b91a43328bc0bd1edaa48b7934ff27cab23a3065',
    source: 'e9f90329fafc6955a003f8e36987ab5142eb0cdd3fe4d512fa88257642faf736',
    url: 'https://developers.brevo.com/openapi/accounts-and-settings.json',
  },
};

/**
 * Where the official Brevo documents disagree with each other or with the
 * live API (checked 2026-11-18). Each entry is asserted below.
 */
const KNOWN_DEVIATIONS = [
  'POST /smtp/email documents only 201 and 400; the API also answers 401 (verified with an unauthenticated request: {"code":"unauthorized","message":"authentication not found in headers"}), 403, 429 (rate-limits page) and 5xx.',
  'GET /account types plan[].credits as a string (title "float"); the adapter accepts a number or a numeric string.',
  'The transactional-webhooks examples are not valid JSON ("id": xxxxx); the fixtures use 26224 from the getting-started example.',
  'The "Error" example on the transactional-webhooks page carries "event": "invalid_email"; the table above it names the event "error".',
  'ts_epoch is documented in milliseconds, but most webhook examples show seconds; the adapter prefers ts_event (seconds) and reads ts_epoch below 1e11 as seconds.',
  'The webhook `events` enum of POST /webhooks has no "error", although the transactional-webhooks page lists an Error event.',
  'The send guide says to pick one of htmlContent/textContent; the reference allows both (textContent "Ignored when templateId is provided" only). Magic Mail sends both.',
];

const email = new OpenApiContract('brevo-email');
const account = new OpenApiContract('brevo-account');
const SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Sends `message` through router.send() with one Brevo account and returns
 * the recorded request.
 *
 * @param {object} message
 * @param {object} [config]
 * @returns {Promise<object>}
 */
async function capture(message, config = {}) {
  const restoreKey = withEncryptionKey();
  const fake = fakeFetch();
  try {
    const { router } = createHarness([accountFor('brevo', config)]);
    await router.send(message);
    assert.equal(fake.calls.length, 1);
    return fake.calls[0];
  } finally {
    fake.restore();
    restoreKey();
  }
}

/** Asserts that a recorded send request satisfies the contract and the invariants. */
function assertSendRequest(call) {
  assert.equal(call.url, SEND_URL);
  assert.equal(call.method, 'POST');
  assert.deepEqual(
    email.checkRequest({ method: call.method, url: call.url, json: call.json }),
    [],
    'request matches the pinned send-transac-email schema'
  );
  assert.ok(call.headers['api-key'], 'api-key header');
  assert.equal(call.headers.Authorization, undefined);
  const body = call.json;
  const people = [...(body.to || []), ...(body.cc || []), ...(body.bcc || [])];
  const addresses = people.map((entry) => entry.email.toLowerCase());
  assert.equal(new Set(addresses).size, addresses.length, 'every address appears once');
  for (const entry of [...people, body.sender, body.replyTo].filter(Boolean)) {
    assert.ok(!entry.name || entry.name.length <= 70, 'names are at most 70 characters');
  }
  for (const name of Object.keys(body.headers || {})) {
    const lower = name.toLowerCase();
    assert.ok(
      !lower.startsWith('x-sib-') && (!lower.startsWith('x-mailin-') || name === 'X-Mailin-custom'),
      `reserved header ${name}`
    );
  }
  assert.ok(!Array.isArray(body.replyTo), 'one replyTo object');
  assert.ok(call.bodyBytes < brevo.__test__.BREVO_MAX_MESSAGE_BYTES);
  if (body.templateId === undefined) {
    assert.ok(body.sender?.email && body.subject, 'sender and subject without a template');
    assert.ok(body.htmlContent || body.textContent, 'a body without a template');
  }
}

test('the vendored Brevo OpenAPI files are the pinned copies of the official documents', () => {
  for (const [name, pin] of Object.entries(PINNED)) {
    assert.equal(fixtureSha256(name), pin.file, `${name}.json changed`);
    const contract = name === 'brevo-email' ? email : account;
    assert.equal(contract.source.sha256, pin.source, `${name} official source`);
    assert.equal(contract.source.url, pin.url);
    assert.deepEqual(
      contract.spec.servers.map((s) => s.url),
      ['https://api.brevo.com/v3']
    );
  }
  assert.equal(new URL(brevo.__test__.API_BASE).host, 'api.brevo.com', 'the only documented host');
  assert.equal(KNOWN_DEVIATIONS.length, 7);
});

test('plain text send', async () => {
  assertSendRequest(await capture({ to: 'a@example.test', subject: 'Hi', text: 'plain' }));
});

test('html + text, cc/bcc dedupe, names, reply-to, headers, tags, correlation', async () => {
  const call = await capture({
    to: ['Ada <ada@example.test>', 'ADA@example.test'],
    cc: 'Bob <bob@example.test>, ada@example.test',
    bcc: ['carol@example.test'],
    subject: 'All fields',
    html: '<p>Hi</p>',
    text: 'Hi',
    replyTo: 'Support <support@example.test>',
    type: 'marketing',
    unsubscribeUrl: 'https://shop.example.test/unsubscribe',
    priority: 'high',
    headers: { 'X-Campaign': 'c1', 'X-Mailin-custom': 'spoof', 'X-Sib-Sandbox': 'drop' },
  });
  assertSendRequest(call);
  assert.deepEqual(call.json.tags, ['magic-mail', 'marketing']);
  assert.equal(call.json.headers['X-Mailin-custom'], 'magicmail_id=logdoc123');
  assert.equal(call.json.headers['List-Unsubscribe'], '<https://shop.example.test/unsubscribe>');
  assert.equal(call.json.headers['X-Priority'], '1 (Highest)');
});

test('attachments with every documented extension class', async () => {
  const call = await capture({
    to: 'a@example.test',
    subject: 'Files',
    text: 'see attached',
    attachments: ['a.pdf', 'b.csv', 'c.ics', 'd.png', 'e.xlsx'].map((filename) => ({
      filename,
      content: `content of ${filename}`,
    })),
  });
  assertSendRequest(call);
  assert.equal(call.json.attachment.length, 5);
  for (const item of call.json.attachment) {
    assert.deepEqual(Object.keys(item).sort(), ['content', 'name']);
    assert.match(item.content, /^[A-Za-z0-9+/]+=*$/);
  }
});

test('template send body (templateId + params) matches the schema', () => {
  const restore = withEncryptionKey();
  try {
    const acc = accountFor('brevo');
    const { router } = createHarness([acc]);
    const h = require('../server/src/services/email-router').__test__.providerSendHelpers(router);
    const emailData = { to: 'a@example.test', __providerTemplate: { rowsByAccount: {} } };
    h.validateEmailSecurity(emailData);
    const body = brevo.__test__.buildSendRequest({
      account: acc,
      emailData,
      template: { remoteId: '7', name: 'T', variables: { name: 'Ada', items: [{ n: 1 }] } },
      h,
    });
    assertSendRequest({
      url: SEND_URL,
      method: 'POST',
      json: body,
      headers: { 'api-key': 'x' },
      bodyBytes: Buffer.byteLength(JSON.stringify(body)),
    });
    assert.equal(body.templateId, 7);
  } finally {
    restore();
  }
});

test('documented responses: 201 messageId, batch messageIds, 400 error body', async () => {
  const ok = { messageId: '<201798300811.5787683@relay.domain.com>' };
  assert.deepEqual(
    email.checkResponse({ method: 'POST', url: SEND_URL, status: 201, json: ok }),
    []
  );
  assert.deepEqual(
    email.checkResponse({
      method: 'POST',
      url: SEND_URL,
      status: 400,
      json: { code: 'invalid_parameter', message: 'x' },
    }),
    []
  );
  const restoreKey = withEncryptionKey();
  const batch = fakeFetch(() => jsonResponse(201, { messageIds: ['<a.1@relay.example.test>'] }));
  try {
    const acc = accountFor('brevo');
    const { router } = createHarness([acc]);
    const result = await router.sendViaAccount(acc, {
      to: 'a@example.test',
      subject: 's',
      text: 't',
    });
    assert.equal(result.messageId, 'a.1@relay.example.test');
  } finally {
    batch.restore();
    restoreKey();
  }
});

test('deviation: 401/403/429/5xx are not documented for the send operation', () => {
  for (const status of [401, 403, 429, 500]) {
    assert.deepEqual(
      email.checkResponse({ method: 'POST', url: SEND_URL, status, json: { message: 'x' } }),
      [`status ${status} is not documented`]
    );
  }
});

test('template list request and response match GET /smtp/templates', () => {
  const url = 'https://api.brevo.com/v3/smtp/templates?limit=50&offset=0&sort=asc';
  assert.deepEqual(email.checkRequest({ method: 'GET', url }), []);
  assert.deepEqual(
    email.checkRequest({
      method: 'GET',
      url: 'https://api.brevo.com/v3/smtp/templates?limit=1001',
    }),
    ['query limit: /v must be <= 1000']
  );
  const response = {
    count: 2,
    templates: [brevoTemplate(1, 'A'), brevoTemplate(2, 'B', { isActive: false })],
  };
  assert.deepEqual(email.checkResponse({ method: 'GET', url, status: 200, json: response }), []);
  const single = 'https://api.brevo.com/v3/smtp/templates/1';
  assert.deepEqual(
    email.checkResponse({ method: 'GET', url: single, status: 200, json: brevoTemplate(1, 'A') }),
    []
  );
  assert.deepEqual(
    email.checkResponse({
      method: 'GET',
      url: single,
      status: 404,
      json: { code: 'document_not_found', message: 'Template ID does not exist' },
    }),
    []
  );
});

test('account response matches GET /account; deviation: numeric credits', () => {
  const url = 'https://api.brevo.com/v3/account';
  assert.deepEqual(account.checkRequest({ method: 'GET', url }), []);
  const body = {
    organization_id: 'org-synthetic',
    user_id: 1,
    enterprise: false,
    email: 'owner@example.test',
    firstName: 'A',
    lastName: 'B',
    companyName: 'C',
    address: { city: 'x', country: 'x', street: 'x', zipCode: 'x' },
    plan: [{ type: 'free', creditsType: 'sendLimit', credits: '300' }],
    relay: { enabled: true, data: { userName: 'owner@example.test', relay: 'r', port: 587 } },
  };
  assert.deepEqual(account.checkResponse({ method: 'GET', url, status: 200, json: body }), []);
  const numeric = { ...body, plan: [{ type: 'free', creditsType: 'sendLimit', credits: 300 }] };
  assert.deepEqual(account.checkResponse({ method: 'GET', url, status: 200, json: numeric }), [
    'response/plan/0/credits must be string',
  ]);
});

test('the webhook the wizard asks for is a valid POST /webhooks body', () => {
  const body = {
    type: 'transactional',
    channel: 'email',
    description: 'Magic Mail delivery events',
    url: 'https://cms.example.test/api/magic-mail/webhooks/brevo/abc123',
    events: [
      'delivered',
      'hardBounce',
      'softBounce',
      'invalid',
      'deferred',
      'blocked',
      'spam',
      'unsubscribed',
      'opened',
      'click',
    ],
    auth: { type: 'bearer', token: BREVO_WEBHOOK_TOKEN },
    batched: true,
  };
  assert.deepEqual(
    account.checkRequest({ method: 'POST', url: 'https://api.brevo.com/v3/webhooks', json: body }),
    []
  );
  const alternative = {
    ...body,
    auth: undefined,
    headers: [{ key: 'X-Magic-Mail-Webhook-Token', value: BREVO_WEBHOOK_TOKEN }],
  };
  delete alternative.auth;
  assert.deepEqual(
    account.checkRequest({
      method: 'POST',
      url: 'https://api.brevo.com/v3/webhooks',
      json: alternative,
    }),
    []
  );
  assert.equal(brevo.WEBHOOK_TOKEN_HEADER, 'x-magic-mail-webhook-token');
  const enumValues =
    account.spec.components.schemas.WebhooksPostRequestBodyContentApplicationJsonSchemaEventsItems
      .enum;
  assert.ok(!enumValues.includes('error'), 'deviation: no "error" in the webhook events enum');
  for (const event of body.events) assert.ok(enumValues.includes(event), event);
});

test('webhook fixture deviations are still present in the official examples', () => {
  const events = require('./fixtures/webhooks/brevo-events.json');
  assert.equal(events.Error.event, 'invalid_email');
  assert.equal(events.Opened.ts_epoch < 1e11, true, 'ts_epoch in seconds in the example');
  assert.equal(events['Proxy open'].ts_epoch > 1e11, true, 'ts_epoch in ms in another example');
  for (const event of Object.values(events)) {
    assert.ok(
      !JSON.stringify(event).match(/@(?!example\.test|relay\.example\.test)[a-z.]+\.(com|fr)/)
    );
  }
});
