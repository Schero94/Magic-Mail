'use strict';

// Amazon SNS message verification (server/src/utils/sns-verify.js) and the
// SES webhook entry point (providers/ses.js webhook). The official SNS
// examples from tests/fixtures/ses are re-signed with a key pair and a
// self-signed certificate created at test time; certificate and
// confirmation requests go to an injected fetch, nothing leaves the process.

const test = require('node:test');
const assert = require('node:assert/strict');

const sns = require('../server/src/utils/sns-verify');
const ses = require('../server/src/providers/ses');
const { createSelfSignedCertificate } = require('./helpers/test-certificate');
const { signSnsMessage } = require('./helpers/fake-ses');
const EXAMPLES = require('./fixtures/ses/aws-doc-examples.json');

const CERT_URL =
  'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem';
const TOPIC = 'arn:aws:sns:us-west-2:123456789012:MyTopic';
const cert = createSelfSignedCertificate();

/** Injected fetch: serves the test certificate at CERT_URL and records calls. */
function certFetch({ pem = cert.pem, status = 200, extra = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (extra[url]) return extra[url]();
    if (url === CERT_URL) return new Response(pem, { status });
    return new Response('nope', { status: 404 });
  };
  return { calls, fetchImpl };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const notification = (overrides = {}) =>
  signSnsMessage({ ...clone(EXAMPLES.snsMessages.Notification), ...overrides }, cert.privateKey);

test.beforeEach(() => sns.clearCertificateCache());

// ── String to sign ─────────────────────────────────────────────────────────

test('string to sign: the field order and trailing newline of the SNS page', () => {
  const official = sns.parseSnsMessage(JSON.stringify(EXAMPLES.snsMessages.Notification));
  assert.equal(
    sns.snsStringToSign(official),
    'Message\nHello world!\nMessageId\n22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324\nSubject\nMy First Message\n' +
      'Timestamp\n2012-05-02T00:54:06.655Z\nTopicArn\narn:aws:sns:us-west-2:123456789012:MyTopic\nType\nNotification\n'
  );
  const { Subject: _subject, ...withoutSubject } = official;
  assert.equal(sns.snsStringToSign(withoutSubject).includes('Subject'), false);
  const confirmation = sns.parseSnsMessage(
    JSON.stringify(EXAMPLES.snsMessages.SubscriptionConfirmation)
  );
  const c = EXAMPLES.snsMessages.SubscriptionConfirmation;
  assert.equal(
    sns.snsStringToSign(confirmation),
    `Message\n${c.Message}\nMessageId\n${c.MessageId}\nSubscribeURL\n${c.SubscribeURL}\n` +
      `Timestamp\n${c.Timestamp}\nToken\n${c.Token}\nTopicArn\n${c.TopicArn}\nType\n${c.Type}\n`
  );
});

test('parsing: the three official examples parse; malformed envelopes do not', () => {
  for (const message of Object.values(EXAMPLES.snsMessages)) {
    assert.ok(sns.parseSnsMessage(Buffer.from(JSON.stringify(message))), message.Type);
  }
  const base = EXAMPLES.snsMessages.Notification;
  for (const bad of [
    'not json',
    '[]',
    JSON.stringify({ ...base, Type: 'Other' }),
    JSON.stringify({ ...base, Message: { nested: true } }),
    JSON.stringify({ ...base, Subject: 5 }),
    JSON.stringify({ ...base, Timestamp: 'yesterday' }),
    JSON.stringify({ ...base, MessageId: 'with space' }),
    JSON.stringify({ ...EXAMPLES.snsMessages.SubscriptionConfirmation, Token: undefined }),
  ]) {
    assert.equal(sns.parseSnsMessage(bad), null, bad.slice(0, 60));
  }
});

// ── Signatures ─────────────────────────────────────────────────────────────

test('signatures: version 1 (SHA1withRSA) and 2 (SHA256withRSA) verify', async () => {
  for (const version of ['1', '2']) {
    sns.clearCertificateCache();
    const signed = signSnsMessage(
      clone(EXAMPLES.snsMessages.Notification),
      cert.privateKey,
      version
    );
    const { fetchImpl, calls } = certFetch();
    assert.equal(await sns.verifySnsMessage(signed, { fetchImpl }), true, `v${version}`);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'manual');
    assert.ok(calls[0].init.signal, 'certificate fetch has a timeout');
  }
});

test('signatures: tampering, unknown versions and foreign keys fail', async () => {
  const { fetchImpl } = certFetch();
  const signed = notification();
  for (const changed of [
    { ...signed, Message: 'Hello world?' },
    { ...signed, Subject: 'other' },
    { ...signed, TopicArn: 'arn:aws:sns:us-west-2:123456789012:Other' },
    { ...signed, Timestamp: '2012-05-02T00:54:07.655Z' },
    { ...signed, SignatureVersion: '3' },
    { ...signed, Signature: 'not base64!' },
  ]) {
    assert.equal(await sns.verifySnsMessage(changed, { fetchImpl }), false);
  }
  const other = createSelfSignedCertificate();
  const foreign = signSnsMessage(clone(EXAMPLES.snsMessages.Notification), other.privateKey);
  assert.equal(await sns.verifySnsMessage(foreign, { fetchImpl }), false);
});

test('certificate URL: only https://sns.<region>.amazonaws.com/SimpleNotificationService-*.pem', async () => {
  const bad = [
    'http://sns.us-west-2.amazonaws.com/SimpleNotificationService-abc.pem',
    'https://sns.us-west-2.amazonaws.com.evil.test/SimpleNotificationService-abc.pem',
    'https://sns.evil.s3.amazonaws.com/SimpleNotificationService-abc.pem',
    'https://evil.test/sns.us-west-2.amazonaws.com/SimpleNotificationService-abc.pem',
    'https://user@sns.us-west-2.amazonaws.com/SimpleNotificationService-abc.pem',
    'https://sns.us-west-2.amazonaws.com:8443/SimpleNotificationService-abc.pem',
    'https://sns.us-west-2.amazonaws.com/other.pem',
    'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-abc.pem?x=1',
    'https://sns.cn-north-1.amazonaws.com.cn/SimpleNotificationService-abc.pem',
  ];
  for (const url of bad) {
    assert.equal(sns.signingCertUrl(url), null, url);
    const { fetchImpl, calls } = certFetch();
    const message = notification({ SigningCertURL: url });
    assert.equal(await sns.verifySnsMessage(message, { fetchImpl }), false, url);
    assert.equal(calls.length, 0, `no request for ${url}`);
  }
  assert.ok(sns.signingCertUrl(CERT_URL));
});

test('certificate fetch: redirects, errors, oversize, expired and non-RSA certificates fail', async () => {
  const signed = notification();
  const cases = [
    certFetch({ status: 301 }),
    certFetch({ status: 500 }),
    certFetch({ pem: 'x'.repeat(20_000) }),
    certFetch({ pem: 'not a certificate' }),
    certFetch({
      pem: createSelfSignedCertificate({
        notBefore: new Date(Date.now() - 10 * 86400_000),
        notAfter: new Date(Date.now() - 86400_000),
      }).pem,
    }),
  ];
  for (const { fetchImpl } of cases) {
    sns.clearCertificateCache();
    assert.equal(await sns.verifySnsMessage(signed, { fetchImpl }), false);
  }
  sns.clearCertificateCache();
  const failing = async () => {
    throw new TypeError('network down');
  };
  assert.equal(await sns.verifySnsMessage(signed, { fetchImpl: failing }), false);
});

test('certificate cache: one fetch per URL within the TTL, refetched after it', async () => {
  const { fetchImpl, calls } = certFetch();
  const now = Date.now();
  assert.equal(await sns.verifySnsMessage(notification(), { fetchImpl, now }), true);
  assert.equal(await sns.verifySnsMessage(notification(), { fetchImpl, now: now + 1000 }), true);
  assert.equal(calls.length, 1);
  assert.equal(
    await sns.verifySnsMessage(notification(), { fetchImpl, now: now + 2 * 3600_000 }),
    true
  );
  assert.equal(calls.length, 2);
});

test('subscribe URL: SNS host, ConfirmSubscription, the configured topic and a token', () => {
  const good = `https://sns.us-west-2.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${TOPIC}&Token=abc`;
  assert.ok(sns.subscribeUrl(good, TOPIC));
  for (const url of [
    good.replace('sns.us-west-2', 'sns.us-west-2.amazonaws.com.evil'),
    good.replace('https:', 'http:'),
    good.replace('ConfirmSubscription', 'Unsubscribe'),
    good.replace('MyTopic', 'Other'),
    good.replace('&Token=abc', ''),
    good.replace('.com/?', '.com/x?'),
  ]) {
    assert.equal(sns.subscribeUrl(url, TOPIC), null, url);
  }
});

// ── Webhook entry point ────────────────────────────────────────────────────

const config = { snsTopicArn: TOPIC };
const body = (message) => Buffer.from(JSON.stringify(message));

/**
 * SNS notification wrapping one SES event record.
 *
 * @param {object} record
 * @param {object} [overrides]
 * @returns {object}
 */
const sesNotification = (record, overrides = {}) =>
  signSnsMessage(
    {
      Type: 'Notification',
      MessageId: overrides.MessageId || 'f0e1d2c3-0000-4000-8000-000000000001',
      TopicArn: TOPIC,
      Message: JSON.stringify(record),
      Timestamp: '2026-11-18T10:00:00.000Z',
      SigningCertURL: CERT_URL,
      UnsubscribeURL: `https://sns.us-west-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=${TOPIC}:x`,
      ...overrides,
    },
    cert.privateKey
  );

test('webhook: no configured topic, a foreign topic or a bad signature is 401', async () => {
  const { fetchImpl } = certFetch();
  const message = sesNotification(EXAMPLES.sesEvents.Delivery);
  for (const stored of [{}, { snsTopicArn: '' }, { snsTopicArn: 'not-an-arn' }]) {
    const result = await ses.webhook({ config: stored, rawBody: body(message), fetchImpl });
    assert.equal(result.status, 401);
  }
  const foreign = await ses.webhook({
    config: { snsTopicArn: 'arn:aws:sns:us-west-2:123456789012:Other' },
    rawBody: body(message),
    fetchImpl,
  });
  assert.equal(foreign.status, 401);
  const tampered = await ses.webhook({
    config,
    rawBody: body({ ...message, Message: message.Message.replace('Delivery', 'Bounce') }),
    fetchImpl,
  });
  assert.deepEqual(tampered, { status: 401, events: [] });
});

test('webhook: a certificate from another region than the topic is 401 without a fetch', async () => {
  const { fetchImpl, calls } = certFetch();
  const message = sesNotification(EXAMPLES.sesEvents.Delivery, {
    SigningCertURL: CERT_URL.replace('us-west-2', 'eu-west-1'),
  });
  const result = await ses.webhook({ config, rawBody: body(message), fetchImpl });
  assert.deepEqual(result, { status: 401, events: [] });
  assert.equal(calls.length, 0);
});

test('webhook: malformed bodies and a mismatching message-type header are 400', async () => {
  const { fetchImpl } = certFetch();
  assert.equal((await ses.webhook({ config, rawBody: Buffer.from('{'), fetchImpl })).status, 400);
  const message = sesNotification(EXAMPLES.sesEvents.Delivery);
  const result = await ses.webhook({
    config,
    rawBody: body(message),
    headers: { 'x-amz-sns-message-type': 'SubscriptionConfirmation' },
    fetchImpl,
  });
  assert.equal(result.status, 400);
});

test('webhook: a verified notification yields events and the SNS MessageId as replay key', async () => {
  const { fetchImpl } = certFetch();
  const record = clone(EXAMPLES.sesEvents.Bounce);
  record.mail.tags.magicmail_id = ['logdoc7'];
  const message = sesNotification(record, { MessageId: 'aaaaaaaa-0000-4000-8000-00000000000b' });
  const result = await ses.webhook({
    config,
    rawBody: body(message),
    headers: { 'x-amz-sns-message-type': 'Notification' },
    fetchImpl,
  });
  assert.equal(result.status, 200);
  assert.equal(result.replayKey, 'aaaaaaaa-0000-4000-8000-00000000000b');
  assert.deepEqual(
    result.events.map((e) => [e.eventId, e.kind, e.magicmailId, e.suppress]),
    [['aaaaaaaa-0000-4000-8000-00000000000b:0', 'bounced', 'logdoc7', 'bounce']]
  );
  const garbage = await ses.webhook({
    config,
    rawBody: body(sesNotification('x', { Message: 'not json' })),
    fetchImpl,
  });
  assert.deepEqual(garbage.events, []);
  assert.equal(garbage.status, 200, 'a verified but unreadable record is acknowledged');
});

test('webhook: subscription confirmation visits only the SNS SubscribeURL', async () => {
  const subscribe = `https://sns.us-west-2.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${TOPIC}&Token=2336412f37`;
  const base = { ...clone(EXAMPLES.snsMessages.SubscriptionConfirmation), SubscribeURL: subscribe };
  const confirmations = [];
  const { fetchImpl, calls } = certFetch({
    extra: {
      [subscribe]: () => {
        confirmations.push(subscribe);
        return new Response('<ConfirmSubscriptionResponse/>', { status: 200 });
      },
    },
  });
  const ok = await ses.webhook({
    config,
    rawBody: body(signSnsMessage(base, cert.privateKey)),
    headers: { 'x-amz-sns-message-type': 'SubscriptionConfirmation' },
    fetchImpl,
  });
  assert.deepEqual(ok, { status: 200, events: [] });
  assert.deepEqual(confirmations, [subscribe]);
  assert.equal(calls.find((c) => c.url === subscribe).init.redirect, 'manual');

  const evil = 'https://evil.test/?Action=ConfirmSubscription&TopicArn=x&Token=y';
  const before = calls.length;
  const refused = await ses.webhook({
    config,
    rawBody: body(signSnsMessage({ ...base, SubscribeURL: evil }, cert.privateKey)),
    fetchImpl,
  });
  assert.equal(refused.status, 400);
  assert.equal(
    calls.slice(before).some((c) => c.url.startsWith('https://evil.test')),
    false
  );

  const unsubscribed = await ses.webhook({
    config,
    rawBody: body(
      signSnsMessage(clone(EXAMPLES.snsMessages.UnsubscribeConfirmation), cert.privateKey)
    ),
    fetchImpl,
  });
  assert.deepEqual(unsubscribed, { status: 200, events: [] });
});
