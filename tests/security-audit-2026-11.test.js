'use strict';

/**
 * Regression tests for the November 2026 security audit (MM-SA-*). Each
 * section reproduces one confirmed finding against the real module and must
 * fail on v4.10.0. Synthetic data only; no network beyond 127.0.0.1.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MAGIC_MAIL_ENCRYPTION_KEY =
  process.env.MAGIC_MAIL_ENCRYPTION_KEY || 'synthetic-encryption-key-0123456789abcdef0123';

/** Runs fn and returns the elapsed wall time in milliseconds. */
async function elapsed(fn) {
  const start = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

// ---------------------------------------------------------------------------
// MM-SA-03: bounce parser ReDoS (remote, unauthenticated mail sender)
// ---------------------------------------------------------------------------

const { parseBounce } = require('../server/src/utils/bounce-parser');

/** A non-standard bounce from a "mailer daemon" with an attacker-chosen body. */
function daemonBounce(body, recipients = 2) {
  const failed = Array.from({ length: recipients }, (_, i) => `r${i}@victim.test`).join(', ');
  return Buffer.from(
    [
      'From: Mail Delivery System <mailer-daemon@attacker.test>',
      'To: bounces@sender.example',
      'Subject: Undelivered Mail Returned to Sender',
      `X-Failed-Recipients: ${failed}`,
      'Content-Type: text/plain; charset=us-ascii',
      '',
      body,
    ].join('\r\n')
  );
}

test('MM-SA-03: a long single-line "domain ..." body is parsed within the time budget', async () => {
  // ~900 KB on one line: quadratic `domain .* could not be found` took minutes.
  const body = 'domain '.repeat(130_000);
  let result;
  const ms = await elapsed(async () => {
    result = await parseBounce(daemonBounce(body, 50));
  });
  assert.ok(result, 'still recognised as a bounce');
  assert.ok(ms < 3000, `parseBounce took ${ms.toFixed(0)} ms`);
});

test('MM-SA-03: a body of blank lines does not trigger quadratic header scanning', async () => {
  const body = ' \r\n'.repeat(300_000);
  const ms = await elapsed(() => parseBounce(daemonBounce(body)));
  assert.ok(ms < 3000, `parseBounce took ${ms.toFixed(0)} ms`);
});

test('MM-SA-03: reason codes and inline returned headers keep working', async () => {
  const body = [
    'This is the mail system at host mx.sender.example.',
    'Diagnostic: domain nowhere.test could not be found',
    'Status: 5.1.2',
    '',
    '------ This is a copy of the message headers. ------',
    '   Message-ID: <abcdef0123456789abcdef01@sender.example>',
    'X-MagicMail-Outbox: qxq9ilna62s28w7z4ickgfqx',
  ].join('\r\n');
  const result = await parseBounce(daemonBounce(body, 1));
  assert.equal(result.reasonCode, 'DNS_NXDOMAIN');
  assert.equal(result.originalMessageId, 'abcdef0123456789abcdef01@sender.example');
  assert.equal(result.outboxId, 'qxq9ilna62s28w7z4ickgfqx');
});

// ---------------------------------------------------------------------------
// MM-SA-01: changing the bounce-monitoring IMAP host must not send a stored
// secret to the new host without re-entering it
// ---------------------------------------------------------------------------

const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/** Minimal Strapi for account-manager.updateAccount (one in-memory table). */
function accountStrapi(accounts) {
  return {
    log: quietLog,
    documents: () => ({
      findOne: async ({ documentId }) => accounts.find((r) => r.documentId === documentId) || null,
      findMany: async () => [],
      create: async ({ data }) => data,
      update: async ({ documentId, data }) => {
        const row = accounts.find((r) => r.documentId === documentId);
        Object.assign(row, data);
        return { ...row };
      },
    }),
    plugin: () => ({ service: () => ({}) }),
  };
}

function smtpAccount(bounceMonitor) {
  return {
    documentId: 'acc1',
    name: 'SMTP',
    provider: 'smtp',
    fromEmail: 'noreply@sender.example',
    config: encryptCredentials({
      host: 'smtp.sender.example',
      port: 587,
      user: 'noreply@sender.example',
      pass: 'stored-smtp-secret',
      imapPass: 'stored-imap-secret',
    }),
    bounceMonitor,
  };
}

const monitorAt = (host, extra = {}) => ({
  enabled: true,
  mode: 'imap',
  imap: { host, port: 993, secure: true, ...extra },
});

test('MM-SA-01: a new IMAP host with "use the SMTP login" requires the SMTP password again', async () => {
  const accounts = [smtpAccount(monitorAt('imap.sender.example', { useSmtpLogin: true }))];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  // No `config` at all: the old code stored the new host unchecked.
  await assert.rejects(
    manager.updateAccount('acc1', {
      bounceMonitor: monitorAt('imap.attacker.example', { useSmtpLogin: true }),
    }),
    (err) => err.name === 'ValidationError' && /pass/.test(err.message)
  );
  // The admin UI path: mirrored host plus an empty imapPass.
  await assert.rejects(
    manager.updateAccount('acc1', {
      config: { pass: '********', imapHost: 'imap.attacker.example', imapPass: '' },
      bounceMonitor: monitorAt('imap.attacker.example', { useSmtpLogin: true }),
    }),
    (err) => err.name === 'ValidationError'
  );
  assert.equal(accounts[0].bounceMonitor.imap.host, 'imap.sender.example', 'nothing stored');
});

test('MM-SA-01: switching an existing IMAP host to the SMTP login requires the SMTP password', async () => {
  const accounts = [smtpAccount(monitorAt('imap.other.example', { user: 'b@sender.example' }))];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  await assert.rejects(
    manager.updateAccount('acc1', {
      bounceMonitor: monitorAt('imap.other.example', { useSmtpLogin: true }),
    }),
    (err) => err.name === 'ValidationError' && /pass/.test(err.message)
  );
});

test('MM-SA-01: a separate IMAP password must be re-entered for a new host; fresh secrets pass', async () => {
  const accounts = [smtpAccount(monitorAt('imap.sender.example', { user: 'b@sender.example' }))];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  await assert.rejects(
    manager.updateAccount('acc1', {
      bounceMonitor: monitorAt('imap.attacker.example', { user: 'b@sender.example' }),
    }),
    (err) => err.name === 'ValidationError' && /imapPass/.test(err.message)
  );
  await manager.updateAccount('acc1', {
    config: { imapPass: 'fresh-imap-secret' },
    bounceMonitor: monitorAt('imap.new.example', { user: 'b@sender.example' }),
  });
  assert.equal(accounts[0].bounceMonitor.imap.host, 'imap.new.example');
  assert.equal(decryptCredentials(accounts[0].config).imapPass, 'fresh-imap-secret');
});

test('MM-SA-01: unchanged hosts, port changes and the server-derived IMAP host need no re-entry', async () => {
  const accounts = [smtpAccount(null)];
  const manager = require('../server/src/services/account-manager')({
    strapi: accountStrapi(accounts),
  });
  // First enable: empty host = imap.<smtp domain>, derived by the server.
  await manager.updateAccount('acc1', { bounceMonitor: monitorAt('', { useSmtpLogin: true }) });
  await manager.updateAccount('acc1', {
    bounceMonitor: monitorAt('imap.sender.example', { useSmtpLogin: true }),
  });
  await manager.updateAccount('acc1', {
    bounceMonitor: monitorAt('imap.sender.example', {
      useSmtpLogin: true,
      port: 143,
      secure: false,
    }),
  });
  assert.equal(accounts[0].bounceMonitor.imap.port, 143);
});

// ---------------------------------------------------------------------------
// MM-SA-02: GraphQL shadow CRUD must not expose the plugin's content types
// ---------------------------------------------------------------------------

/** Strapi stub for server/src/register.js with an optional GraphQL plugin. */
function registerStrapi({ graphql }) {
  const disabled = [];
  const plugins = {
    graphql: graphql
      ? {
          service: (name) =>
            name === 'extension'
              ? { shadowCRUD: (uid) => ({ disable: () => disabled.push(uid) }) }
              : null,
        }
      : undefined,
  };
  return {
    disabled,
    strapi: {
      server: { use() {} },
      config: { get: (_key, fallback) => fallback },
      admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
      plugin: (name) => plugins[name],
    },
  };
}

test('MM-SA-02: register disables GraphQL shadow CRUD for every Magic Mail content type', async () => {
  const register = require('../server/src/register');
  const contentTypes = require('../server/src/content-types');
  const { strapi, disabled } = registerStrapi({ graphql: true });
  await register({ strapi });
  const expected = Object.keys(contentTypes).map((name) => `plugin::magic-mail.${name}`);
  assert.ok(expected.includes('plugin::magic-mail.email-log'));
  assert.deepEqual([...disabled].sort(), [...expected].sort());
});

test('MM-SA-02: register works without the GraphQL plugin', async () => {
  const register = require('../server/src/register');
  const { strapi, disabled } = registerStrapi({ graphql: false });
  await register({ strapi });
  assert.equal(disabled.length, 0);
});

// ---------------------------------------------------------------------------
// MM-SA-04: a forged delivery report must not suppress arbitrary addresses
// ---------------------------------------------------------------------------

const { startFakeImap } = require('./helpers/fake-imap');
const createBounceMonitor = require('../server/src/services/bounce-monitor');
const { recipientHashes } = require('../server/src/utils/log-recipients');

const BM = {
  account: 'plugin::magic-mail.email-account',
  log: 'plugin::magic-mail.email-log',
  event: 'plugin::magic-mail.email-event',
  outbox: 'plugin::magic-mail.outbox-message',
  suppressed: 'plugin::magic-mail.suppressed-recipient',
};

/** In-memory table supporting the where clauses the bounce monitor uses. */
function memoryTable(rows) {
  const hit = (row, where = {}) =>
    Object.entries(where).every(([key, cond]) => {
      const value = row[key];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if (Array.isArray(cond.$in)) return cond.$in.includes(value);
        if (cond.$eqi !== undefined)
          return String(value || '').toLowerCase() === String(cond.$eqi).toLowerCase();
        if (cond.$gte !== undefined) return new Date(value) >= new Date(cond.$gte);
        return false;
      }
      return value === cond;
    });
  return {
    rows,
    findOne: async ({ where } = {}) => rows.find((r) => hit(r, where)) || null,
    findMany: async ({ where } = {}) => rows.filter((r) => hit(r, where)),
    count: async () => rows.length,
    create: async ({ data }) => {
      const row = { id: rows.length + 1, documentId: `doc${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => hit(r, where));
      if (row) Object.assign(row, data);
      return row;
    },
    delete: async () => {},
    deleteMany: async () => ({ count: 0 }),
  };
}

function bounceHarness({ imapPort, logs }) {
  const tables = {
    [BM.account]: memoryTable([
      {
        id: 1,
        documentId: 'accImap',
        provider: 'smtp',
        isActive: true,
        fromEmail: 'noreply@sender.example',
        config: encryptCredentials({
          host: 'smtp.sender.example',
          user: 'noreply@sender.example',
          pass: 'smtp-secret',
          imapPass: 'synthetic-pass',
        }),
        bounceMonitor: {
          enabled: true,
          mode: 'imap',
          imap: {
            host: '127.0.0.1',
            port: imapPort,
            secure: false,
            user: 'bounces@sender.example',
          },
        },
        bounceMonitorState: null,
      },
    ]),
    [BM.log]: memoryTable(logs),
    [BM.event]: memoryTable([]),
    [BM.outbox]: memoryTable([]),
    [BM.suppressed]: memoryTable([]),
  };
  const services = {};
  const strapi = {
    log: quietLog,
    eventHub: { emit: async () => {} },
    db: { query: (uid) => tables[uid] },
    documents: (uid) => ({
      update: async ({ documentId, data }) => tables[uid].update({ where: { documentId }, data }),
      create: async ({ data }) => tables[uid].create({ data }),
    }),
    plugin: () => ({ service: (name) => services[name] }),
  };
  services['plugin-settings'] = { getSettings: async () => ({ suppressHardBounces: true }) };
  services['email-router'] = {};
  services.oauth = {};
  const monitor = createBounceMonitor({ strapi });
  services['bounce-monitor'] = monitor;
  const { ImapFlow } = require('imapflow');
  monitor.setTestHooks({
    imap: (options) => new ImapFlow({ ...options, doSTARTTLS: false, tls: undefined }),
  });
  return { monitor, tables };
}

/** RFC 3464 report as anyone on the internet can send it. */
function forgedDsn({ finalRecipient, originalMessageId }) {
  const boundary = 'forged-boundary';
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@attacker.test>',
    'To: bounces@sender.example',
    'Subject: Delivery Status Notification (Failure)',
    'Message-ID: <forged-1@attacker.test>',
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain',
    '',
    'Delivery failed.',
    `--${boundary}`,
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; mx.attacker.test',
    '',
    `Final-Recipient: rfc822; ${finalRecipient}`,
    'Action: failed',
    'Status: 5.1.1',
    'Diagnostic-Code: smtp; 550 5.1.1 user unknown',
    `--${boundary}`,
    'Content-Type: text/rfc822-headers',
    '',
    ...(originalMessageId ? [`Message-ID: <${originalMessageId}>`] : []),
    'Subject: anything',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

const sentLog = () => ({
  id: 1,
  documentId: 'log1',
  recipient: 'customer@receiver.example',
  accountId: 'accImap',
  sentAt: new Date(),
  messageIdLocal: 'abcdef0123456789abcdef01',
  providerMessageId: 'abcdef0123456789abcdef01@sender.example',
  deliveryStatus: 'sent',
  metadata: {
    recipientHashes: recipientHashes(['customer@receiver.example', 'cc-user@receiver.example']),
  },
});

test('MM-SA-04: a forged report without a reference to a sent mail suppresses nobody', async () => {
  const imap = await startFakeImap();
  try {
    const { monitor, tables } = bounceHarness({ imapPort: imap.port, logs: [] });
    imap.add(forgedDsn({ finalRecipient: 'victim@victim.test' }));
    await monitor.pollAccount(tables[BM.account].rows[0]);
    assert.equal(await monitor.isSuppressed('victim@victim.test'), false);
  } finally {
    await imap.close();
  }
});

test('MM-SA-04: a real Message-ID does not let a report suppress a non-recipient', async () => {
  const imap = await startFakeImap();
  try {
    const { monitor, tables } = bounceHarness({ imapPort: imap.port, logs: [sentLog()] });
    imap.add(
      forgedDsn({
        finalRecipient: 'victim@victim.test',
        originalMessageId: 'abcdef0123456789abcdef01@sender.example',
      })
    );
    await monitor.pollAccount(tables[BM.account].rows[0]);
    assert.equal(await monitor.isSuppressed('victim@victim.test'), false);
    assert.equal(tables[BM.log].rows[0].bounced, undefined, 'the log is not marked bounced');
  } finally {
    await imap.close();
  }
});

test('MM-SA-04: a report for a recipient (to or cc) of the referenced mail still suppresses', async () => {
  const imap = await startFakeImap();
  try {
    const { monitor, tables } = bounceHarness({ imapPort: imap.port, logs: [sentLog()] });
    imap.add(
      forgedDsn({
        finalRecipient: 'cc-user@receiver.example',
        originalMessageId: 'abcdef0123456789abcdef01@sender.example',
      })
    );
    await monitor.pollAccount(tables[BM.account].rows[0]);
    assert.equal(await monitor.isSuppressed('cc-user@receiver.example'), true);
  } finally {
    await imap.close();
  }
});

test('MM-SA-04: a new email log keeps keyed hashes of every to, cc and bcc address', async () => {
  const { isLogRecipient } = require('../server/src/utils/log-recipients');
  let created = null;
  const strapi = {
    log: quietLog,
    documents: () => ({
      create: async ({ data }) => {
        created = data;
        return { ...data, documentId: 'log1' };
      },
    }),
  };
  const analytics = require('../server/src/services/analytics')({ strapi });
  const services = { analytics };
  strapi.plugin = () => ({ service: (name) => services[name] });
  const router = require('../server/src/services/email-router')({ strapi });
  await router.createDeliveryLog(
    {
      to: 'Customer <Customer@Receiver.example>',
      cc: ['cc-one@receiver.example'],
      bcc: 'hidden@receiver.example',
      subject: 'Order',
      attachments: [],
    },
    null,
    'test'
  );
  const log = { recipient: created.recipient, metadata: created.metadata };
  for (const address of [
    'customer@receiver.example',
    'cc-one@receiver.example',
    'hidden@receiver.example',
  ]) {
    assert.equal(isLogRecipient(log, address), true, address);
  }
  assert.equal(isLogRecipient(log, 'victim@victim.test'), false);
  // Copy recipients are never stored in clear text.
  assert.doesNotMatch(JSON.stringify(created), /cc-one@|hidden@/);
});

// ---------------------------------------------------------------------------
// MM-SA-05: the outbound HTML sanitiser's CSS check (content-API input)
// ---------------------------------------------------------------------------

const sanitizeHtml = require('sanitize-html');
const { HTML_SANITIZE_OPTIONS } = require('../server/src/services/email-router').__test__;

test('MM-SA-05: a 100 000-character style attribute is sanitised within the time budget', async () => {
  // `<\s*\/?\s*(script|style)` was quadratic: ~5 s per send at the html cap.
  const html = `<p style="<${'\t'.repeat(99_980)}:">x</p>`;
  const ms = await elapsed(() => sanitizeHtml(html, HTML_SANITIZE_OPTIONS));
  assert.ok(ms < 500, `sanitizeHtml took ${ms.toFixed(0)} ms`);
});

test('MM-SA-05: CSS escapes and comments can not hide unsafe CSS', () => {
  const clean = (html) => sanitizeHtml(html, HTML_SANITIZE_OPTIONS);
  assert.doesNotMatch(
    clean('<style>@\\69mport url(https://evil.example/x.css);</style>'),
    /import/
  );
  assert.doesNotMatch(clean('<style>@im/**/port url(https://evil.example/x.css);</style>'), /port/);
  assert.doesNotMatch(
    clean('<p style="background:url(java\\73 cript:alert(1))">x</p>'),
    /style=/,
    'escaped javascript: is dropped'
  );
  assert.doesNotMatch(clean('<p style="width:expr\\65ssion(alert(1))">x</p>'), /style=/);
});

test('MM-SA-05: ordinary email CSS is kept', () => {
  const clean = (html) => sanitizeHtml(html, HTML_SANITIZE_OPTIONS);
  assert.match(
    clean('<p style="color:#333;font-family:Arial, sans-serif;padding:8px">x</p>'),
    /style="color:#333;font-family:Arial, sans-serif;padding:8px"/
  );
  assert.match(
    clean('<style>/* layout */ .btn { background: #4f46e5; }</style><p>x</p>'),
    /\.btn \{ background: #4f46e5; \}/
  );
});

// ---------------------------------------------------------------------------
// MM-SA-06: core (users-permissions) template validation is linear and as
// strict as users-permissions itself
// ---------------------------------------------------------------------------

/** users-permissions store stub for email-designer.updateCoreTemplate. */
function coreTemplateStrapi() {
  const box = { value: {}, sets: 0 };
  return {
    box,
    strapi: {
      log: quietLog,
      plugin: (name) => (name === 'users-permissions' ? {} : null),
      store: async () => ({
        get: async () => box.value,
        set: async ({ value }) => {
          box.value = value;
          box.sets += 1;
        },
      }),
    },
  };
}

test('MM-SA-06: unclosed placeholders with long whitespace runs are validated within the time budget', async () => {
  const { strapi } = coreTemplateStrapi();
  const designer = require('../server/src/services/email-designer')({ strapi });
  const inputs = [
    { subject: 'x', message: '<%=' + ' '.repeat(20_000) + 'x' },
    { subject: '{{' + ' '.repeat(990) + 'x', message: 'ok' },
    { subject: 'x', message: '{{'.repeat(40_000) + ' {{ URL }}' },
  ];
  for (const data of inputs) {
    const ms = await elapsed(() =>
      designer.updateCoreTemplate('reset-password', data).catch(() => {})
    );
    assert.ok(ms < 500, `updateCoreTemplate took ${ms.toFixed(0)} ms`);
  }
});

test('MM-SA-06: "$" followed by "${...}" is rejected like users-permissions does', async () => {
  const { strapi, box } = coreTemplateStrapi();
  const designer = require('../server/src/services/email-designer')({ strapi });
  const dollarExpression = '$$' + '{process}';
  await assert.rejects(
    designer.updateCoreTemplate('reset-password', {
      subject: 'x',
      message: `<p>${dollarExpression}</p> {{ URL }}`,
    }),
    (err) => err.name === 'ValidationError'
  );
  assert.equal(box.sets, 0);
  // Placeholders keep converting, including triple braces and "=".
  await designer.updateCoreTemplate('reset-password', {
    subject: 'Hi {{USER.username}}',
    message: '{{{ URL }}} {{= TOKEN }} {{  CODE  }}',
  });
  assert.equal(box.value.reset_password.options.message, '<%= URL %> <%= TOKEN %> <%= CODE %>');
});
