'use strict';

// Amazon SES adapter (server/src/providers/ses.js): configuration, the
// SendEmail request built through the real email-router, limits, error
// mapping without body leakage, environment credentials, tracking switches,
// hints, and the mapping of the official SES event examples. Synthetic data
// only; every provider call goes to a recording fake fetch.

const test = require('node:test');
const assert = require('node:assert/strict');

const ses = require('../server/src/providers/ses');
const {
  PIXEL_PNG,
  SES_TEST_CONFIG,
  accountFor,
  createHarness,
  fakeFetch,
  jsonResponse,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');
const { toClientSendResult } = require('../server/src/utils/client-errors');
const { classifyDeliveryError } = require('../server/src/utils/delivery-outcome');
const EXAMPLES = require('./fixtures/ses/aws-doc-examples.json');

const SES_URL = 'https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails';
const accepted = () => jsonResponse(200, { MessageId: '0100019aexample-000000' });

/**
 * Runs `fn` with an encryption key and a fake fetch, restoring both.
 *
 * @param {Function|undefined} respond
 * @param {(calls: object[]) => Promise<void>} fn
 */
async function withFetch(respond, fn) {
  const restoreKey = withEncryptionKey();
  const fake = fakeFetch(respond || accepted);
  try {
    await fn(fake.calls);
  } finally {
    fake.restore();
    restoreKey();
  }
}

const sesAccount = (config = {}, overrides = {}) => ({
  ...accountFor('ses', config),
  ...overrides,
});

// ── Configuration ──────────────────────────────────────────────────────────

test('config: a complete create is normalised and unknown keys are dropped', () => {
  const out = ses.normalizeConfig(
    {
      region: ' EU-West-1 ',
      accessKeyId: ` ${SES_TEST_CONFIG.accessKeyId} `,
      secretAccessKey: SES_TEST_CONFIG.secretAccessKey,
      configurationSetName: 'magicmail-events',
      snsTopicArn: 'arn:aws:sns:eu-west-1:123456789012:ses-events',
      apiKey: 'should-not-survive',
    },
    { creating: true }
  );
  assert.deepEqual(out, {
    region: 'eu-west-1',
    credentialSource: 'keys',
    accessKeyId: SES_TEST_CONFIG.accessKeyId,
    secretAccessKey: SES_TEST_CONFIG.secretAccessKey,
    configurationSetName: 'magicmail-events',
    snsTopicArn: 'arn:aws:sns:eu-west-1:123456789012:ses-events',
  });
});

test('config: problems name the fields and never echo the values', () => {
  const secret = 'short';
  let caught;
  try {
    ses.normalizeConfig(
      {
        region: 'mars-north-9x',
        accessKeyId: 'bad key!',
        secretAccessKey: secret,
        configurationSetName: 'has spaces',
        snsTopicArn: 'arn:aws:sns:eu-west-1:1234:topic',
        credentialSource: 'keys',
      },
      { creating: true }
    );
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.name, 'ValidationError');
  const fields = caught.details.config.map((entry) => entry.split(':')[0]);
  assert.deepEqual(fields, [
    'region',
    'accessKeyId',
    'secretAccessKey',
    'configurationSetName',
    'snsTopicArn',
  ]);
  const text = JSON.stringify(caught.details) + caught.message;
  for (const value of ['mars-north-9x', 'bad key!', 'has spaces', ':1234:']) {
    assert.equal(text.includes(value), false, `value ${value} echoed`);
  }
});

test('config: region rules (GovCloud yes; China and isolated partitions no)', () => {
  assert.equal(ses.resolveRegion('us-gov-west-1'), 'us-gov-west-1');
  assert.equal(ses.resolveRegion('ap-southeast-2'), 'ap-southeast-2');
  assert.equal(ses.hostFor('eu-central-1'), 'email.eu-central-1.amazonaws.com');
  for (const region of [
    'cn-north-1',
    'us-iso-east-1',
    'us-isob-east-1',
    'eu-west-1.evil.test',
    '',
  ]) {
    assert.equal(ses.resolveRegion(region), null, region);
  }
  assert.throws(
    () =>
      ses.normalizeConfig({
        region: 'us-gov-west-1',
        snsTopicArn: 'arn:aws:sns:us-east-1:123456789012:t',
      }),
    (error) => error.details.config[0].startsWith('snsTopicArn: the topic must be in the same')
  );
  assert.equal(
    ses.normalizeConfig({
      region: 'us-gov-west-1',
      snsTopicArn: 'arn:aws-us-gov:sns:us-gov-west-1:123456789012:t',
    }).snsTopicArn,
    'arn:aws-us-gov:sns:us-gov-west-1:123456789012:t'
  );
});

test('config: updates keep a masked secret and accept partial changes', () => {
  assert.deepEqual(ses.normalizeConfig({ secretAccessKey: '********' }), {
    secretAccessKey: '********',
  });
  assert.deepEqual(ses.normalizeConfig({ configurationSetName: '' }), {
    configurationSetName: '',
  });
  assert.throws(() => ses.normalizeConfig({ secretAccessKey: '********' }, { creating: true }));
  assert.throws(() => ses.normalizeConfig(null));
});

test('config: the environment source clears a stored key pair without asking for the secret', () => {
  const restore = withEncryptionKey();
  try {
    const { accountManager } = createHarness([]);
    const incoming = ses.normalizeConfig({ region: 'eu-west-1', credentialSource: 'environment' });
    assert.deepEqual(incoming, {
      region: 'eu-west-1',
      credentialSource: 'environment',
      accessKeyId: '',
      secretAccessKey: '',
    });
    const merged = accountManager._mergeConfig({ ...SES_TEST_CONFIG }, incoming);
    assert.equal(merged.secretAccessKey, '');
    assert.equal(merged.accessKeyId, '');
    // Back to keys with a new access key id: the secret must be entered again.
    assert.throws(
      () =>
        accountManager._mergeConfig(
          { ...SES_TEST_CONFIG },
          ses.normalizeConfig({ accessKeyId: 'FAKEOTHERKEYID000001', secretAccessKey: '********' })
        ),
      /Re-enter the stored secret/
    );
  } finally {
    restore();
  }
});

test('config: secret and identity fields match account-manager', () => {
  assert.deepEqual([...ses.SECRET_FIELDS], ['secretAccessKey']);
  assert.deepEqual([...ses.IDENTITY_FIELDS], ['accessKeyId', 'credentialSource']);
});

// ── Send request ───────────────────────────────────────────────────────────

test('send: plain message, signed POST to the regional host, tags and charset', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([sesAccount()]);
    const result = await router.send({
      to: 'Ada@Example.test',
      subject: 'Hello Ünïcode',
      text: 'plain',
      html: '<p>html</p>',
      skipLinkTracking: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.messageId, '0100019aexample-000000');
    const call = calls[0];
    assert.equal(call.url, SES_URL);
    assert.equal(call.method, 'POST');
    assert.match(
      call.headers.authorization,
      /^AWS4-HMAC-SHA256 Credential=FAKEKEYIDFORTESTS001\/\d{8}\/eu-west-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/
    );
    assert.match(call.headers['x-amz-date'], /^\d{8}T\d{6}Z$/);
    assert.equal(call.headers['content-type'], 'application/json');
    assert.equal(call.headers.host, undefined, 'fetch sets Host itself');
    assert.equal(call.json.FromEmailAddress, '"Test Sender" <noreply@ses.example.test>');
    assert.deepEqual(call.json.Destination, { ToAddresses: ['ada@example.test'] });
    assert.deepEqual(call.json.Content.Simple.Subject, { Data: 'Hello Ünïcode', Charset: 'UTF-8' });
    assert.equal(call.json.Content.Simple.Body.Text.Data, 'plain');
    assert.equal(call.json.Content.Simple.Body.Html.Charset, 'UTF-8');
    assert.deepEqual(call.json.EmailTags, [
      { Name: 'magicmail_email_type', Value: 'transactional' },
      { Name: 'magicmail_id', Value: 'logdoc123' },
    ]);
    assert.equal(call.json.ConfigurationSetName, undefined);
    assert.equal(JSON.stringify(call).includes(SES_TEST_CONFIG.secretAccessKey), false);
  });
});

test('send: cc, bcc and reply-to; each address once; non-ASCII names as encoded words', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([sesAccount()]);
    await router.send({
      to: ['"Zoë Example" <zoe@example.test>', 'b@example.test'],
      cc: ['B@example.test', 'c@example.test'],
      bcc: 'd@example.test',
      replyTo: 'Support <support@example.test>',
      subject: 'x',
      text: 'y',
    });
    const { Destination, ReplyToAddresses } = calls[0].json;
    assert.deepEqual(Destination, {
      ToAddresses: [
        `=?UTF-8?B?${Buffer.from('Zoë Example').toString('base64')}?= <zoe@example.test>`,
        'b@example.test',
      ],
      CcAddresses: ['c@example.test'],
      BccAddresses: ['d@example.test'],
    });
    assert.deepEqual(ReplyToAddresses, ['"Support" <support@example.test>']);
  });
});

test('send: more than 50 recipients in total is refused before any request', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([sesAccount()]);
    const to = Array.from({ length: 40 }, (_, i) => `to${i}@example.test`);
    const cc = Array.from({ length: 11 }, (_, i) => `cc${i}@example.test`);
    await assert.rejects(
      router.sendViaAccount(sesAccount(), { to, cc, subject: 'x', text: 'y' }),
      /at most 50 recipients/
    );
    assert.equal(calls.length, 0);
  });
});

test('send: outbound headers are filtered and capped at 15', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([sesAccount()]);
    await router.sendViaAccount(sesAccount(), {
      to: 'a@example.test',
      subject: 'x',
      text: 'y',
      type: 'marketing',
      priority: 'high',
      unsubscribeUrl: 'https://example.test/u',
      headers: { 'X-Campaign': 'Spätherbst', Bcc: 'evil@example.test', 'X-Mailer': 'Evil' },
    });
    const headers = calls[0].json.Content.Simple.Headers;
    const byName = Object.fromEntries(headers.map((entry) => [entry.Name, entry.Value]));
    assert.equal(byName['X-Mailer'], 'MagicMail/1.0', 'Magic Mail headers win');
    assert.equal(byName.Bcc, undefined, 'not an allowed caller header');
    assert.equal(
      byName['X-Campaign'],
      `=?UTF-8?B?${Buffer.from('Spätherbst').toString('base64')}?=`
    );
    assert.equal(byName['List-Unsubscribe'], '<https://example.test/u>');
    assert.equal(byName.Precedence, 'bulk');
    assert.deepEqual(calls[0].json.EmailTags[0], {
      Name: 'magicmail_email_type',
      Value: 'marketing',
    });

    const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`X-Extra-${i}`, 'v']));
    await assert.rejects(
      router.sendViaAccount(sesAccount(), {
        to: 'a@example.test',
        subject: 'x',
        text: 'y',
        headers: many,
      }),
      /at most 15 custom headers/
    );
    assert.equal(calls.length, 1, 'the refused message made no request');
  });
});

test('send: attachments and inline images become Simple.Attachments', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([sesAccount()]);
    await router.sendViaAccount(sesAccount(), {
      to: 'a@example.test',
      subject: 'files',
      html: '<img src="cid:logo@example.test">',
      attachments: [
        { filename: 'report.csv', content: 'a,b\n1,2', contentType: 'text/csv' },
        {
          cid: 'logo@example.test',
          content: PIXEL_PNG,
          encoding: 'base64',
          contentType: 'image/png',
        },
      ],
    });
    assert.deepEqual(calls[0].json.Content.Simple.Attachments, [
      {
        RawContent: Buffer.from('a,b\n1,2').toString('base64'),
        FileName: 'report.csv',
        ContentType: 'text/csv',
        ContentDisposition: 'ATTACHMENT',
        ContentTransferEncoding: 'BASE64',
      },
      {
        RawContent: PIXEL_PNG,
        FileName: 'logo@example.test',
        ContentType: 'image/png',
        ContentDisposition: 'INLINE',
        ContentId: 'logo@example.test',
        ContentTransferEncoding: 'BASE64',
      },
    ]);
    await assert.rejects(
      router.sendViaAccount(sesAccount(), {
        to: 'a@example.test',
        subject: 'x',
        text: 'y',
        attachments: [{ path: '/etc/passwd' }],
      }),
      /File-path and URL attachments are not supported/
    );
  });
});

test('send: a message of 40 MB or more is refused before any request', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([sesAccount()]);
    const chunk = Buffer.alloc(15 * 1024 * 1024, 7);
    const error = await router
      .sendViaAccount(sesAccount(), {
        to: 'a@example.test',
        subject: 'big',
        text: 'y',
        attachments: [
          { filename: 'a.bin', content: chunk },
          { filename: 'b.bin', content: chunk },
        ],
      })
      .catch((err) => err);
    assert.equal(error.code, 'MAGIC_MAIL_MESSAGE_TOO_LARGE');
    assert.match(error.message, /40 MB/);
    assert.equal(calls.length, 0);
  });
});

test('send: configuration set and tracking overrides', async () => {
  await withFetch(undefined, async (calls) => {
    const account = sesAccount({ configurationSetName: 'magicmail-events' });
    const tracked = createHarness([account], { tracking: 'all' });
    await tracked.router.send({
      to: 'a@example.test',
      subject: 'x',
      html: '<a href="https://shop.example.test/">shop</a>',
    });
    assert.equal(calls[0].json.ConfigurationSetName, 'magicmail-events');
    assert.deepEqual(calls[0].json.ConfigurationOverrides, {
      Tracking: { OpenTrackingEnabled: 'DISABLED', ClickTrackingEnabled: 'DISABLED' },
    });

    const untracked = createHarness([account], { tracking: 'none' });
    await untracked.router.send({ to: 'a@example.test', subject: 'x', html: '<p>no links</p>' });
    assert.equal(calls[1].json.ConfigurationOverrides, undefined, 'SES settings apply unchanged');

    const { router } = createHarness([account]);
    const { buildSendRequest } = ses;
    const h = require('../server/src/services/email-router').__test__.providerSendHelpers(router);
    const { body } = buildSendRequest({
      account,
      config: { configurationSetName: 'magicmail-events' },
      emailData: { to: 'a@example.test', subject: 'x', text: 'y', __providerTracking: true },
      h,
    });
    assert.deepEqual(body.ConfigurationOverrides, {
      Tracking: { OpenTrackingEnabled: 'ENABLED', ClickTrackingEnabled: 'ENABLED' },
    });
  });
});

test('send: environment credentials are read at send time, with the session token', async () => {
  const saved = {
    id: process.env.AWS_ACCESS_KEY_ID,
    secret: process.env.AWS_SECRET_ACCESS_KEY,
    token: process.env.AWS_SESSION_TOKEN,
  };
  const restoreEnv = () => {
    for (const [key, value] of [
      ['AWS_ACCESS_KEY_ID', saved.id],
      ['AWS_SECRET_ACCESS_KEY', saved.secret],
      ['AWS_SESSION_TOKEN', saved.token],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    await withFetch(undefined, async (calls) => {
      const account = sesAccount({
        credentialSource: 'environment',
        accessKeyId: '',
        secretAccessKey: '',
      });
      const { router } = createHarness([account]);
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      const missing = await router
        .sendViaAccount(account, { to: 'a@example.test', subject: 'x', text: 'y' })
        .catch((err) => err);
      assert.equal(missing.code, 'MAGIC_MAIL_ACCOUNT_CONFIG');
      assert.match(missing.message, /server environment/);
      assert.equal(calls.length, 0);

      process.env.AWS_ACCESS_KEY_ID = 'FAKEROLEKEYFORTESTS1';
      process.env.AWS_SECRET_ACCESS_KEY = 'fakeRoleSecretForMagicMailTests/abcdef0';
      process.env.AWS_SESSION_TOKEN = 'FakeSessionTokenForTests==';
      await router.sendViaAccount(account, { to: 'a@example.test', subject: 'x', text: 'y' });
      assert.match(calls[0].headers.authorization, /Credential=FAKEROLEKEYFORTESTS1\//);
      assert.match(
        calls[0].headers.authorization,
        /SignedHeaders=content-type;host;x-amz-date;x-amz-security-token,/
      );
      assert.equal(calls[0].headers['x-amz-security-token'], 'FakeSessionTokenForTests==');
    });
  } finally {
    restoreEnv();
  }
});

test('send: missing region or key is an account configuration error (failover-safe)', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([]);
    for (const config of [{ region: 'cn-north-1' }, { secretAccessKey: '' }]) {
      const error = await router
        .sendViaAccount(sesAccount(config), { to: 'a@example.test', subject: 'x', text: 'y' })
        .catch((err) => err);
      assert.equal(error.code, 'MAGIC_MAIL_ACCOUNT_CONFIG');
      assert.equal(classifyDeliveryError(error), 'transient');
    }
    assert.equal(calls.length, 0);
  });
});

// ── Errors ─────────────────────────────────────────────────────────────────

const awsError = (status, type, message, viaHeader = true) =>
  jsonResponse(
    status,
    viaHeader ? { message } : { __type: `com.amazonaws.sesv2#${type}`, message },
    viaHeader ? { 'x-amzn-errortype': `${type}:http://internal.amazon.com/coral/` } : {}
  );

test('errors: status, allowlisted reason and hint; the body never leaks', async () => {
  const cases = [
    [
      awsError(
        400,
        'MessageRejected',
        'Email address is not verified. The following identities failed the check in region EU-WEST-1: secret.person@example.test'
      ),
      400,
      'MessageRejected',
      'SES_UNVERIFIED_IDENTITY',
      'permanent',
    ],
    [
      awsError(400, 'MessageRejected', 'Message contains a virus', false),
      400,
      'MessageRejected',
      'SES_MESSAGE_REJECTED',
      'permanent',
    ],
    [
      awsError(400, 'ThrottlingException', 'Rate exceeded'),
      429,
      'ThrottlingException',
      undefined,
      'transient',
    ],
    [
      awsError(429, 'TooManyRequestsException', 'slow down'),
      429,
      'TooManyRequestsException',
      undefined,
      'transient',
    ],
    [
      awsError(400, 'SendingPausedException', 'paused for secret.person@example.test'),
      403,
      'SendingPausedException',
      'SES_SENDING_PAUSED',
      'transient',
    ],
    [
      awsError(400, 'AccountSuspendedException', 'x'),
      403,
      'AccountSuspendedException',
      'SES_ACCOUNT_SUSPENDED',
      'transient',
    ],
    [
      awsError(400, 'MailFromDomainNotVerifiedException', 'x'),
      403,
      'MailFromDomainNotVerifiedException',
      'SES_MAIL_FROM_NOT_VERIFIED',
      'transient',
    ],
    [
      awsError(
        403,
        'InvalidSignatureException',
        'Signature expired: 20261118T100000Z is now earlier than 20261118T101000Z'
      ),
      403,
      'InvalidSignatureException',
      'SES_CLOCK_SKEW',
      'transient',
    ],
    [
      awsError(
        403,
        'InvalidSignatureException',
        'The request signature we calculated does not match'
      ),
      403,
      'InvalidSignatureException',
      'SES_SIGNATURE_MISMATCH',
      'transient',
    ],
    [
      awsError(
        403,
        'UnrecognizedClientException',
        'The security token included in the request is invalid.'
      ),
      403,
      'UnrecognizedClientException',
      'SES_INVALID_CREDENTIALS',
      'transient',
    ],
    [
      awsError(
        403,
        'AccessDeniedException',
        'User arn:aws:iam::123456789012:user/x is not authorized'
      ),
      403,
      'AccessDeniedException',
      'SES_ACCESS_DENIED',
      'transient',
    ],
    [
      awsError(404, 'NotFoundException', 'Configuration set <x> does not exist.'),
      404,
      'NotFoundException',
      'SES_NOT_FOUND',
      'permanent',
    ],
    [
      awsError(400, 'LimitExceededException', 'x'),
      400,
      'LimitExceededException',
      'SES_LIMIT_EXCEEDED',
      'permanent',
    ],
    [
      awsError(413, 'RequestEntityTooLargeException', 'x'),
      413,
      'RequestEntityTooLargeException',
      'MAGIC_MAIL_MESSAGE_TOO_LARGE',
      'permanent',
    ],
    [awsError(500, 'SomethingInternalAndSecret', 'x'), 500, undefined, undefined, 'ambiguous'],
    [jsonResponse(503, 'Service Unavailable'), 503, undefined, undefined, 'transient'],
  ];
  for (const [response, status, reason, code, outcome] of cases) {
    await withFetch(
      () => response.clone(),
      async () => {
        const { router, logs } = createHarness([sesAccount()]);
        const error = await router
          .sendViaAccount(sesAccount(), {
            to: 'secret.person@example.test',
            subject: 'x',
            text: 'y',
          })
          .catch((err) => err);
        assert.equal(error.message, `Amazon SES API request failed: ${status}`);
        assert.equal(error.status, status);
        assert.equal(error.provider, 'amazon ses');
        assert.equal(error.providerReason, reason);
        assert.equal(error.code, code, `${reason} code`);
        assert.equal(error.retryAfterMs, undefined, 'SES documents no retry header');
        assert.equal(classifyDeliveryError(error), outcome, `${reason} outcome`);
        const visible = JSON.stringify({
          error,
          message: error.message,
          logs,
          client: toClientSendResult(error),
        });
        assert.equal(visible.includes('secret.person'), false);
        assert.equal(visible.includes('arn:aws:iam'), false);
        assert.equal(visible.includes('is now earlier'), false);
      }
    );
  }
});

test('errors: the header form AWS really sends (probe 2026-11-18) is recognised', () => {
  const response = new Response('{"message":"Missing Authentication Token"}', {
    status: 403,
    headers: { 'x-amzn-errortype': 'MissingAuthenticationTokenException' },
  });
  assert.deepEqual(ses.classifyFailure(response, '{"message":"Missing Authentication Token"}'), {
    status: 403,
    type: 'MissingAuthenticationTokenException',
    hint: 'SES_INVALID_CREDENTIALS',
  });
  const unknown = new Response('', { status: 400, headers: { 'x-amzn-errortype': 'Secret:x' } });
  assert.equal(ses.errorTypeOf(unknown, '{"__type":"Other#Thing"}'), null);
});

test('errors: client hints come from the adapter table', () => {
  const error = Object.assign(new Error('Amazon SES API request failed: 403'), {
    status: 403,
    provider: 'amazon ses',
    code: 'SES_SIGNATURE_MISMATCH',
  });
  assert.deepEqual(toClientSendResult(error), {
    message: 'Amazon SES API request failed: 403',
    hintCode: 'SES_SIGNATURE_MISMATCH',
    hint: ses.HINTS.SES_SIGNATURE_MISMATCH,
  });
  const throttled = Object.assign(new Error('Amazon SES API request failed: 429'), {
    status: 429,
    provider: 'amazon ses',
  });
  assert.equal(toClientSendResult(throttled).hintCode, 'PROVIDER_RATE_LIMITED');
  assert.equal(ses.hintFor(undefined, 'CREDENTIALS'), 'SES_CREDENTIALS_MISSING');
  assert.equal(ses.hintFor(403, 'AUTH'), 'SES_ACCESS_DENIED');
  assert.equal(ses.hintFor(500, 'UNAVAILABLE'), null);
  for (const text of Object.values(ses.HINTS)) assert.ok(text.length < 300);
  assert.ok(Object.keys(ses.HINTS).every((code) => code.startsWith('SES_')));
});

test('errors: throttling fails over to the next account; a 400 rejection does not', async () => {
  await withFetch(
    (call) =>
      call.url.includes('amazonaws.com')
        ? awsError(400, 'ThrottlingException', 'Rate exceeded')
        : jsonResponse(202, undefined, { 'x-message-id': 'sg-1' }),
    async (calls) => {
      const { router } = createHarness([sesAccount({}, { priority: 9 }), accountFor('sendgrid')]);
      const result = await router.send({ to: 'a@example.test', subject: 'x', text: 'y' });
      assert.equal(result.accountUsed, 'test-sendgrid');
      assert.equal(calls.length, 2);
    }
  );
  await withFetch(
    (call) =>
      call.url.includes('amazonaws.com')
        ? awsError(400, 'MessageRejected', 'virus')
        : jsonResponse(202, undefined, { 'x-message-id': 'sg-1' }),
    async (calls) => {
      const { router } = createHarness([sesAccount({}, { priority: 9 }), accountFor('sendgrid')]);
      await assert.rejects(router.send({ to: 'a@example.test', subject: 'x', text: 'y' }));
      assert.equal(calls.length, 1);
    }
  );
});

// ── Events ─────────────────────────────────────────────────────────────────

const parse = (record, now = Date.parse('2026-11-18T12:00:00Z')) =>
  ses.parseSesEvent(JSON.parse(JSON.stringify(record)), { snsMessageId: 'sns-1', now });

test('events: the official examples map to delivery events', () => {
  const ev = EXAMPLES.sesEvents;
  const messageId = 'EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000';
  const [bounce] = parse(ev.Bounce);
  assert.deepEqual(bounce, {
    eventId: 'sns-1:0',
    messageId,
    magicmailId: null,
    recipient: 'recipient@example.com',
    occurredAt: Date.parse('2017-08-05T00:41:02.669Z'),
    kind: 'bounced',
    reasonCode: 'SES_BOUNCE_GENERAL',
    suppress: 'bounce',
  });
  const [complaint] = parse(ev.Complaint);
  assert.equal(complaint.kind, 'complained');
  assert.equal(complaint.suppress, 'complaint');
  assert.equal(complaint.notDelivered, undefined);
  assert.equal(parse(ev.Delivery)[0].kind, 'delivered');
  assert.deepEqual(parse(ev.Send), []);
  assert.deepEqual(
    parse(ev.Reject).map((e) => [e.kind, e.reasonCode, e.notDelivered]),
    [['dropped', 'SES_REJECT', true]]
  );
  assert.deepEqual(
    parse(ev['Rendering Failure']).map((e) => [e.kind, e.reasonCode, e.notDelivered]),
    [['dropped', 'SES_RENDERING_FAILURE', true]]
  );
  assert.equal(parse(ev.Open)[0].kind, 'opened');
  const [click] = parse(ev.Click);
  assert.equal(click.kind, 'clicked');
  assert.equal(
    click.url,
    'http://docs.aws.amazon.com/ses/latest/DeveloperGuide/send-email-smtp.html'
  );
  assert.deepEqual(
    parse(ev.DeliveryDelay).map((e) => [e.kind, e.reasonCode, e.recipient]),
    [['deferred', 'SES_DELAY_TRANSIENTCOMMUNICATIONFA', 'recipient@example.com']]
  );
  assert.deepEqual(
    parse(ev.Subscription).map((e) => [e.kind, e.recipient]),
    [['unsubscribed', 'recipient@example.com']]
  );
});

test('events: transient bounces are final non-deliveries; multi-recipient bounces fan out', () => {
  const record = JSON.parse(JSON.stringify(EXAMPLES.sesEvents.Bounce));
  record.bounce.bounceType = 'Transient';
  record.bounce.bounceSubType = 'MailboxFull';
  record.bounce.bouncedRecipients = [
    { emailAddress: 'One@Example.test' },
    { emailAddress: 'two@example.test' },
    { emailAddress: 'not an address' },
  ];
  record.mail.tags.magicmail_id = ['logdoc42'];
  const events = parse(record);
  assert.deepEqual(
    events.map((e) => [e.eventId, e.kind, e.recipient, e.suppress, e.magicmailId, e.reasonCode]),
    [
      ['sns-1:0', 'blocked', 'one@example.test', null, 'logdoc42', 'SES_BOUNCE_MAILBOXFULL'],
      ['sns-1:1', 'blocked', 'two@example.test', null, 'logdoc42', 'SES_BOUNCE_MAILBOXFULL'],
      ['sns-1:2', 'blocked', null, null, 'logdoc42', 'SES_BOUNCE_MAILBOXFULL'],
    ]
  );
  record.bounce.bounceType = 'Permanent';
  record.bounce.bounceSubType = 'OnAccountSuppressionList';
  assert.equal(parse(record)[0].reasonCode, 'SES_BOUNCE_ONACCOUNTSUPPRESSIONLIST');
  assert.equal(parse(record)[0].suppress, 'bounce');
});

test('events: identity notifications (notificationType) and odd input', () => {
  const record = JSON.parse(JSON.stringify(EXAMPLES.sesEvents.Delivery));
  delete record.eventType;
  record.notificationType = 'Delivery';
  assert.equal(parse(record)[0].kind, 'delivered');
  record.notificationType = 'AmazonSnsSubscriptionSucceeded';
  assert.deepEqual(parse(record), []);
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse([]), []);
  const complaint = JSON.parse(JSON.stringify(EXAMPLES.sesEvents.Complaint));
  complaint.complaint.complaintSubType = 'OnAccountSuppressionList';
  assert.equal(parse(complaint)[0].notDelivered, true);
  const future = JSON.parse(JSON.stringify(EXAMPLES.sesEvents.Open));
  future.open.timestamp = '2099-01-01T00:00:00Z';
  assert.equal(parse(future)[0].occurredAt, null, 'implausible times are dropped');
  const subscribed = JSON.parse(JSON.stringify(EXAMPLES.sesEvents.Subscription));
  subscribed.subscription.newTopicPreferences.unsubscribeAll = false;
  assert.deepEqual(parse(subscribed), []);
});
