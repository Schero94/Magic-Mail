'use strict';

// Behaviour tests for the SendGrid and Mailgun send paths: recipient
// de-duplication and display names, reserved headers, size and option
// limits, provider error handling, correlation id, provider tracking
// switches, Mailgun metadata, inline files and the SendGrid EU region.
// Synthetic data only; every provider call goes to a fake fetch.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PIXEL_PNG,
  accountFor,
  createHarness,
  fakeFetch,
  jsonResponse,
  withEncryptionKey,
} = require('./helpers/provider-send-harness');

const routerInternals = () => require('../server/src/services/email-router').__test__;

/**
 * Runs `fn` with an encryption key and a fake fetch, restoring both.
 *
 * @param {Function} [respond]
 * @param {(fetchCalls: object[]) => Promise<void>} fn
 */
async function withFetch(respond, fn) {
  const restoreKey = withEncryptionKey();
  const fake = fakeFetch(respond);
  try {
    await fn(fake.calls);
  } finally {
    fake.restore();
    restoreKey();
  }
}

const formValues = (call, name) => call.form.filter(([key]) => key === name).map(([, v]) => v);

// ── SG-1 / SG-9: recipients ────────────────────────────────────────────────

test('SG-1: every address is sent once across to, cc and bcc (first occurrence wins)', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('sendgrid')]);
    await router.send({
      to: ['dup@example.test', 'other@example.test', 'OTHER@example.test'],
      cc: ['DUP@example.test', 'carol@example.test'],
      bcc: 'carol@example.test, Dup@Example.test',
      subject: 'Dedupe',
      text: 'body',
    });
    const [personalization] = calls[0].json.personalizations;
    assert.deepEqual(personalization.to, [
      { email: 'dup@example.test' },
      { email: 'other@example.test' },
    ]);
    assert.deepEqual(personalization.cc, [{ email: 'carol@example.test' }]);
    assert.equal(personalization.bcc, undefined, 'an empty bcc list is left out');
  });
});

test('SG-1: a cc list that only repeats to-addresses is left out', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('sendgrid')]);
    await router.sendViaSendGrid(accountFor('sendgrid'), {
      to: 'a@example.test',
      cc: 'A@EXAMPLE.TEST',
      subject: 'x',
      text: 'y',
    });
    assert.equal(calls[0].json.personalizations[0].cc, undefined);
  });
});

test('SG-9: SendGrid recipients keep their display names', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('sendgrid')]);
    await router.send({
      to: 'Ada Lovelace <Ada@Example.test>',
      cc: ['"Bob, Ops" <bob@example.test>'],
      bcc: 'carol@example.test',
      subject: 'Names',
      text: 'body',
    });
    const [personalization] = calls[0].json.personalizations;
    // send() lower-cases addresses for every provider (unchanged 4.x behaviour).
    assert.deepEqual(personalization.to, [{ email: 'ada@example.test', name: 'Ada Lovelace' }]);
    assert.deepEqual(personalization.cc, [{ email: 'bob@example.test', name: 'Bob, Ops' }]);
    assert.deepEqual(personalization.bcc, [{ email: 'carol@example.test' }]);
  });
});

test('sendGridRecipients strips CR/LF from names and ignores groups', () => {
  const { sendGridRecipients } = routerInternals();
  const result = sendGridRecipients({
    to: [{ name: 'Eve\r\nBcc: x@example.test', address: 'eve@example.test' }],
    cc: 'Team: a@example.test;',
  });
  assert.deepEqual(result.to, [{ email: 'eve@example.test', name: 'EveBcc: x@example.test' }]);
  assert.deepEqual(result.cc, []);
});

// ── SG-3: reserved headers ────────────────────────────────────────────────

test('SG-3: X-SG-ID and X-SG-EID are never passed on, in any spelling', async () => {
  const { buildOutboundHeaders } = routerInternals();
  const headers = buildOutboundHeaders({
    type: 'transactional',
    headers: { 'X-SG-ID': 'a', 'x-sg-eid': 'b', 'X-Sg-Id': 'c', 'X-Custom': 'z' },
  });
  assert.equal(headers['X-Custom'], 'z');
  assert.deepEqual(
    Object.keys(headers).filter((name) => /^x-sg-/i.test(name)),
    []
  );
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('sendgrid')]);
    await router.send({
      to: 'a@example.test',
      subject: 's',
      text: 't',
      headers: { 'X-SG-ID': 'spoof' },
    });
    assert.ok(!Object.keys(calls[0].json.headers).some((name) => /^x-sg-/i.test(name)));
  });
});

// ── MG-SEND-2: header budget ──────────────────────────────────────────────

test('MG-SEND-2: caller headers are limited to 8 KB in total (service and Content API)', () => {
  const { filterCustomHeaders, MAX_CUSTOM_HEADER_BYTES } = routerInternals();
  assert.equal(MAX_CUSTOM_HEADER_BYTES, 8192);
  const big = {};
  for (let i = 0; i < 5; i += 1) big[`X-Big-${i}`] = 'v'.repeat(3000);
  const kept = filterCustomHeaders(big);
  const bytes = Object.entries(kept).reduce(
    (sum, [k, v]) => sum + Buffer.byteLength(k) + Buffer.byteLength(v),
    0
  );
  assert.equal(Object.keys(kept).length, 2);
  assert.ok(bytes <= 8192);

  // Content API: each value is at most 1000 characters; 9 of them exceed 8 KB.
  const { validate } = require('../server/src/validation');
  const headersOf = (count) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`X-H${i}`, 'v'.repeat(1000)]));
  assert.throws(
    () =>
      validate('content.send', {
        to: 'a@example.test',
        subject: 's',
        text: 't',
        headers: headersOf(9),
      }),
    (error) =>
      error.name === 'ValidationError' &&
      JSON.stringify(error.details).includes('at most 8 KB in total')
  );
  const ok = validate('content.send', {
    to: 'a@example.test',
    subject: 's',
    text: 't',
    headers: headersOf(8),
  });
  assert.equal(Object.keys(ok.headers).length, 8);
});

test('MG-SEND-2: Mailgun send options above 16 KB are refused before any request', async () => {
  const { mailgunOptionBytes } = routerInternals();
  const form = new FormData();
  form.append('to', 'x'.repeat(20000));
  form.append('h:X-A', 'abc');
  form.append('v:magicmail_priority', 'é');
  assert.equal(mailgunOptionBytes(form), 'h:X-A'.length + 3 + 'v:magicmail_priority'.length + 2);

  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('mailgun')]);
    // 10 addresses of 300+ characters each in h:Reply-To push the options over 16 KB.
    const replyTo = Array.from(
      { length: 10 },
      (_, i) => `${String(i).padStart(2, '0')}${'r'.repeat(250)}@${'d'.repeat(60)}.example.test`
    );
    const headers = { 'X-Pad-1': 'p'.repeat(3900), 'X-Pad-2': 'p'.repeat(3900) };
    await assert.rejects(
      router.sendViaMailgun(accountFor('mailgun'), {
        to: 'a@example.test',
        subject: 's',
        text: 't',
        replyTo,
        headers,
        unsubscribeUrl: `https://example.test/u?${'q'.repeat(6000)}`,
        type: 'marketing',
      }),
      (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE' && error.name === 'ValidationError'
    );
    assert.equal(calls.length, 0, 'no request was made');
  });
});

test('MG-SEND-2: options just under 16 KB still reach Mailgun', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('mailgun')]);
    await router.sendViaMailgun(accountFor('mailgun'), {
      to: 'a@example.test',
      subject: 's',
      text: 't',
      headers: { 'X-Pad-1': 'p'.repeat(3990), 'X-Pad-2': 'p'.repeat(3990) },
    });
    assert.equal(calls.length, 1);
  });
});

// ── SG-7 / MG-SEND-1: message size ────────────────────────────────────────

test('SG-7/MG-SEND-1: attachments over 40 MB in total are refused for every provider', () => {
  const { normalizeAttachments, MAX_TOTAL_ATTACHMENT_BYTES } = routerInternals();
  const chunk = Buffer.alloc(15 * 1024 * 1024, 1);
  assert.equal(normalizeAttachments([{ content: chunk }, { content: chunk }]).length, 2);
  assert.throws(
    () => normalizeAttachments([{ content: chunk }, { content: chunk }, { content: chunk }]),
    (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE' && error.name === 'ValidationError'
  );
  assert.equal(MAX_TOTAL_ATTACHMENT_BYTES, 40 * 1024 * 1024);
});

test('SG-7: a SendGrid body of 30 MB or more never reaches fetch', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('sendgrid')]);
    await assert.rejects(
      router.sendViaSendGrid(accountFor('sendgrid'), {
        to: 'a@example.test',
        subject: 's',
        text: 't',
        // 23 MB raw is about 30.7 MB as base64 JSON.
        attachments: [{ filename: 'big.bin', content: Buffer.alloc(23 * 1000 * 1000, 7) }],
      }),
      (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE'
    );
    assert.equal(calls.length, 0);
    await router.sendViaSendGrid(accountFor('sendgrid'), {
      to: 'a@example.test',
      subject: 's',
      text: 't',
      attachments: [{ filename: 'ok.bin', content: Buffer.alloc(20 * 1000 * 1000, 7) }],
    });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].bodyBytes < 30_000_000);
  });
});

test('MG-SEND-1: a Mailgun message estimated at 25 MB or more never reaches fetch', async () => {
  const { estimateMailgunMessageBytes } = routerInternals();
  const form = new FormData();
  form.append('text', 'abc');
  form.append('attachment', new Blob([Buffer.alloc(3000)]), 'a.bin');
  assert.equal(estimateMailgunMessageBytes(form), 4 + 3 + 4000 + Math.ceil(4000 / 76) * 2);

  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('mailgun')]);
    await assert.rejects(
      router.sendViaMailgun(accountFor('mailgun'), {
        to: 'a@example.test',
        subject: 's',
        text: 't',
        attachments: [{ filename: 'big.bin', content: Buffer.alloc(19 * 1000 * 1000, 7) }],
      }),
      (error) => error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE'
    );
    assert.equal(calls.length, 0);
  });
});

test('SG-7/MG-SEND-1: HTTP 413 maps to MAGIC_MAIL_MESSAGE_TOO_LARGE for both providers', async () => {
  for (const provider of ['sendgrid', 'mailgun']) {
    await withFetch(
      () => jsonResponse(413, { errors: [{ message: 'content too large', field: null }] }),
      async () => {
        const { router } = createHarness([accountFor(provider)]);
        const send = provider === 'sendgrid' ? router.sendViaSendGrid : router.sendViaMailgun;
        await assert.rejects(
          send.call(router, accountFor(provider), {
            to: 'a@example.test',
            subject: 's',
            text: 't',
          }),
          (error) =>
            error.status === 413 &&
            error.code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE' &&
            error.message ===
              `${provider === 'sendgrid' ? 'SendGrid' : 'Mailgun'} API request failed: 413`
        );
      }
    );
  }
});

// ── SG-5: provider errors ─────────────────────────────────────────────────

test('SG-5: SendGrid errors keep status, provider and allowlisted fields, never the text', async () => {
  const body = {
    errors: [
      { message: 'Invalid address dup@example.test', field: 'personalizations.0.cc.0.email' },
      { message: 'x', field: 'personalizations[1].to' },
      { message: 'x', field: 'evil <script>' },
      { message: 'x', field: 'content.type' },
      { message: 'x', field: null },
    ],
  };
  await withFetch(
    () => jsonResponse(400, body),
    async () => {
      const { router, logs } = createHarness([accountFor('sendgrid')]);
      const error = await router
        .sendViaSendGrid(accountFor('sendgrid'), { to: 'a@example.test', subject: 's', text: 't' })
        .catch((e) => e);
      assert.equal(error.message, 'SendGrid API request failed: 400');
      assert.equal(error.status, 400);
      assert.equal(error.provider, 'sendgrid');
      assert.deepEqual(error.providerFields, [
        'personalizations.0.cc.0.email',
        'personalizations.1.to',
        'content.type',
      ]);
      const serialized = JSON.stringify({ ...error, message: error.message, logs });
      assert.ok(!serialized.includes('dup@example.test'), 'no provider text anywhere');
      assert.ok(logs.some((line) => line.includes('SendGrid API request failed: 400 (region us)')));
    }
  );
});

test('SG-5: a 403 "Verified Sender Identity" is recognised without keeping the text', () => {
  const { sendGridErrorDetails } = routerInternals();
  const text = JSON.stringify({
    errors: [
      {
        message:
          'The from address does not match a verified Sender Identity. Mail cannot be sent until this error is resolved.',
        field: 'from',
      },
    ],
  });
  assert.deepEqual(sendGridErrorDetails(text, 403), {
    providerFields: ['from'],
    providerReason: 'sender_identity',
  });
  assert.equal(sendGridErrorDetails(text, 400).providerReason, null);
  assert.deepEqual(sendGridErrorDetails('not json', 400), {
    providerFields: [],
    providerReason: null,
  });
});

test('SG-5: the error body is read at most 4 KB and within the timeout', async () => {
  const { readProviderErrorBody } = routerInternals();
  let pulled = 0;
  const endless = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(1024).fill(65));
    },
  });
  const text = await readProviderErrorBody(new Response(endless, { status: 400 }));
  assert.equal(text.length, 4096);
  assert.ok(pulled < 10, 'stopped reading after the limit');

  const stalled = new ReadableStream({ pull: () => new Promise(() => {}) });
  const started = Date.now();
  assert.equal(await readProviderErrorBody(new Response(stalled, { status: 400 })), null);
  assert.ok(Date.now() - started < 3000);
  assert.equal(await readProviderErrorBody({}), null, 'a fake without a body');
  assert.equal(
    await readProviderErrorBody({
      text: async () => {
        throw new Error('boom');
      },
    }),
    null
  );
});

test('SG-5: 429 X-RateLimit-Reset is used only as an integer within 24 h', async () => {
  const { rateLimitResetMs } = routerInternals();
  const now = 1_800_000_000_000;
  const at = (value) => ({
    headers: new Headers(value === null ? {} : { 'x-ratelimit-reset': value }),
  });
  assert.equal(rateLimitResetMs(at(String(now / 1000 + 120)), now), 120_000);
  assert.equal(rateLimitResetMs(at(String(now / 1000 - 5)), now), 0, 'in the past');
  assert.equal(rateLimitResetMs(at(String(now / 1000 + 90_000)), now), 0, 'more than 24 h');
  assert.equal(rateLimitResetMs(at('12.5'), now), 0);
  assert.equal(rateLimitResetMs(at('soon'), now), 0);
  assert.equal(rateLimitResetMs(at(null), now), 0);

  const reset = String(Math.floor(Date.now() / 1000) + 600);
  await withFetch(
    () => jsonResponse(429, { errors: [{ message: 'too many' }] }, { 'x-ratelimit-reset': reset }),
    async () => {
      const { router } = createHarness([accountFor('sendgrid')]);
      const error = await router
        .sendViaSendGrid(accountFor('sendgrid'), { to: 'a@example.test', subject: 's', text: 't' })
        .catch((e) => e);
      assert.equal(error.status, 429);
      assert.ok(error.retryAfterMs > 590_000 && error.retryAfterMs <= 600_000);
      const {
        classifyDeliveryError,
        retryLowerBoundMs,
      } = require('../server/src/utils/delivery-outcome');
      assert.equal(classifyDeliveryError(error), 'transient');
      assert.equal(retryLowerBoundMs(error), error.retryAfterMs);
    }
  );
  const { retryLowerBoundMs } = require('../server/src/utils/delivery-outcome');
  assert.equal(retryLowerBoundMs({ retryAfterMs: 25 * 3600_000 }), 0);
  assert.equal(retryLowerBoundMs({ retryAfterMs: -1 }), 0);
  assert.equal(retryLowerBoundMs(null), 0);
});

test('SG-5: a Mailgun 401 (plain "Forbidden") is tagged and stays transient', async () => {
  await withFetch(
    () => jsonResponse(401, 'Forbidden'),
    async () => {
      const { router, logs } = createHarness([accountFor('mailgun', { region: 'eu' })]);
      const error = await router
        .sendViaMailgun(accountFor('mailgun', { region: 'eu' }), {
          to: 'a@example.test',
          subject: 's',
          text: 't',
        })
        .catch((e) => e);
      assert.equal(error.message, 'Mailgun API request failed: 401');
      assert.equal(error.provider, 'mailgun');
      assert.equal(error.providerFields, undefined);
      assert.ok(logs.some((line) => line.includes('(region eu)')));
      const { classifyDeliveryError } = require('../server/src/utils/delivery-outcome');
      assert.equal(classifyDeliveryError(error), 'transient');
    }
  );
});

test('MG-SEND-5: Mailgun statuses classify as documented (400 permanent, 429 transient, 500 ambiguous)', async () => {
  const { classifyDeliveryError } = require('../server/src/utils/delivery-outcome');
  const expected = { 400: 'permanent', 401: 'transient', 429: 'transient', 500: 'ambiguous' };
  for (const [status, errorClass] of Object.entries(expected)) {
    await withFetch(
      () => jsonResponse(Number(status), { message: 'x' }),
      async () => {
        const { router } = createHarness([accountFor('mailgun')]);
        const error = await router
          .sendViaMailgun(accountFor('mailgun'), { to: 'a@example.test', subject: 's', text: 't' })
          .catch((e) => e);
        assert.equal(error.status, Number(status));
        assert.equal(classifyDeliveryError(error), errorClass, `status ${status}`);
      }
    );
  }
});

// ── SG-8: correlation id ──────────────────────────────────────────────────

test('SG-8: the delivery-log documentId is sent as magicmail_id to both providers', async () => {
  for (const provider of ['sendgrid', 'mailgun']) {
    await withFetch(undefined, async (calls) => {
      const { router } = createHarness([accountFor(provider)], { logDocumentId: 'abc123XYZ' });
      await router.send({ to: 'a@example.test', subject: 's', text: 't' });
      if (provider === 'sendgrid') {
        assert.equal(calls[0].json.custom_args.magicmail_id, 'abc123XYZ');
        assert.ok(Object.values(calls[0].json.custom_args).every((v) => typeof v === 'string'));
      } else {
        assert.deepEqual(formValues(calls[0], 'v:magicmail_id'), ['abc123XYZ']);
      }
    });
  }
});

test('SG-8: an unusable or missing log id is never sent', async () => {
  for (const logDocumentId of [null, 'not valid!', 'x'.repeat(65)]) {
    await withFetch(undefined, async (calls) => {
      const { router } = createHarness([accountFor('sendgrid'), accountFor('mailgun')], {
        logDocumentId,
      });
      await router.send({ to: 'a@example.test', subject: 's', text: 't' });
      await router.sendViaMailgun(accountFor('mailgun'), {
        to: 'a@example.test',
        subject: 's',
        text: 't',
        __logDocumentId: logDocumentId,
      });
      assert.equal(calls[0].json.custom_args.magicmail_id, undefined);
      assert.deepEqual(formValues(calls[1], 'v:magicmail_id'), []);
    });
  }
});

// ── MG-SEND-3: provider tracking ──────────────────────────────────────────

test('MG-SEND-3: provider tracking is switched off exactly for what Magic Mail applied', async () => {
  const cases = [
    { tracking: 'all', opens: true, clicks: true },
    { tracking: 'opens', opens: true, clicks: false },
    { tracking: 'none', opens: false, clicks: false },
  ];
  for (const { tracking, opens, clicks } of cases) {
    await withFetch(undefined, async (calls) => {
      const message = {
        to: 'a@example.test',
        subject: 's',
        html: '<a href="https://shop.example.test/x">Shop</a>',
      };
      await createHarness([accountFor('sendgrid')], { tracking }).router.send(message);
      await createHarness([accountFor('mailgun')], { tracking }).router.send(message);
      const sg = calls[0].json.tracking_settings;
      if (!opens && !clicks) assert.equal(sg, undefined, `${tracking}: SendGrid untouched`);
      else {
        assert.deepEqual(sg.open_tracking, opens ? { enable: false } : undefined);
        assert.deepEqual(sg.click_tracking, clicks ? { enable: false } : undefined);
      }
      assert.deepEqual(formValues(calls[1], 'o:tracking-opens'), opens ? ['no'] : []);
      assert.deepEqual(formValues(calls[1], 'o:tracking-clicks'), clicks ? ['no'] : []);
    });
  }
});

test('MG-SEND-3: enableTracking false leaves the provider tracking alone', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('sendgrid')]);
    await router.send({
      to: 'a@example.test',
      subject: 's',
      html: '<a href="https://shop.example.test/x">Shop</a>',
      enableTracking: false,
    });
    assert.equal(calls[0].json.tracking_settings, undefined);
  });
});

test('MG-SEND-3: analytics.addTracking reports only parts that changed the HTML', async () => {
  delete require.cache[require.resolve('../server/src/services/analytics')];
  const analytics = require('../server/src/services/analytics')({
    strapi: {
      log: { debug() {}, info() {}, warn() {}, error() {} },
      config: { get: (key, fallback) => fallback },
      plugin: () => ({ service: () => ({ getSettings: async () => ({}) }) }),
    },
  });
  // No eligible link: the rewriter returns the HTML unchanged.
  analytics.rewriteLinksForTracking = async (html) => html;
  const tracked = { opens: false, clicks: false };
  const html = await analytics.addTracking('<p>x</p>', 'e1', 'h1', {
    settings: { trackingBaseUrl: 'https://cms.example.test' },
    applied: tracked,
  });
  assert.notEqual(html, '<p>x</p>');
  assert.deepEqual(tracked, { opens: true, clicks: false });

  // A rewritten link counts as clicks.
  analytics.rewriteLinksForTracking = async (value) => value.replace('x', 'y');
  const both = { opens: false, clicks: false };
  await analytics.addTracking('<p>x</p>', 'e1', 'h1', {
    settings: { trackingBaseUrl: 'https://cms.example.test' },
    applied: both,
  });
  assert.deepEqual(both, { opens: true, clicks: true });

  // No public tracking URL: the mail goes out untracked and nothing is reported.
  const none = { opens: false, clicks: false };
  assert.equal(
    await analytics.addTracking('<p>x</p>', 'e1', 'h1', { settings: {}, applied: none }),
    '<p>x</p>'
  );
  assert.deepEqual(none, { opens: false, clicks: false });
});

// ── MG-SEND-4: Mailgun metadata ───────────────────────────────────────────

test('MG-SEND-4: Mailgun gets allowlisted v: metadata and one ASCII o:tag', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('mailgun')]);
    await router.send({
      to: 'a@example.test',
      subject: 's',
      text: 't',
      type: 'marketing',
      priority: 'high',
      unsubscribeUrl: 'https://example.test/u',
    });
    await router.sendViaMailgun(accountFor('mailgun'), {
      to: 'a@example.test',
      subject: 's',
      text: 't',
      type: 'evil type <x>',
      priority: 'urgent',
    });
    assert.deepEqual(formValues(calls[0], 'v:magicmail_email_type'), ['marketing']);
    assert.deepEqual(formValues(calls[0], 'v:magicmail_priority'), ['high']);
    assert.deepEqual(formValues(calls[0], 'o:tag'), ['marketing']);
    assert.deepEqual(formValues(calls[1], 'v:magicmail_email_type'), ['transactional']);
    assert.deepEqual(formValues(calls[1], 'v:magicmail_priority'), ['normal']);
    assert.deepEqual(formValues(calls[1], 'o:tag'), ['transactional']);
    const { mailgunTag } = routerInternals();
    assert.equal(mailgunTag('a b/c.d-e_f'), 'abc.d-e_f');
    assert.equal(mailgunTag('x'.repeat(200)).length, 128);
    assert.equal(mailgunTag(42), '');
  });
});

// ── MG-SEND-5: Mailgun inline, Reply-To, id ───────────────────────────────

test('MG-SEND-5: inline cid file, h:Reply-To and id without angle brackets', async () => {
  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([accountFor('mailgun')]);
    const result = await router.sendViaMailgun(accountFor('mailgun'), {
      to: 'a@example.test',
      subject: 's',
      html: '<img src="cid:logo.png">',
      replyTo: ['Support <support@example.test>', 'ops@example.test'],
      attachments: [
        { cid: 'logo.png', content: PIXEL_PNG, encoding: 'base64', contentType: 'image/png' },
        { filename: 'a.txt', content: 'hi', contentType: 'text/plain' },
      ],
    });
    assert.equal(result.messageId, '20261118.abc@mg.example.test');
    assert.deepEqual(calls[0].files, [
      { field: 'inline', filename: 'logo.png', type: 'image/png', size: 68 },
      { field: 'attachment', filename: 'a.txt', type: 'text/plain', size: 2 },
    ]);
    assert.deepEqual(formValues(calls[0], 'h:Reply-To'), [
      '"Support" <support@example.test>, ops@example.test',
    ]);
  });
});

// ── SG-2: SendGrid region ─────────────────────────────────────────────────

test('SG-2: region eu uses api.eu.sendgrid.com; legacy accounts keep the global host', async () => {
  const {
    resolveSendGridRegion,
    sendGridApiBaseUrl,
    SENDGRID_REGIONS,
  } = require('../server/src/utils/sendgrid-region');
  assert.deepEqual([...SENDGRID_REGIONS], ['us', 'eu']);
  assert.equal(resolveSendGridRegion(undefined), 'us');
  assert.equal(resolveSendGridRegion(''), 'us');
  assert.equal(resolveSendGridRegion('eu'), 'eu');
  assert.equal(resolveSendGridRegion('EU'), null);
  assert.equal(resolveSendGridRegion('global'), null);
  assert.equal(sendGridApiBaseUrl('eu'), 'https://api.eu.sendgrid.com');

  await withFetch(undefined, async (calls) => {
    const { router } = createHarness([]);
    const message = { to: 'a@example.test', subject: 's', text: 't' };
    await router.sendViaSendGrid(accountFor('sendgrid', { region: 'eu' }), { ...message });
    await router.sendViaSendGrid(accountFor('sendgrid'), { ...message });
    await router.sendViaSendGrid(accountFor('sendgrid', { region: 'us' }), { ...message });
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        'https://api.eu.sendgrid.com/v3/mail/send',
        'https://api.sendgrid.com/v3/mail/send',
        'https://api.sendgrid.com/v3/mail/send',
      ]
    );
    await assert.rejects(
      router.sendViaSendGrid(accountFor('sendgrid', { region: 'mars' }), { ...message }),
      (error) => error.code === 'MAGIC_MAIL_ACCOUNT_CONFIG'
    );
    assert.equal(calls.length, 3, 'an unknown region never sends');
  });
});

test('SG-2: account create and update reject an unknown SendGrid region', async () => {
  const restoreKey = withEncryptionKey();
  try {
    const created = [];
    const updated = [];
    const existing = {
      documentId: 'sg1',
      provider: 'sendgrid',
      name: 'sg',
      config: accountFor('sendgrid').config,
    };
    const strapi = {
      log: { debug() {}, info() {}, warn() {}, error() {} },
      documents: () => ({
        create: async ({ data }) => {
          created.push(data);
          return { documentId: 'new1', ...data };
        },
        update: async ({ data }) => {
          updated.push(data);
          return { ...existing, ...data };
        },
        findOne: async () => existing,
        findFirst: async () => existing,
        findMany: async () => [existing],
        count: async () => 1,
      }),
      db: { query: () => ({ findOne: async () => ({ id: 1, documentId: 'sg1' }) }) },
      plugin: () => ({ service: () => ({}) }),
    };
    delete require.cache[require.resolve('../server/src/services/account-manager')];
    const manager = require('../server/src/services/account-manager')({ strapi });
    for (const region of ['mars', 'EU', 7]) {
      await assert.rejects(
        manager.createAccount({
          name: 'sg2',
          provider: 'sendgrid',
          config: { apiKey: 'SG.x', region },
          fromEmail: 'a@example.test',
        }),
        (error) => error.name === 'ValidationError' && /SendGrid region/.test(error.message)
      );
      await assert.rejects(
        manager.updateAccount('sg1', { config: { apiKey: 'SG.x', region } }),
        (error) => error.name === 'ValidationError' && /SendGrid region/.test(error.message)
      );
    }
    assert.equal(created.length + updated.length, 0, 'nothing was written');
  } finally {
    restoreKey();
  }
});

// ── SendGrid 200 without X-Message-Id (sandbox) ───────────────────────────

test('SendGrid 200 without X-Message-Id (sandbox mode) is a success with a null id', async () => {
  await withFetch(
    () => jsonResponse(200),
    async () => {
      const { router } = createHarness([accountFor('sendgrid')]);
      const result = await router.sendViaSendGrid(accountFor('sendgrid'), {
        to: 'a@example.test',
        subject: 's',
        text: 't',
      });
      assert.deepEqual(result, { messageId: null, response: 'Accepted' });
      const sent = await router.send({ to: 'a@example.test', subject: 's', text: 't' });
      assert.equal(sent.success, true);
    }
  );
});

// ── Queue: correlation id, tracking flags and rate-limit lower bound ──────

const hasSqlite = (() => {
  try {
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

test(
  'queue worker passes the log id and tracking flags; a 429 reset delays the retry',
  { skip: !hasSqlite },
  async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const fixtures = require('./helpers/queue-fixtures');
    const store = require('../server/src/utils/outbox-store');
    const restoreKey = withEncryptionKey();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-send-paths-'));
    const knex = require('knex')({
      client: 'better-sqlite3',
      connection: { filename: path.join(dir, 'queue.db') },
      useNullAsDefault: true,
    });
    try {
      await fixtures.createOutboxTable(knex);
      await fixtures.createCoreStore(knex);
      const accounts = [fixtures.smtpAccount('primary', 1, { isPrimary: true })];
      await fixtures.createAccountTable(knex, accounts);
      const { strapi } = fixtures.makeQueueStrapi(knex, 'sqlite', {
        accounts,
        queueConfig: {
          worker: false,
          batchSize: 10,
          concurrency: 10,
          leaseMs: 60_000,
          backoffMs: [60_000, 300_000],
          jitterRatio: 0,
          maxDispatchPerMinute: 100_000,
        },
      });
      const queue = strapi.plugin('magic-mail').service('queue');
      const now = Date.now();
      queue.setTestHooks({ clock: () => now, random: () => 0.5 });
      const router = strapi.plugin('magic-mail').service('email-router');
      const seen = [];
      router.routeAndDispatch = async (data) => {
        seen.push({ logId: data.__logDocumentId, tracking: data.__trackingApplied });
        throw Object.assign(new Error('SendGrid API request failed: 429'), {
          status: 429,
          provider: 'sendgrid',
          retryAfterMs: 900_000,
        });
      };
      const { outboxId } = await queue.enqueue(
        {
          ...fixtures.preparedMessage('rl', 1),
          __trackingApplied: { opens: true, clicks: false },
        },
        { emailLog: { documentId: 'logq1', emailId: 'emailq1' }, source: 'service' }
      );
      await queue.runOnce();
      assert.deepEqual(seen, [{ logId: 'logq1', tracking: { opens: true, clicks: false } }]);
      const row = await store.findByDocumentId(strapi, outboxId);
      assert.equal(row.status, 'pending');
      assert.equal(row.lastErrorClass, 'transient');
      assert.equal(
        row.nextAttemptAt - now,
        900_000,
        'the 15 min reset wins over the 1 min backoff'
      );
    } finally {
      await knex.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
      restoreKey();
    }
  }
);

test('SG-5: the error-field allowlist runs in linear time on adversarial input', () => {
  const { sendGridErrorDetails } = routerInternals();
  const adversarial = [
    'personalizations.' + '1.'.repeat(25_000),
    'mail_settings' + '.a'.repeat(25_000),
    'x'.repeat(50_000),
  ];
  const started = process.hrtime.bigint();
  const result = sendGridErrorDetails(
    JSON.stringify({ errors: adversarial.map((field) => ({ field, message: 'm' })) }),
    400
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.deepEqual(result.providerFields, []);
  assert.ok(elapsedMs < 200, `took ${elapsedMs} ms`);
});

test('SG-8: the sent magicmail_id is what the webhook parsers read back', async () => {
  const { parseSendGridEvents, parseMailgunEvent } =
    require('../server/src/services/delivery-webhooks').__test__;
  await withFetch(undefined, async (calls) => {
    await createHarness([accountFor('sendgrid')], { logDocumentId: 'logdocABC1' }).router.send({
      to: 'a@example.test',
      subject: 's',
      text: 't',
    });
    await createHarness([accountFor('mailgun')], { logDocumentId: 'logdocABC2' }).router.send({
      to: 'a@example.test',
      subject: 's',
      text: 't',
    });
    // SendGrid adds custom_args as top-level event keys (Event Webhook reference).
    const [sgEvent] = parseSendGridEvents([
      { event: 'bounce', type: 'bounce', email: 'a@example.test', ...calls[0].json.custom_args },
    ]);
    assert.equal(sgEvent.magicmailId, 'logdocABC1');
    // Mailgun reports v: variables as event-data `user-variables`.
    const variables = Object.fromEntries(
      calls[1].form.filter(([k]) => k.startsWith('v:')).map(([k, v]) => [k.slice(2), v])
    );
    const [mgEvent] = parseMailgunEvent({
      event: 'failed',
      severity: 'permanent',
      recipient: 'a@example.test',
      'user-variables': variables,
    });
    assert.equal(mgEvent.magicmailId, 'logdocABC2');
  });
});
