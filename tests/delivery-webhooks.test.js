'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const { normalizeMessageId, messageIdCandidates } = require('../server/src/utils/message-id');
const {
  verifySendGridSignature,
  verifyMailgunSignature,
  isFreshTimestamp,
} = require('../server/src/utils/webhook-signatures');
const {
  createWebhookRawBodyMiddleware,
  RAW_BODY_CONTENT_TYPE,
} = require('../server/src/utils/webhook-raw-body');
const deliveryService = require('../server/src/services/delivery-webhooks');

const ROOT = path.join(__dirname, '..');
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

// Locally generated keys only; no provider is contacted.
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const sendGridPublicKey = ec.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const signSendGrid = (timestamp, body, privateKey = ec.privateKey) =>
  crypto
    .sign('sha256', Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), {
      key: privateKey,
      dsaEncoding: 'der',
    })
    .toString('base64');
const MAILGUN_KEY = 'mailgun-signing-key-for-tests';
const signMailgun = (timestamp, token, key = MAILGUN_KEY) =>
  crypto.createHmac('sha256', key).update(`${timestamp}${token}`).digest('hex');

test('message ids are normalised and bounded', () => {
  assert.equal(
    normalizeMessageId('<20260212.abc@mg.example.test>'),
    '20260212.abc@mg.example.test'
  );
  assert.equal(normalizeMessageId('  Gu2Gx9TkSiqZjmYNWCDQ5A '), 'Gu2Gx9TkSiqZjmYNWCDQ5A');
  assert.equal(normalizeMessageId('has space'), null);
  assert.equal(normalizeMessageId('x'.repeat(256)), null);
  assert.equal(normalizeMessageId(42), null);
  assert.deepEqual(messageIdCandidates('sendgrid', 'Gu2Gx9.filterdrecv-1.2'), [
    'Gu2Gx9.filterdrecv-1.2',
    'Gu2Gx9',
  ]);
  assert.deepEqual(messageIdCandidates('mailgun', '<a.b@mg.example.test>'), [
    'a.b@mg.example.test',
  ]);
});

test('SendGrid ECDSA signature is checked over timestamp + raw body', () => {
  const body = Buffer.from('[{"event":"bounce"}]');
  const ts = nowSeconds();
  const signature = signSendGrid(ts, body);
  assert.equal(
    verifySendGridSignature({
      publicKey: sendGridPublicKey,
      rawBody: body,
      signature,
      timestamp: ts,
    }),
    true
  );
  const pem = ec.publicKey.export({ format: 'pem', type: 'spki' });
  assert.equal(
    verifySendGridSignature({ publicKey: pem, rawBody: body, signature, timestamp: ts }),
    true
  );
  assert.equal(
    verifySendGridSignature({
      publicKey: sendGridPublicKey,
      rawBody: Buffer.from('[{"event":"bounce" }]'),
      signature,
      timestamp: ts,
    }),
    false,
    'a re-serialised body must not verify'
  );
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.equal(
    verifySendGridSignature({
      publicKey: sendGridPublicKey,
      rawBody: body,
      signature: signSendGrid(ts, body, other.privateKey),
      timestamp: ts,
    }),
    false
  );
  const stale = String(Math.floor(Date.now() / 1000) - 2 * 3600);
  assert.equal(
    verifySendGridSignature({
      publicKey: sendGridPublicKey,
      rawBody: body,
      signature: signSendGrid(stale, body),
      timestamp: stale,
    }),
    false
  );
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.equal(
    verifySendGridSignature({
      publicKey: rsa.publicKey.export({ format: 'pem', type: 'spki' }),
      rawBody: body,
      signature,
      timestamp: ts,
    }),
    false
  );
  assert.equal(
    verifySendGridSignature({ publicKey: '', rawBody: body, signature, timestamp: ts }),
    false
  );
});

test('Mailgun HMAC signature, token format and timestamp window', () => {
  const ts = nowSeconds();
  const token = 'a'.repeat(50);
  assert.equal(
    verifyMailgunSignature({
      signingKey: MAILGUN_KEY,
      timestamp: ts,
      token,
      signature: signMailgun(ts, token),
    }),
    true
  );
  assert.equal(
    verifyMailgunSignature({
      signingKey: MAILGUN_KEY,
      timestamp: ts,
      token,
      signature: signMailgun(ts, token, 'other-key'),
    }),
    false
  );
  assert.equal(
    verifyMailgunSignature({
      signingKey: '',
      timestamp: ts,
      token,
      signature: signMailgun(ts, token),
    }),
    false
  );
  assert.equal(
    verifyMailgunSignature({
      signingKey: MAILGUN_KEY,
      timestamp: ts,
      token: 'bad token!',
      signature: signMailgun(ts, 'bad token!'),
    }),
    false
  );
  assert.equal(isFreshTimestamp('1'), false);
  assert.equal(isFreshTimestamp(nowSeconds()), true);
});

const streamCtx = (
  body,
  { path: urlPath = '/api/magic-mail/webhooks/sendgrid/abc', method = 'POST' } = {}
) => {
  const req = Readable.from([Buffer.from(body)]);
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
  };
  return {
    method,
    path: urlPath,
    req,
    state: {},
    get: (name) => req.headers[name.toLowerCase()],
  };
};

test('raw body middleware keeps exact bytes and hides the stream from the body parser', async () => {
  const middleware = createWebhookRawBodyMiddleware({ pathPrefix: '/api/magic-mail/webhooks/' });
  const ctx = streamCtx('[ {"event" : "bounce"} ]');
  let called = false;
  await middleware(ctx, async () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(ctx.state.magicMailWebhookRaw.toString(), '[ {"event" : "bounce"} ]');
  assert.equal(ctx.req.headers['content-type'], RAW_BODY_CONTENT_TYPE);

  const other = streamCtx('{}', { path: '/api/magic-mail/send' });
  await middleware(other, async () => {});
  assert.equal(other.state.magicMailWebhookRaw, undefined);
  assert.equal(other.req.headers['content-type'], 'application/json');

  const small = createWebhookRawBodyMiddleware({
    pathPrefix: '/api/magic-mail/webhooks/',
    limit: 8,
  });
  const big = streamCtx('x'.repeat(64));
  let reached = false;
  await small(big, async () => {
    reached = true;
  });
  assert.equal(big.status, 413);
  assert.equal(reached, false);
});

/**
 * Minimal Strapi double for the delivery service.
 */
const createStrapi = ({ account, logs = [] }) => {
  const emitted = [];
  const events = [];
  const updates = [];
  return {
    emitted,
    events,
    updates,
    log: quietLog,
    eventHub: { emit: (name, payload) => emitted.push({ name, payload }) },
    documents(uid) {
      return {
        findOne: async ({ documentId }) =>
          uid.endsWith('email-account') && account && documentId === account.documentId
            ? account
            : null,
        update: async (input) => updates.push(input),
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      };
    },
    db: {
      query(uid) {
        return {
          findOne: async ({ where }) => {
            if (uid.endsWith('email-event')) {
              return events.find((e) => e.providerEventId === where.providerEventId) || null;
            }
            const ids = where.providerMessageId.$in;
            return logs.find((log) => ids.includes(log.providerMessageId)) || null;
          },
          findMany: async ({ where }) =>
            logs.filter((log) => where.providerMessageId.$in.includes(log.providerMessageId)),
        };
      },
    },
  };
};

const withKey = async (fn) => {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
  try {
    await fn(require('../server/src/utils/encryption'));
  } finally {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  }
};

test('SendGrid webhook stores bounces/complaints and emits events without personal data', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const account = {
      documentId: 'acc1',
      provider: 'sendgrid',
      config: encryptCredentials({ apiKey: 'SG.test', webhookPublicKey: sendGridPublicKey }),
    };
    const logs = [{ id: 1, documentId: 'log1', providerMessageId: 'Gu2Gx9TkSiqZ' }];
    const strapi = createStrapi({ account, logs });
    const service = deliveryService({ strapi });
    const body = Buffer.from(
      JSON.stringify([
        {
          email: 'person@example.test',
          event: 'bounce',
          type: 'bounce',
          status: '5.1.1',
          reason: '550 5.1.1 user unknown person@example.test',
          sg_event_id: 'evt-1',
          sg_message_id: 'Gu2Gx9TkSiqZ.filterdrecv-1',
        },
        { event: 'spamreport', sg_event_id: 'evt-2', sg_message_id: 'Gu2Gx9TkSiqZ.filter-2' },
        { event: 'open', sg_event_id: 'evt-3', sg_message_id: 'Gu2Gx9TkSiqZ.filter-3' },
      ])
    );
    const ts = nowSeconds();
    const headers = {
      'x-twilio-email-event-webhook-signature': signSendGrid(ts, body),
      'x-twilio-email-event-webhook-timestamp': ts,
    };
    const result = await service.handleWebhook({
      provider: 'sendgrid',
      accountId: 'acc1',
      rawBody: body,
      headers,
    });
    assert.deepEqual(result, { status: 200, processed: 2 });
    assert.deepEqual(strapi.updates[0], {
      documentId: 'log1',
      data: { bounced: true, bounceReason: 'SENDGRID_BOUNCE_500' },
    });
    assert.equal(strapi.updates[1].data.complained, true);
    assert.deepEqual(
      strapi.emitted.map((e) => e.name),
      ['magic-mail.delivery.bounced', 'magic-mail.delivery.complained']
    );
    assert.deepEqual(strapi.emitted[0].payload, {
      provider: 'sendgrid',
      messageId: 'Gu2Gx9TkSiqZ',
      reasonCode: 'SENDGRID_BOUNCE_500',
    });
    assert.doesNotMatch(
      JSON.stringify([strapi.emitted, strapi.events, strapi.updates]),
      /example\.test|user unknown/
    );

    // Same batch again: event ids are de-duplicated.
    const again = await service.handleWebhook({
      provider: 'sendgrid',
      accountId: 'acc1',
      rawBody: body,
      headers,
    });
    assert.deepEqual(again, { status: 200, processed: 0 });

    // Bad signature, unknown account and wrong provider are indistinguishable.
    const bad = {
      ...headers,
      'x-twilio-email-event-webhook-signature': signSendGrid(ts, Buffer.from('x')),
    };
    assert.equal(
      (
        await service.handleWebhook({
          provider: 'sendgrid',
          accountId: 'acc1',
          rawBody: body,
          headers: bad,
        })
      ).status,
      401
    );
    assert.equal(
      (
        await service.handleWebhook({
          provider: 'sendgrid',
          accountId: 'nope',
          rawBody: body,
          headers,
        })
      ).status,
      401
    );
    assert.equal(
      (
        await service.handleWebhook({
          provider: 'mailgun',
          accountId: 'acc1',
          rawBody: body,
          headers,
        })
      ).status,
      401
    );
    assert.equal(
      (
        await service.handleWebhook({
          provider: 'sendgrid',
          accountId: '../x',
          rawBody: body,
          headers,
        })
      ).status,
      401
    );
  });
});

test('SendGrid webhook is off until a verification key is stored', async () => {
  await withKey(async ({ encryptCredentials }) => {
    const account = {
      documentId: 'acc2',
      provider: 'sendgrid',
      config: encryptCredentials({ apiKey: 'SG.test' }),
    };
    const service = deliveryService({ strapi: createStrapi({ account }) });
    const body = Buffer.from('[]');
    const ts = nowSeconds();
    const result = await service.handleWebhook({
      provider: 'sendgrid',
      accountId: 'acc2',
      rawBody: body,
      headers: {
        'x-twilio-email-event-webhook-signature': signSendGrid(ts, body),
        'x-twilio-email-event-webhook-timestamp': ts,
      },
    });
    assert.equal(result.status, 401);
  });
});

test('Mailgun webhook handles permanent failures, ignores temporary ones and rejects replays', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const account = {
      documentId: 'mg1',
      provider: 'mailgun',
      config: encryptCredentials({
        apiKey: 'key',
        domain: 'mg.example.test',
        webhookSigningKey: MAILGUN_KEY,
      }),
    };
    const logs = [{ id: 2, documentId: 'log2', providerMessageId: '20260212.abc@mg.example.test' }];
    const strapi = createStrapi({ account, logs });
    const service = deliveryService({ strapi });
    const make = (token, eventData) => {
      const ts = nowSeconds();
      return Buffer.from(
        JSON.stringify({
          signature: { timestamp: ts, token, signature: signMailgun(ts, token) },
          'event-data': eventData,
        })
      );
    };
    const permanent = {
      id: 'mg-evt-1',
      event: 'failed',
      severity: 'permanent',
      reason: 'bounce',
      recipient: 'person@example.test',
      'delivery-status': { code: 550, message: 'user unknown' },
      message: { headers: { 'message-id': '20260212.abc@mg.example.test' } },
    };
    const body = make('t'.repeat(50), permanent);
    assert.deepEqual(
      await service.handleWebhook({
        provider: 'mailgun',
        accountId: 'mg1',
        rawBody: body,
        headers: {},
      }),
      {
        status: 200,
        processed: 1,
      }
    );
    assert.equal(strapi.emitted[0].payload.reasonCode, 'MAILGUN_BOUNCE_550');
    assert.equal(strapi.emitted[0].payload.messageId, '20260212.abc@mg.example.test');

    // Replayed token is acknowledged without work.
    assert.deepEqual(
      await service.handleWebhook({
        provider: 'mailgun',
        accountId: 'mg1',
        rawBody: body,
        headers: {},
      }),
      {
        status: 200,
        processed: 0,
      }
    );

    const temporary = { ...permanent, id: 'mg-evt-2', severity: 'temporary' };
    assert.deepEqual(
      await service.handleWebhook({
        provider: 'mailgun',
        accountId: 'mg1',
        rawBody: make('u'.repeat(50), temporary),
        headers: {},
      }),
      { status: 200, processed: 0 }
    );

    const forged = JSON.parse(body.toString());
    forged.signature.signature = signMailgun(
      forged.signature.timestamp,
      forged.signature.token,
      'wrong'
    );
    forged.signature.token = 'v'.repeat(50);
    assert.equal(
      (
        await service.handleWebhook({
          provider: 'mailgun',
          accountId: 'mg1',
          rawBody: Buffer.from(JSON.stringify(forged)),
          headers: {},
        })
      ).status,
      401
    );
    assert.equal(
      (
        await service.handleWebhook({
          provider: 'mailgun',
          accountId: 'mg1',
          rawBody: Buffer.from('not json'),
          headers: {},
        })
      ).status,
      400
    );
  });
});

test('getDeliveryEvents answers by provider message id with codes only', async () => {
  const logs = [
    {
      providerMessageId: 'a@x.test',
      bounced: true,
      bounceReason: 'MAILGUN_BOUNCE_550',
      complained: false,
    },
    {
      providerMessageId: 'b@x.test',
      bounced: false,
      bounceReason: 'free text from 2024',
      complained: true,
    },
  ];
  const service = deliveryService({ strapi: createStrapi({ logs }) });
  assert.deepEqual(await service.getDeliveryEvents(['<a@x.test>', 'b@x.test', 'bad id', null]), [
    { messageId: 'a@x.test', bounced: true, complained: false, reasonCode: 'MAILGUN_BOUNCE_550' },
    { messageId: 'b@x.test', bounced: false, complained: true, reasonCode: null },
  ]);
  assert.deepEqual(await service.getDeliveryEvents('nope'), []);
});

test('send paths report real provider ids or none, never synthetic ones', () => {
  const router = fs.readFileSync(path.join(ROOT, 'server/src/services/email-router.js'), 'utf8');
  assert.doesNotMatch(router, /`(sendgrid|mailgun|microsoft)-\$\{Date\.now\(\)\}`/);
  assert.match(router, /providerMessageId: normalizeMessageId\(routing\.result\?\.messageId\)/);
  const log = require('../server/src/content-types/email-log/schema.json');
  assert.equal(log.attributes.providerMessageId.maxLength, 255);
  assert.deepEqual(log.attributes.deliveryStatus.enum, ['pending', 'sent', 'failed']);
  assert.equal(log.attributes.complained.type, 'boolean');
});

test('webhook secrets are encrypted, masked and the UI shows bounce/complaint badges', () => {
  const accountManager = fs.readFileSync(
    path.join(ROOT, 'server/src/services/account-manager.js'),
    'utf8'
  );
  assert.match(accountManager, /'webhookSigningKey'/);
  const ui = fs.readFileSync(path.join(ROOT, 'admin/src/pages/Analytics.jsx'), 'utf8');
  assert.match(ui, /feedback\.bounced === true\) return \{ label: 'Bounced', tone: 'danger' \}/);
  assert.match(
    ui,
    /feedback\.complained === true\) return \{ label: 'Complaint', tone: 'danger' \}/
  );
  const register = fs.readFileSync(path.join(ROOT, 'server/src/register.js'), 'utf8');
  assert.match(register, /strapi\.server\.use\(/);
});

test('wizard builds the webhook URL only for saved SendGrid/Mailgun accounts', () => {
  const { loadAdminModule } = require('./helpers/load-admin-module');
  const { getWebhookUrl, buildConfig } = loadAdminModule(
    'admin/src/components/AccountWizard/wizardState.js'
  );
  assert.equal(
    getWebhookUrl('mailgun', 'abc123', {
      backendURL: 'https://cms.example.test/',
      origin: 'https://admin.example.test',
    }),
    'https://cms.example.test/api/magic-mail/webhooks/mailgun/abc123'
  );
  assert.equal(getWebhookUrl('sendgrid', null, { origin: 'https://x.test' }), null);
  assert.equal(getWebhookUrl('smtp', 'abc', { origin: 'https://x.test' }), null);
  assert.deepEqual(buildConfig('sendgrid', { apiKey: ' SG.k ', webhookPublicKey: ' KEY ' }), {
    apiKey: 'SG.k',
    webhookPublicKey: 'KEY',
  });
});
