'use strict';

/**
 * Send queue: delivery outcome classifier, SMTP stage probe, backoff and
 * payload encryption. Synthetic data only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const nodemailer = require('nodemailer');

process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'synthetic-encryption-key-0123456789abcdef0123';

const {
  classifyDeliveryError,
  combineOutcome,
  sanitizeErrorCode,
  backoffDelay,
  createSmtpProbe,
  tagSmtpStage,
  tagPreDispatch,
  PROVIDER_CAPABILITIES,
} = require('../server/src/utils/delivery-outcome');
const { encryptPayload, decryptPayload } = require('../server/src/utils/encryption');

const err = (fields) => Object.assign(new Error('synthetic'), fields);

test('classifier: every rule of the design table', () => {
  const cases = [
    [err({ code: 'MAGIC_MAIL_VALIDATION' }), 'permanent'],
    [err({ code: 'PAYLOAD_UNREADABLE' }), 'permanent'],
    [err({ responseCode: 550, permanent: true }), 'permanent'],
    [err({ responseCode: 554 }), 'permanent'],
    [err({ responseCode: 421 }), 'transient'],
    [err({ responseCode: 451 }), 'transient'],
    [err({ responseCode: 503 }), 'transient'],
    [err({ code: 'EAUTH', responseCode: 535 }), 'permanent'],
    [err({ code: 'EAUTH' }), 'transient'],
    [err({ code: 'ETLS' }), 'transient'],
    [err({ code: 'EDNS' }), 'transient'],
    [err({ code: 'MAGIC_MAIL_ACCOUNT_CONFIG' }), 'transient'],
    [err({ code: 'MAGIC_MAIL_ACCOUNT_UNAVAILABLE' }), 'transient'],
    [err({ code: 'ECONNECTION', originalCode: 'ECONNREFUSED' }), 'transient'],
    [err({ code: 'MAGIC_MAIL_NO_ACCOUNT' }), 'capacity'],
    [err({ code: 'MAGIC_MAIL_QUOTA_EXHAUSTED' }), 'capacity'],
    [err({ status: 401 }), 'transient'],
    [err({ status: 403 }), 'transient'],
    [err({ status: 429 }), 'transient'],
    [err({ status: 400 }), 'permanent'],
    [err({ status: 404 }), 'permanent'],
    [err({ status: 413 }), 'permanent'],
    [err({ status: 422 }), 'permanent'],
    [err({ status: 500 }), 'ambiguous'],
    [err({ status: 502 }), 'ambiguous'],
    [err({ status: 503 }), 'transient'],
    [err({ status: 504 }), 'ambiguous'],
    [
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      'transient',
    ],
    [
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }),
      'transient',
    ],
    [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }), 'ambiguous'],
    [
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } }),
      'ambiguous',
    ],
    [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'ambiguous'],
    [err({}), 'ambiguous'],
    [null, 'ambiguous'],
  ];
  for (const [error, expected] of cases) {
    assert.equal(classifyDeliveryError(error), expected, JSON.stringify(error));
  }
});

test('classifier: SMTP socket errors depend on the probe stage', () => {
  for (const code of ['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNRESET']) {
    assert.equal(classifyDeliveryError(err({ code })), 'ambiguous', `${code} without probe`);
    assert.equal(
      classifyDeliveryError(tagSmtpStage(err({ code }), { dataAccepted: false })),
      'transient',
      `${code} before 354`
    );
    assert.equal(
      classifyDeliveryError(tagSmtpStage(err({ code }), { dataAccepted: true })),
      'ambiguous',
      `${code} after 354`
    );
  }
  assert.equal(classifyDeliveryError(tagPreDispatch(err({ status: 500 }))), 'transient');
});

test('classifier: routing errors need connect-phase proof (no re-send after 354)', () => {
  const fetchFailed = (cause) => Object.assign(new TypeError('fetch failed'), { cause });
  const cases = [
    // nodemailer _onError(err, 'ESOCKET') keeps the system code in originalCode.
    [
      tagSmtpStage(err({ code: 'ESOCKET', originalCode: 'EHOSTUNREACH' }), { dataAccepted: true }),
      'ambiguous',
    ],
    [
      tagSmtpStage(err({ code: 'ESOCKET', originalCode: 'ENETUNREACH' }), { dataAccepted: true }),
      'ambiguous',
    ],
    [
      tagSmtpStage(err({ code: 'ESOCKET', originalCode: 'ECONNREFUSED' }), { dataAccepted: true }),
      'ambiguous',
    ],
    [
      tagSmtpStage(err({ code: 'ESOCKET', originalCode: 'EHOSTUNREACH' }), {
        dataAccepted: false,
      }),
      'transient',
    ],
    [err({ code: 'ESOCKET', originalCode: 'EHOSTUNREACH' }), 'ambiguous'],
    [err({ code: 'ESOCKET', originalCode: 'EHOSTUNREACH', syscall: 'connect' }), 'transient'],
    // fetch causes
    [fetchFailed({ code: 'EHOSTUNREACH' }), 'ambiguous'],
    [fetchFailed({ code: 'ENETUNREACH', syscall: 'read' }), 'ambiguous'],
    [fetchFailed({ code: 'ENETUNREACH', syscall: 'connect' }), 'transient'],
    [fetchFailed({ code: 'ENOTFOUND', syscall: 'getaddrinfo' }), 'transient'],
    [fetchFailed({ code: 'EAI_AGAIN' }), 'transient'],
    [
      fetchFailed(
        Object.assign(new AggregateError([], 'x'), {
          code: 'EHOSTUNREACH',
          errors: [
            { code: 'EHOSTUNREACH', syscall: 'connect' },
            { code: 'EHOSTUNREACH', syscall: 'connect' },
          ],
        })
      ),
      'transient',
    ],
    // top-level system errors
    [err({ code: 'EHOSTUNREACH' }), 'ambiguous'],
    [err({ code: 'EHOSTUNREACH', syscall: 'connect' }), 'transient'],
    [err({ code: 'ECONNREFUSED' }), 'transient'],
  ];
  for (const [error, expected] of cases) {
    assert.equal(classifyDeliveryError(error), expected, JSON.stringify(error));
  }
});

test('classifier: a real refused connect (fetch and nodemailer) is transient', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));

  const fetchError = await fetch(`http://127.0.0.1:${port}/`).then(
    () => null,
    (error) => error
  );
  assert.ok(fetchError);
  assert.equal(classifyDeliveryError(fetchError), 'transient');

  const transport = nodemailer.createTransport({ host: '127.0.0.1', port, secure: false });
  const smtpError = await transport
    .sendMail({ from: 'a@example.test', to: 'b@example.test', subject: 's', text: 't' })
    .then(
      () => null,
      (error) => error
    );
  assert.ok(smtpError);
  assert.equal(classifyDeliveryError(smtpError), 'transient', smtpError.code);
});

test('combineOutcome: one ambiguous attempt makes the chain ambiguous', () => {
  assert.equal(combineOutcome([], err({ responseCode: 451 })), 'transient');
  assert.equal(combineOutcome(['transient'], err({ responseCode: 451 })), 'transient');
  assert.equal(combineOutcome(['ambiguous'], err({ responseCode: 451 })), 'ambiguous');
  assert.equal(combineOutcome(['ambiguous'], err({ responseCode: 550 })), 'ambiguous');
});

test('sanitizeErrorCode never returns message text', () => {
  assert.equal(sanitizeErrorCode(err({ status: 503 })), 'HTTP_503');
  assert.equal(sanitizeErrorCode(err({ responseCode: 451, code: 'EENVELOPE' })), 'SMTP_451');
  assert.equal(sanitizeErrorCode(err({ code: 'ECONNECTION' })), 'ECONNECTION');
  assert.equal(sanitizeErrorCode(err({ code: 'bad code with user@example.test' })), 'UNKNOWN');
  assert.equal(sanitizeErrorCode({ cause: { code: 'ECONNRESET' } }), 'ECONNRESET');
  assert.equal(
    sanitizeErrorCode(Object.assign(new Error('x'), { name: 'TimeoutError' })),
    'TIMEOUT'
  );
});

test('backoff: 1m/5m/15m with +/-20% jitter, capped at the last step', () => {
  const steps = [60_000, 300_000, 900_000];
  assert.equal(
    backoffDelay(1, steps, 0.2, () => 0.5),
    60_000
  );
  assert.equal(
    backoffDelay(2, steps, 0.2, () => 0.5),
    300_000
  );
  assert.equal(
    backoffDelay(3, steps, 0.2, () => 0.5),
    900_000
  );
  assert.equal(
    backoffDelay(9, steps, 0.2, () => 0.5),
    900_000
  );
  assert.equal(
    backoffDelay(1, steps, 0.2, () => 0),
    48_000
  );
  assert.equal(
    backoffDelay(1, steps, 0.2, () => 1),
    72_000
  );
  for (let i = 0; i < 200; i += 1) {
    const value = backoffDelay(2, steps, 0.2);
    assert.ok(value >= 240_000 && value <= 360_000);
  }
});

test('no current provider supports idempotency keys', () => {
  for (const capability of Object.values(PROVIDER_CAPABILITIES)) {
    assert.equal(capability.idempotencyKey, false);
  }
});

test('payload encryption: round trip, AAD binding, tamper detection, key rotation', () => {
  const payload = { to: 'user@example.test', subject: 'Synthetic', html: '<p>x</p>' };
  const sealed = encryptPayload(payload, 'row-a');
  assert.match(sealed, /^o1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.ok(!sealed.includes('example.test'));
  assert.deepEqual(decryptPayload(sealed, 'row-a'), payload);
  assert.throws(() => decryptPayload(sealed, 'row-b'), /could not be decrypted/);
  const parts = sealed.split(':');
  const tampered = Buffer.from(parts[3], 'base64');
  tampered[0] ^= 1;
  assert.throws(
    () => decryptPayload([...parts.slice(0, 3), tampered.toString('base64')].join(':'), 'row-a'),
    /could not be decrypted/
  );
  assert.throws(() => decryptPayload('v1:aa:bb:cc', 'row-a'), /malformed/);

  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  try {
    process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'synthetic-rotated-key-abcdef0123456789abcdef';
    process.env.MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS = previous;
    assert.deepEqual(decryptPayload(sealed, 'row-a'), payload);
    delete process.env.MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS;
    assert.throws(() => decryptPayload(sealed, 'row-a'));
  } finally {
    process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
    delete process.env.MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS;
  }
});

/**
 * Minimal scripted SMTP server: accepts EHLO/MAIL/RCPT, answers DATA with
 * 354 and then either drops the socket before 354 or after the final dot.
 */
function startSmtp(mode, pipelining = false) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.write('220 fake ESMTP\r\n');
      let inData = false;
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (inData) {
            if (line === '.') {
              if (mode === 'drop-after-dot') socket.destroy();
              else socket.write('250 queued\r\n');
              inData = false;
            }
            continue;
          }
          const verb = line.slice(0, 4).toUpperCase();
          if (verb === 'EHLO') {
            socket.write(`250-fake\r\n${pipelining ? '250-PIPELINING\r\n' : ''}250 8BITMIME\r\n`);
          } else if (verb === 'MAIL' || verb === 'RCPT') socket.write('250 ok\r\n');
          else if (verb === 'DATA') {
            if (mode === 'drop-before-354') {
              socket.destroy();
              return;
            }
            inData = true;
            socket.write('354 go ahead\r\n');
          } else if (verb === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('250 ok\r\n');
        }
      });
      socket.on('error', () => {});
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('SMTP probe against a scripted server: before vs. after DATA', async () => {
  for (const [mode, expectedStage, expectedClass, pipelining] of [
    ['drop-before-354', 'before-data', 'transient', false],
    ['drop-after-dot', 'after-data', 'ambiguous', false],
    ['drop-before-354', 'before-data', 'transient', true],
    ['drop-after-dot', 'after-data', 'ambiguous', true],
  ]) {
    const server = await startSmtp(mode, pipelining);
    const { probe, logger } = createSmtpProbe();
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: server.address().port,
      secure: false,
      ignoreTLS: true,
      logger,
      transactionLog: true,
      socketTimeout: 5_000,
    });
    try {
      await assert.rejects(
        transport
          .sendMail({
            from: 'sender@example.test',
            to: 'user@example.test',
            subject: 'Synthetic',
            text: 'x',
          })
          .catch((error) => {
            throw tagSmtpStage(error, probe);
          }),
        (error) => {
          assert.equal(error.magicMailSmtpStage, expectedStage, mode);
          assert.equal(classifyDeliveryError(error), expectedClass, mode);
          // The probe keeps booleans only.
          assert.deepEqual(Object.keys(probe).sort(), ['dataAccepted', 'finalReply']);
          return true;
        }
      );
    } finally {
      transport.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
