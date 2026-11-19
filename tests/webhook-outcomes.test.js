'use strict';

/**
 * Delivery webhook outcomes against the providers' official sample payloads
 * (tests/fixtures/webhooks/README.md lists the sources).
 *
 * Every case runs the real delivery-webhooks service, the real raw-body
 * middleware and the real bounce-monitor suppression service against an
 * in-memory Strapi double. Requests are signed with locally generated keys;
 * no provider is contacted.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const deliveryService = require('../server/src/services/delivery-webhooks');
const bounceMonitorService = require('../server/src/services/bounce-monitor');
const {
  verifySendGridSignature,
  verifyMailgunSignature,
} = require('../server/src/utils/webhook-signatures');
const {
  createWebhookRawBodyMiddleware,
  DEFAULT_LIMIT_BYTES,
} = require('../server/src/utils/webhook-raw-body');
const pluginConfig = require('../server/src/config');

const SENDGRID = require('./fixtures/webhooks/sendgrid-events.json');
const MAILGUN = require('./fixtures/webhooks/mailgun-events.json');

const clone = (value) => JSON.parse(JSON.stringify(value));
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const SENDGRID_PUBLIC_KEY = ec.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const MAILGUN_KEY = 'mailgun-signing-key-for-tests';

/** Signs a SendGrid batch exactly as SendGrid does: ECDSA over timestamp + raw body. */
const signedSendGrid = (events) => {
  const rawBody = Buffer.from(JSON.stringify(events));
  const timestamp = nowSeconds();
  const signature = crypto
    .sign('sha256', Buffer.concat([Buffer.from(timestamp), rawBody]), {
      key: ec.privateKey,
      dsaEncoding: 'der',
    })
    .toString('base64');
  return {
    rawBody,
    headers: {
      'x-twilio-email-event-webhook-signature': signature,
      'x-twilio-email-event-webhook-timestamp': timestamp,
    },
  };
};

let tokenCounter = 0;
/** Wraps one Mailgun event-data object in a signed webhook body. */
const signedMailgun = (eventData) => {
  tokenCounter += 1;
  const token = `tok${String(tokenCounter).padStart(47, '0')}`;
  const timestamp = nowSeconds();
  const signature = crypto
    .createHmac('sha256', MAILGUN_KEY)
    .update(`${timestamp}${token}`)
    .digest('hex');
  return Buffer.from(
    JSON.stringify({ signature: { timestamp, token, signature }, 'event-data': eventData })
  );
};

const withKey = async (fn) => {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
  try {
    return await fn(require('../server/src/utils/encryption'));
  } finally {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  }
};

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && Array.isArray(condition.$in)) {
      return condition.$in.includes(row[key]);
    }
    return row[key] === condition;
  });

/**
 * In-memory Strapi double: email logs, email events and the suppression list,
 * the plugin-settings service and the real bounce-monitor service.
 */
const createHost = ({
  provider = 'sendgrid',
  logs = [],
  settings = {},
  webhooks = {},
  encryptCredentials,
}) => {
  const account = {
    documentId: 'acc1',
    provider,
    config: encryptCredentials(
      provider === 'sendgrid'
        ? { apiKey: 'SG.test', webhookPublicKey: SENDGRID_PUBLIC_KEY }
        : { apiKey: 'key', domain: 'mg.example.test', webhookSigningKey: MAILGUN_KEY }
    ),
  };
  const tables = {
    'plugin::magic-mail.email-log': logs.map((log, index) => ({
      id: index + 1,
      accountId: 'acc1',
      deliveryStatus: 'sent',
      deliveredAt: new Date('2026-01-01T00:00:00Z'),
      bounced: false,
      complained: false,
      unsubscribed: false,
      ...log,
    })),
    'plugin::magic-mail.email-event': [],
    'plugin::magic-mail.suppressed-recipient': [],
  };
  const emitted = [];
  const warnings = [];
  let nextId = 1000;
  const strapi = {
    emitted,
    warnings,
    tables,
    log: {
      debug() {},
      info() {},
      error() {},
      warn: (message) => warnings.push(String(message)),
    },
    config: {
      get: (key, fallback) => (key === 'plugin::magic-mail.webhooks' ? webhooks : fallback),
    },
    eventHub: { emit: async (name, payload) => emitted.push({ name, payload }) },
    documents(uid) {
      return {
        findOne: async ({ documentId }) =>
          uid.endsWith('email-account') && documentId === account.documentId ? account : null,
        update: async ({ documentId, data }) => {
          const row = tables[uid].find((r) => r.documentId === documentId);
          Object.assign(row, data);
          return row;
        },
        create: async ({ data }) => {
          const row = { id: (nextId += 1), ...data };
          tables[uid].push(row);
          return row;
        },
      };
    },
    db: {
      query(uid) {
        const rows = () => tables[uid];
        return {
          findOne: async ({ where }) => rows().find((row) => matches(row, where)) || null,
          findMany: async ({ where }) => rows().filter((row) => matches(row, where)),
          update: async ({ where, data }) => {
            const row = rows().find((r) => matches(r, where));
            Object.assign(row, data);
            return row;
          },
          create: async ({ data }) => {
            const row = { id: (nextId += 1), documentId: `doc${nextId}`, ...data };
            rows().push(row);
            return row;
          },
          count: async ({ where } = {}) => rows().filter((row) => matches(row, where)).length,
        };
      },
    },
    plugin: () => ({
      service: (name) => {
        if (name === 'plugin-settings') return { getSettings: async () => settings };
        if (name === 'bounce-monitor') return monitor;
        throw new Error(`unexpected service ${name}`);
      },
    }),
  };
  const monitor = bounceMonitorService({ strapi });
  const service = deliveryService({ strapi });
  const log = (documentId = 'log1') =>
    tables['plugin::magic-mail.email-log'].find((row) => row.documentId === documentId);
  const events = () => tables['plugin::magic-mail.email-event'];
  const suppressed = () => tables['plugin::magic-mail.suppressed-recipient'];
  return { strapi, service, monitor, log, events, suppressed };
};

/** The X-Message-Id SendGrid returned at send time for the official samples. */
const SG_MESSAGE_ID = '14c5d75ce93.dfd.64b469';
const sgLog = (extra = {}) => ({
  documentId: 'log1',
  providerMessageId: SG_MESSAGE_ID,
  recipient: 'person@example.test',
  ...extra,
});

let eventCounter = 0;
/** An official SendGrid sample with a fresh, unique sg_event_id. */
const sg = (name, overrides = {}) => {
  eventCounter += 1;
  return { ...clone(SENDGRID[name]), sg_event_id: `evt-${eventCounter}`, ...overrides };
};

const sendSendGrid = async (host, events) => {
  const { rawBody, headers } = signedSendGrid(events);
  return host.service.handleWebhook({ provider: 'sendgrid', accountId: 'acc1', rawBody, headers });
};

const sendMailgun = async (host, eventData) =>
  host.service.handleWebhook({
    provider: 'mailgun',
    accountId: 'acc1',
    rawBody: signedMailgun(eventData),
    headers: {},
  });

const topics = (host) => host.strapi.emitted.map((entry) => entry.name);

test('SendGrid hard bounce: Bounced, bounce event, bounced topic and suppression', async () => {
  await withKey(async ({ encryptCredentials, purposeHmac }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    const result = await sendSendGrid(host, [sg('bounce')]);
    assert.equal(result.status, 200);
    assert.equal(result.processed, 1);
    assert.equal(host.log().deliveryStatus, 'bounced');
    assert.equal(host.log().bounced, true);
    assert.equal(host.log().bounceReason, 'SENDGRID_BOUNCE_500');
    assert.deepEqual(topics(host), ['magic-mail.delivery.bounced']);
    assert.equal(host.events()[0].type, 'bounce');
    assert.equal(host.suppressed().length, 1);
    assert.equal(
      host.suppressed()[0].addressHash,
      purposeHmac('suppressed-recipient', 'person@example.test')
    );
    assert.equal(host.suppressed()[0].maskedAddress, 'p***@example.test');
    assert.equal(host.suppressed()[0].source, 'sendgrid');
    assert.equal(await host.monitor.isSuppressed('Person@Example.test'), true);
    assert.doesNotMatch(JSON.stringify([host.strapi.emitted, host.events()]), /person@/);
  });
});

test('SendGrid hard bounce is not suppressed while "Block hard-bounced recipients" is off', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({ logs: [sgLog()], encryptCredentials });
    await sendSendGrid(host, [sg('bounce')]);
    assert.equal(host.log().deliveryStatus, 'bounced');
    assert.equal(host.suppressed().length, 0);
  });
});

test('SendGrid blocked is a final non-delivery, not a hard bounce', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    await sendSendGrid(host, [sg('blocked')]);
    assert.equal(host.log().deliveryStatus, 'blocked');
    assert.equal(host.log().bounced, false);
    assert.equal(host.log().bounceReason, 'SENDGRID_BLOCKED_500');
    assert.deepEqual(topics(host), ['magic-mail.delivery.blocked']);
    assert.equal(host.events()[0].type, 'blocked');
    assert.equal(host.suppressed().length, 0);
  });
});

/** Every reason listed under "Dropped" on the SendGrid Event Webhook reference. */
const DROPPED_CASES = [
  ['Bounced Address', 'bounced', 'SENDGRID_DROPPED_BOUNCED_ADDRESS', 'bounced', true],
  ['Invalid', 'bounced', 'SENDGRID_DROPPED_INVALID', 'bounced', true],
  ['Spam Reporting Address', 'complained', 'SENDGRID_DROPPED_SPAM_REPORTING_ADDRESS', 'failed'],
  ['Unsubscribed Address', 'unsubscribed', 'SENDGRID_DROPPED_UNSUBSCRIBED_ADDRESS', 'failed'],
  ['Group Unsubscribe', 'unsubscribed', 'SENDGRID_DROPPED_GROUP_UNSUBSCRIBE', 'failed'],
  ['Invalid SMTPAPI header', 'dropped', 'SENDGRID_DROPPED_INVALID_SMTPAPI_HEADER', 'failed'],
  ['Invalid Template', 'dropped', 'SENDGRID_DROPPED_INVALID_TEMPLATE', 'failed'],
  ['Template Render Failure', 'dropped', 'SENDGRID_DROPPED_TEMPLATE_RENDER_FAILURE', 'failed'],
  ['Domain is not allowed', 'dropped', 'SENDGRID_DROPPED_DOMAIN_IS_NOT_ALLOWED', 'failed'],
  ['Expired', 'dropped', 'SENDGRID_DROPPED_EXPIRED', 'failed'],
  ['Something new from SendGrid', 'dropped', 'SENDGRID_DROPPED_OTHER', 'failed'],
];

for (const [reason, kind, code, status, suppress = false] of DROPPED_CASES) {
  test(`SendGrid dropped "${reason}" -> ${kind} (${code})`, async () => {
    await withKey(async ({ encryptCredentials }) => {
      deliveryService.__test__.resetSeen();
      const host = createHost({
        logs: [sgLog()],
        settings: { suppressHardBounces: true },
        webhooks: { suppressComplaints: true },
        encryptCredentials,
      });
      const result = await sendSendGrid(host, [sg('dropped', { reason })]);
      assert.equal(result.status, 200);
      const log = host.log();
      assert.equal(log.deliveryStatus, status);
      assert.equal(log.bounced, kind === 'bounced');
      assert.equal(log.complained, kind === 'complained');
      assert.equal(log.unsubscribed, kind === 'unsubscribed');
      assert.equal(log.bounceReason, code);
      assert.deepEqual(topics(host), [`magic-mail.delivery.${kind}`]);
      assert.equal(host.strapi.emitted[0].payload.reasonCode, code);
      // Complaint suppression is opt-in and on here; unsubscribes are never suppressed.
      const expectSuppressed = suppress || kind === 'complained';
      assert.equal(host.suppressed().length, expectSuppressed ? 1 : 0);
      assert.doesNotMatch(log.bounceReason, /[a-z ]/, 'only an allowlisted code is stored');
    });
  });
}

test('SendGrid spam report: complained, suppression only with webhooks.suppressComplaints', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const off = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    await sendSendGrid(off, [sg('spamreport')]);
    assert.equal(off.log().complained, true);
    assert.equal(off.log().deliveryStatus, 'sent', 'a complaint does not change delivery');
    assert.deepEqual(topics(off), ['magic-mail.delivery.complained']);
    assert.equal(off.suppressed().length, 0);

    deliveryService.__test__.resetSeen();
    const on = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      webhooks: { suppressComplaints: true },
      encryptCredentials,
    });
    await sendSendGrid(on, [sg('spamreport')]);
    assert.equal(on.suppressed().length, 1);
    assert.equal(on.suppressed()[0].reasonCode, 'SENDGRID_SPAMREPORT');
  });
});

test('SendGrid deferred then delivered: Deferred, then Sent with a delivery confirmation', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({ logs: [sgLog()], encryptCredentials });
    await sendSendGrid(host, [sg('deferred', { timestamp: 1700000000 })]);
    assert.equal(host.log().deliveryStatus, 'deferred');
    assert.equal(host.log().bounced, false);
    assert.deepEqual(topics(host), ['magic-mail.delivery.deferred']);

    await sendSendGrid(host, [sg('delivered', { timestamp: 1700000100 })]);
    assert.equal(host.log().deliveryStatus, 'sent');
    assert.equal(host.log().deliveryConfirmedAt.toISOString(), '2023-11-14T22:15:00.000Z');
    assert.equal(
      host.log().deliveredAt.toISOString(),
      '2026-01-01T00:00:00.000Z',
      'deliveredAt keeps the provider acceptance time'
    );
    assert.deepEqual(topics(host), [
      'magic-mail.delivery.deferred',
      'magic-mail.delivery.delivered',
    ]);
    assert.deepEqual(
      host.events().map((event) => event.type),
      ['deferred', 'delivered']
    );
  });
});

test('ordering: a late, older deferred never overrides delivered; terminal states never downgrade', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({ logs: [sgLog()], encryptCredentials });
    // Out of order inside one batch: delivered (t=200) is listed before deferred (t=100).
    await sendSendGrid(host, [
      sg('delivered', { timestamp: 1700000200 }),
      sg('deferred', { timestamp: 1700000100 }),
    ]);
    assert.equal(host.log().deliveryStatus, 'sent');
    assert.ok(host.log().deliveryConfirmedAt);

    // Across batches: an older deferred arriving later is recorded but changes nothing.
    await sendSendGrid(host, [sg('deferred', { timestamp: 1700000050 })]);
    assert.equal(host.log().deliveryStatus, 'sent');

    // A bounce is terminal; later deferred/delivered/blocked do not downgrade it.
    await sendSendGrid(host, [sg('bounce', { timestamp: 1700000300 })]);
    await sendSendGrid(host, [
      sg('deferred', { timestamp: 1700000400 }),
      sg('delivered', { timestamp: 1700000500 }),
      sg('blocked', { timestamp: 1700000600 }),
    ]);
    assert.equal(host.log().deliveryStatus, 'bounced');
    assert.equal(host.log().bounced, true);
    assert.equal(host.log().bounceReason, 'SENDGRID_BOUNCE_500');
  });
});

test('SendGrid unsubscribe, group_unsubscribe and group_resubscribe', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    await sendSendGrid(host, [sg('unsubscribe', { timestamp: 1700000000 })]);
    assert.equal(host.log().unsubscribed, true);
    assert.equal(host.log().unsubscribedAt.toISOString(), '2023-11-14T22:13:20.000Z');
    assert.equal(host.log().deliveryStatus, 'sent');
    assert.equal(host.events()[0].type, 'unsubscribe');

    await sendSendGrid(host, [sg('group_resubscribe', { timestamp: 1700000100 })]);
    assert.equal(host.log().unsubscribed, false);

    await sendSendGrid(host, [sg('group_unsubscribe', { timestamp: 1700000200 })]);
    assert.equal(host.log().unsubscribed, true);
    assert.deepEqual(topics(host), [
      'magic-mail.delivery.unsubscribed',
      'magic-mail.delivery.resubscribed',
      'magic-mail.delivery.unsubscribed',
    ]);
    assert.equal(host.suppressed().length, 0, 'unsubscribes never feed the suppression list');
  });
});

test('multi-recipient: a CC bounce leaves the primary log untouched and suppresses only the CC', async () => {
  await withKey(async ({ encryptCredentials, purposeHmac }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    // Two recipients of one send share the X-Message-Id prefix of sg_message_id.
    const result = await sendSendGrid(host, [
      sg('delivered', { email: 'person@example.test', timestamp: 1700000000 }),
      sg('bounce', {
        email: 'cc.person@example.test',
        sg_message_id: `${SG_MESSAGE_ID}.filter0002.16648.5515E0B88.1`,
        timestamp: 1700000001,
      }),
    ]);
    assert.equal(result.processed, 2);
    const log = host.log();
    assert.equal(log.deliveryStatus, 'sent');
    assert.equal(log.bounced, false);
    assert.ok(log.deliveryConfirmedAt);
    const ccEvent = host.events().find((event) => event.type === 'bounce');
    assert.equal(ccEvent.metadata.primary, false);
    assert.equal(ccEvent.metadata.recipient, 'c***@example.test');
    const primaryEvent = host.events().find((event) => event.type === 'delivered');
    assert.equal(primaryEvent.metadata.primary, true);
    assert.equal(primaryEvent.metadata.recipient, undefined);
    assert.equal(host.strapi.emitted[1].payload.primary, false);
    assert.equal(host.suppressed().length, 1);
    assert.equal(
      host.suppressed()[0].addressHash,
      purposeHmac('suppressed-recipient', 'cc.person@example.test')
    );
    assert.doesNotMatch(JSON.stringify(host.strapi.emitted), /@example\.test/);
  });
});

test('async SendGrid bounce without sg_message_id is matched by magicmail_id, then smtp-id', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog(), sgLog({ documentId: 'log2', providerMessageId: 'OtherXMessageId' })],
      encryptCredentials,
    });
    const viaCustomArg = sg('bounce', { magicmail_id: 'log2' });
    delete viaCustomArg.sg_message_id;
    delete viaCustomArg['smtp-id'];
    await sendSendGrid(host, [viaCustomArg]);
    assert.equal(host.log('log2').deliveryStatus, 'bounced');
    assert.equal(host.log('log1').deliveryStatus, 'sent');

    const viaSmtpId = sg('bounce');
    delete viaSmtpId.sg_message_id;
    await sendSendGrid(host, [viaSmtpId]);
    assert.equal(host.log('log1').deliveryStatus, 'bounced');
  });
});

test('magicmail_id is validated and bound to the webhook account', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog({ documentId: 'other', accountId: 'acc-other', providerMessageId: 'zzz' })],
      encryptCredentials,
    });
    const foreign = sg('bounce', { magicmail_id: 'other' });
    delete foreign.sg_message_id;
    delete foreign['smtp-id'];
    const injected = sg('bounce', { magicmail_id: { $ne: null } });
    delete injected.sg_message_id;
    delete injected['smtp-id'];
    const result = await sendSendGrid(host, [foreign, injected]);
    assert.equal(result.status, 200);
    assert.equal(host.log('other').deliveryStatus, 'sent');
    assert.equal(result.unmatched, 2);
  });
});

test('unmatched events are counted and logged without personal data', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({ logs: [], encryptCredentials });
    const orphan = sg('bounce');
    delete orphan.sg_message_id;
    delete orphan['smtp-id'];
    const result = await sendSendGrid(host, [orphan, sg('dropped')]);
    assert.equal(result.status, 200);
    assert.equal(result.unmatched, 2);
    assert.equal(host.strapi.warnings.length, 1);
    assert.match(host.strapi.warnings[0], /2 delivery event\(s\) matched no email log/);
    assert.doesNotMatch(host.strapi.warnings.join('\n'), /@|14c5d75ce93/);
  });
});

test('1500 delivered events followed by one bounce: the bounce is processed', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog(), sgLog({ documentId: 'log2', providerMessageId: 'BouncedXMessageId' })],
      encryptCredentials,
    });
    const batch = Array.from({ length: 1500 }, () => sg('delivered'));
    batch.push(sg('bounce', { sg_message_id: 'BouncedXMessageId.filter0001.1.2.3' }));
    const result = await sendSendGrid(host, batch);
    assert.equal(result.status, 200);
    assert.equal(result.processed, 1501);
    assert.equal(host.log('log2').deliveryStatus, 'bounced');
  });
});

/** Runs a request body through the raw-body middleware with an optional limit. */
const throughMiddleware = async (body, options = {}) => {
  const middleware = createWebhookRawBodyMiddleware({
    pathPrefix: '/api/magic-mail/webhooks/',
    ...options,
  });
  const req = Readable.from([body]);
  req.headers = { 'content-type': 'application/json', 'content-length': String(body.length) };
  const ctx = {
    method: 'POST',
    path: '/api/magic-mail/webhooks/sendgrid/acc1',
    req,
    state: {},
    get: (name) => req.headers[name.toLowerCase()],
  };
  let reached = false;
  await middleware(ctx, async () => {
    reached = true;
  });
  return { ctx, reached };
};

test('a signed ~800 KB SendGrid batch passes the default limit and is fully processed', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    assert.equal(DEFAULT_LIMIT_BYTES, 1024 * 1024);
    const host = createHost({
      logs: [sgLog(), sgLog({ documentId: 'log2', providerMessageId: 'LastXMessageId' })],
      encryptCredentials,
    });
    const batch = [];
    const padding = 'x'.repeat(400);
    while (Buffer.byteLength(JSON.stringify(batch)) < 800_000) {
      batch.push(sg('delivered', { category: padding }));
    }
    batch.push(sg('bounce', { sg_message_id: 'LastXMessageId.filter0001.1.2.3' }));
    const { rawBody, headers } = signedSendGrid(batch);
    assert.ok(rawBody.length > 800_000 && rawBody.length < DEFAULT_LIMIT_BYTES);

    const { ctx, reached } = await throughMiddleware(rawBody);
    assert.equal(reached, true);
    assert.equal(ctx.status, undefined);
    assert.equal(ctx.state.magicMailWebhookRaw.length, rawBody.length);

    const result = await host.service.handleWebhook({
      provider: 'sendgrid',
      accountId: 'acc1',
      rawBody: ctx.state.magicMailWebhookRaw,
      headers,
    });
    assert.equal(result.status, 200);
    assert.equal(result.processed, batch.length);
    assert.equal(host.log('log2').deliveryStatus, 'bounced');
  });
});

test('bodies over the limit get 413 (declared length and streamed size)', async () => {
  const big = Buffer.alloc(DEFAULT_LIMIT_BYTES + 1, 0x20);
  const declared = await throughMiddleware(big);
  assert.equal(declared.ctx.status, 413);
  assert.equal(declared.reached, false);

  // Streamed path: the client under-declares the length.
  const middleware = createWebhookRawBodyMiddleware({
    pathPrefix: '/api/magic-mail/webhooks/',
    limit: 64 * 1024,
  });
  const req = Readable.from([Buffer.alloc(70 * 1024, 0x20)]);
  req.headers = { 'content-length': '10' };
  const ctx = {
    method: 'POST',
    path: '/api/magic-mail/webhooks/mailgun/acc1',
    req,
    state: {},
    get: (name) => req.headers[name.toLowerCase()],
  };
  let reached = false;
  await middleware(ctx, async () => {
    reached = true;
  });
  assert.equal(ctx.status, 413);
  assert.equal(reached, false);
});

test('webhooks.maxBodyBytes and webhooks.suppressComplaints are validated plugin config', () => {
  assert.deepEqual(pluginConfig.default.webhooks, {
    maxBodyBytes: 1024 * 1024,
    suppressComplaints: false,
  });
  const ok = (webhooks) => pluginConfig.validator({ webhooks });
  ok({ maxBodyBytes: 64 * 1024 });
  ok({ maxBodyBytes: 5 * 1024 * 1024, suppressComplaints: true });
  for (const bad of [
    { maxBodyBytes: 64 * 1024 - 1 },
    { maxBodyBytes: 5 * 1024 * 1024 + 1 },
    { maxBodyBytes: 1.5 },
    { maxBodyBytes: '1048576' },
    { suppressComplaints: 'yes' },
  ]) {
    assert.throws(() => ok(bad), /config\.webhooks\./);
  }
  assert.throws(() => pluginConfig.validator({ webhooks: [] }), /config\.webhooks must be/);
});

test('register passes the configured webhook body limit to the raw-body middleware', async () => {
  const register = require('../server/src/register');
  const used = [];
  register({
    strapi: {
      config: {
        get: (key, fallback) => {
          if (key === 'plugin::magic-mail.webhooks.maxBodyBytes') return 64 * 1024;
          if (key === 'api.rest.prefix') return '/api';
          return fallback;
        },
      },
      server: { use: (middleware) => used.push(middleware) },
      admin: { services: { permission: { actionProvider: { registerMany() {} } } } },
    },
  });
  const req = Readable.from([Buffer.alloc(65 * 1024, 0x20)]);
  req.headers = { 'content-length': String(65 * 1024) };
  const ctx = {
    method: 'POST',
    path: '/api/magic-mail/webhooks/sendgrid/acc1',
    req,
    state: {},
    get: (name) => req.headers[name.toLowerCase()],
  };
  await used[0](ctx, async () => {});
  assert.equal(ctx.status, 413);
});

test('Mailgun failed permanent: Bounced; suppress-* and old reasons are not suppressed', async () => {
  await withKey(async ({ encryptCredentials }) => {
    for (const [reason, expectSuppressed] of [
      ['bounce', true],
      ['generic', true],
      ['suppress-bounce', false],
      ['suppress-unsubscribe', false],
      ['old', false],
    ]) {
      deliveryService.__test__.resetSeen();
      const event = clone(MAILGUN.failedPermanent);
      event.reason = reason;
      event.recipient = 'joan@example.test';
      const host = createHost({
        provider: 'mailgun',
        logs: [
          {
            documentId: 'log1',
            providerMessageId: event.message.headers['message-id'],
            recipient: 'joan@example.test',
          },
        ],
        settings: { suppressHardBounces: true },
        encryptCredentials,
      });
      const result = await sendMailgun(host, event);
      assert.equal(result.status, 200, reason);
      assert.equal(host.log().deliveryStatus, 'bounced', reason);
      assert.deepEqual(topics(host), ['magic-mail.delivery.bounced'], reason);
      assert.equal(host.suppressed().length, expectSuppressed ? 1 : 0, reason);
      if (expectSuppressed) assert.equal(host.suppressed()[0].source, 'mailgun');
    }
  });
});

// Shapes observed live against a Mailgun US sandbox domain on 2026-11-19
// (events API and signed webhook posts; addresses and ids replaced).
test('Mailgun severity and bounce type: only permanent hard bounces suppress', async () => {
  await withKey(async ({ encryptCredentials }) => {
    const cases = [
      {
        label: 'temporary 621 template not found',
        severity: 'temporary',
        reason: 'generic',
        status: { code: 621, 'retry-seconds': 600, 'enhanced-code': '' },
        expect: { status: 'deferred', reasonCode: 'MAILGUN_TEMPLATE_NOT_FOUND', topic: 'deferred' },
      },
      {
        label: 'temporary 421 mailbox busy',
        severity: 'temporary',
        reason: 'generic',
        status: { code: 421, 'bounce-type': 'soft' },
        expect: { status: 'deferred', reasonCode: 'MAILGUN_DEFERRED_421', topic: 'deferred' },
      },
      {
        label: 'permanent espblock (550 5.7.40, soft)',
        severity: 'permanent',
        reason: 'espblock',
        status: { code: 550, 'enhanced-code': '5.7.40', 'bounce-type': 'soft' },
        expect: { status: 'blocked', reasonCode: 'MAILGUN_ESPBLOCK_550', topic: 'blocked' },
      },
      {
        label: 'permanent soft bounce',
        severity: 'permanent',
        reason: 'bounce',
        status: { code: 552, 'bounce-type': 'soft' },
        expect: { status: 'bounced', reasonCode: 'MAILGUN_BOUNCE_552', topic: 'bounced' },
      },
      {
        label: 'permanent 621 template not found',
        severity: 'permanent',
        reason: 'generic',
        status: { code: 621 },
        expect: { status: 'failed', reasonCode: 'MAILGUN_TEMPLATE_NOT_FOUND', topic: 'dropped' },
      },
      {
        label: 'permanent hard bounce',
        severity: 'permanent',
        reason: 'bounce',
        status: { code: 550, 'enhanced-code': '5.1.1', 'bounce-type': 'hard' },
        expect: { status: 'bounced', reasonCode: 'MAILGUN_BOUNCE_550', topic: 'bounced' },
        suppressed: true,
      },
    ];
    for (const item of cases) {
      deliveryService.__test__.resetSeen();
      const event = clone(MAILGUN.failedPermanent);
      Object.assign(event, {
        severity: item.severity,
        reason: item.reason,
        recipient: 'joan@example.test',
        'delivery-status': { 'attempt-no': 1, message: '', ...item.status },
      });
      const host = createHost({
        provider: 'mailgun',
        logs: [
          {
            documentId: 'log1',
            providerMessageId: event.message.headers['message-id'],
            recipient: 'joan@example.test',
          },
        ],
        settings: { suppressHardBounces: true },
        encryptCredentials,
      });
      const result = await sendMailgun(host, event);
      assert.equal(result.status, 200, item.label);
      assert.equal(host.log().deliveryStatus, item.expect.status, item.label);
      assert.equal(host.log().bounceReason, item.expect.reasonCode, item.label);
      assert.equal(host.log().bounced === true, item.expect.status === 'bounced', item.label);
      assert.deepEqual(topics(host), [`magic-mail.delivery.${item.expect.topic}`], item.label);
      assert.equal(host.suppressed().length, item.suppressed ? 1 : 0, item.label);
    }
  });
});

test('Mailgun failed temporary -> deferred; delivered -> confirmation; never downgrades', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const messageId = MAILGUN.delivered.message.headers['message-id'];
    const host = createHost({
      provider: 'mailgun',
      logs: [{ documentId: 'log1', providerMessageId: messageId, recipient: 'john@example.test' }],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    const temporary = {
      ...clone(MAILGUN.failedPermanent),
      id: 'temp-1',
      severity: 'temporary',
      reason: 'generic',
      recipient: 'john@example.test',
      timestamp: 1529692100.5,
      'delivery-status': { code: 421, message: 'try later' },
      message: { headers: { 'message-id': messageId } },
    };
    await sendMailgun(host, temporary);
    assert.equal(host.log().deliveryStatus, 'deferred');
    assert.equal(host.log().bounceReason, 'MAILGUN_DEFERRED_421');
    assert.equal(host.suppressed().length, 0);

    await sendMailgun(host, clone(MAILGUN.delivered));
    assert.equal(host.log().deliveryStatus, 'sent');
    assert.ok(host.log().deliveryConfirmedAt);

    // An older temporary failure delivered late does not move the status back.
    await sendMailgun(host, { ...temporary, id: 'temp-2', timestamp: 1529692150 });
    assert.equal(host.log().deliveryStatus, 'sent');
    assert.deepEqual(topics(host), [
      'magic-mail.delivery.deferred',
      'magic-mail.delivery.delivered',
      'magic-mail.delivery.deferred',
    ]);
  });
});

test('Mailgun complained and unsubscribed', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const complaint = clone(MAILGUN.complained);
    const unsub = clone(MAILGUN.unsubscribed);
    const host = createHost({
      provider: 'mailgun',
      logs: [
        {
          documentId: 'log1',
          providerMessageId: complaint.message.headers['message-id'],
          recipient: 'foo@example.test',
        },
        {
          documentId: 'log2',
          providerMessageId: unsub.message.headers['message-id'],
          recipient: 'recipient@example.test',
        },
      ],
      settings: { suppressHardBounces: true },
      webhooks: { suppressComplaints: true },
      encryptCredentials,
    });
    await sendMailgun(host, complaint);
    await sendMailgun(host, unsub);
    assert.equal(host.log('log1').complained, true);
    assert.equal(host.log('log2').unsubscribed, true);
    assert.deepEqual(topics(host), [
      'magic-mail.delivery.complained',
      'magic-mail.delivery.unsubscribed',
    ]);
    assert.equal(host.suppressed().length, 1, 'only the complaint is suppressed');
    assert.equal(host.suppressed()[0].reasonCode, 'MAILGUN_COMPLAINED');
  });
});

test('Mailgun CC failure and v:magicmail_id fallback', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    // The official Failed sample: headers.to is joan, the failing recipient is another address.
    const event = clone(MAILGUN.failedPermanent);
    event.reason = 'bounce';
    const host = createHost({
      provider: 'mailgun',
      logs: [
        {
          documentId: 'log1',
          providerMessageId: event.message.headers['message-id'],
          recipient: 'joan@example.test',
        },
        { documentId: 'log2', providerMessageId: 'other@mg.example.test', recipient: 'a@x.test' },
      ],
      encryptCredentials,
    });
    await sendMailgun(host, event);
    assert.equal(host.log().deliveryStatus, 'sent', 'a CC failure leaves the primary log alone');
    assert.equal(host.events()[0].metadata.primary, false);

    const noHeader = clone(MAILGUN.failedPermanent);
    noHeader.id = 'fallback-1';
    noHeader.reason = 'bounce';
    noHeader.recipient = 'a@x.test';
    delete noHeader.message;
    noHeader['user-variables'] = { magicmail_id: 'log2' };
    await sendMailgun(host, noHeader);
    assert.equal(host.log('log2').deliveryStatus, 'bounced');
  });
});

test('suppression failures never turn the webhook into an error', async () => {
  await withKey(async ({ encryptCredentials }) => {
    deliveryService.__test__.resetSeen();
    const host = createHost({
      logs: [sgLog()],
      settings: { suppressHardBounces: true },
      encryptCredentials,
    });
    host.monitor.suppressAddress = async () => {
      throw new Error('database down');
    };
    const result = await sendSendGrid(host, [sg('bounce')]);
    assert.equal(result.status, 200);
    assert.equal(host.log().deliveryStatus, 'bounced');
    assert.ok(host.strapi.warnings.some((line) => /suppression failed/i.test(line)));
    assert.doesNotMatch(host.strapi.warnings.join('\n'), /person@|database down/);
  });
});

test('official sendgrid-nodejs signature vector verifies (nowMs injected)', () => {
  // Copied byte for byte from sendgrid-nodejs packages/eventwebhook/src/eventwebhook.spec.js
  // at commit 498e2329e87d804d83f4a7b519d33fa09198d0ca.
  const PUBLIC_KEY =
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE83T4O/n84iotIvIW4mdBgQ/7dAfSmpqIM8kF9mN1flpVKS3GRqe62gw+2fNNRaINXvVpiglSI8eNEc6wEA3F+g==';
  const SIGNATURE =
    'MEUCIGHQVtGj+Y3LkG9fLcxf3qfI10QysgDWmMOVmxG0u6ZUAiEAyBiXDWzM+uOe5W0JuG+luQAbPIqHh89M15TluLtEZtM=';
  const TIMESTAMP = '1600112502';
  const PAYLOAD =
    JSON.stringify([
      {
        email: 'hello@world.com',
        event: 'dropped',
        reason: 'Bounced Address',
        sg_event_id: 'ZHJvcC0xMDk5NDkxOS1MUnpYbF9OSFN0T0doUTRrb2ZTbV9BLTA',
        sg_message_id: 'LRzXl_NHStOGhQ4kofSm_A.filterdrecv-p3mdw1-756b745b58-kmzbl-18-5F5FC76C-9.0',
        'smtp-id': '<LRzXl_NHStOGhQ4kofSm_A@ismtpd0039p1iad1.sendgrid.net>',
        timestamp: 1600112492,
      },
    ]) + '\r\n';
  const input = {
    publicKey: PUBLIC_KEY,
    rawBody: Buffer.from(PAYLOAD),
    signature: SIGNATURE,
    timestamp: TIMESTAMP,
    nowMs: 1600112502000,
  };
  assert.equal(verifySendGridSignature(input), true);
  assert.equal(verifySendGridSignature({ ...input, rawBody: Buffer.from(PAYLOAD.trim()) }), false);
  assert.equal(verifySendGridSignature({ ...input, timestamp: '1600112503' }), false);
  assert.equal(verifySendGridSignature({ ...input, nowMs: undefined }), false, 'stale today');
});

test('Mailgun HMAC known answer (securing-webhooks recipe)', () => {
  // Expected value computed independently with:
  // printf '%s' '1700000000abcdefghij0123456789abcdefghij0123456789' |
  //   openssl dgst -sha256 -hmac 'key-mailgun-known-answer'
  const input = {
    signingKey: 'key-mailgun-known-answer',
    timestamp: '1700000000',
    token: 'abcdefghij0123456789abcdefghij0123456789',
    signature: '1bfc90c1f86177a2c7f7aeeff9c8ee2e7b7e5a55a6cf01c296ce6ae323a5b792',
    nowMs: 1700000000000,
  };
  assert.equal(verifyMailgunSignature(input), true);
  assert.equal(verifyMailgunSignature({ ...input, signingKey: 'key-other' }), false);
  assert.equal(verifyMailgunSignature({ ...input, timestamp: '1700000001' }), false);
});
