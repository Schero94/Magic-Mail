'use strict';

// Behavioural tests for the MagicMail sending path (router, native email
// interception, Content-API send controller, logger). Synthetic data only:
// every provider call goes to a fake fetch / fake nodemailer transport.

const test = require('node:test');
const assert = require('node:assert/strict');

const ROUTER_PATH = '../server/src/services/email-router';
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

function withEncryptionKey() {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 's'.repeat(32);
  return () => {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  };
}

function captureLog() {
  const entries = { debug: [], info: [], warn: [], error: [] };
  const log = Object.fromEntries(Object.keys(entries).map((level) => [
    level,
    (...args) => entries[level].push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  ]));
  return { log, entries };
}

function fakeAccepted() {
  return { ok: true, status: 202, headers: { get: () => 'fake-id' }, json: async () => ({ id: 'fake-id' }) };
}

/**
 * Builds a fake strapi for router.send(): in-memory accounts, rules and
 * logs, fake analytics/settings services and no database connection.
 */
function createRouterHarness({ accounts = [], rules = [], settings = {}, templates = {}, log = quietLog } = {}) {
  const logs = [];
  const logUpdates = [];
  const strapi = {
    log,
    config: { get: (key, fallback) => fallback },
    plugin(name) {
      assert.equal(name, 'magic-mail');
      return {
        service(serviceName) {
          if (serviceName === 'plugin-settings') return { getSettings: async () => settings };
          if (serviceName === 'analytics') {
            return {
              createEmailLog: async (data) => {
                const entry = { documentId: `log-${logs.length + 1}`, emailId: `email-${logs.length + 1}`, metadata: data.metadata, data };
                logs.push(entry);
                return entry;
              },
              generateRecipientHash: () => 'hash',
              injectTrackingPixel: (html, emailId) => `${html}<img src="https://track.example.test/o/${emailId}">`,
              rewriteLinksForTracking: async (html) => html,
            };
          }
          if (serviceName === 'email-designer') {
            return {
              renderTemplate: async (referenceId) => {
                if (!templates[referenceId]) throw new Error('missing template');
                return templates[referenceId];
              },
              findOne: async () => null,
            };
          }
          throw new Error(`Unexpected service ${serviceName}`);
        },
      };
    },
    documents(uid) {
      return {
        findMany: async ({ filters = {} } = {}) => {
          if (uid.endsWith('routing-rule')) return rules.filter((r) => r.isActive !== false);
          let list = accounts.filter((a) => a.isActive !== false);
          const excluded = filters.documentId?.$notIn || [];
          list = list.filter((a) => !excluded.includes(a.documentId));
          if (filters.name?.$eqi) {
            list = list.filter((a) => a.name.toLowerCase() === filters.name.$eqi.toLowerCase());
          }
          return [...list].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        },
        findOne: async ({ documentId }) => accounts.find((a) => a.documentId === documentId) || null,
        update: async ({ documentId, data }) => { logUpdates.push({ documentId, data }); return data; },
      };
    },
  };
  delete require.cache[require.resolve(ROUTER_PATH)];
  const router = require(ROUTER_PATH)({ strapi });
  router.updateAccountStats = async () => {};
  return { router, strapi, logs, logUpdates };
}

function account(documentId, overrides = {}) {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  return {
    documentId,
    name: documentId,
    provider: 'sendgrid',
    fromEmail: `${documentId}@sender.example.test`,
    isActive: true,
    priority: 1,
    config: encryptCredentials({ apiKey: `fake-${documentId}` }),
    ...overrides,
  };
}

const baseMail = () => ({
  to: 'recipient@example.test',
  subject: 'Synthetic test',
  text: 'Synthetic body',
});

// ── SEC-02 From alignment ──────────────────────────────────────────────────

test('SEC-02: From parsing rejects quoted-angle and comment spoofing forms', () => {
  const { isFromAllowed, resolveSender } = require(ROUTER_PATH).__test__;
  const accountAddress = 'sender@company.example.test';

  assert.equal(isFromAllowed('"<sender@company.example.test>" attacker@evil.example.test', accountAddress), false);
  assert.equal(isFromAllowed('attacker@evil.example.test (<sender@company.example.test>)', accountAddress), false);
  assert.equal(isFromAllowed('a@x.test, sender@company.example.test', accountAddress), false);
  assert.equal(isFromAllowed('"Brand" <SENDER@company.example.test>', accountAddress), true);

  const spoofed = resolveSender({ fromEmail: accountAddress, fromName: 'Company' }, '"<sender@company.example.test>" attacker@evil.example.test');
  assert.equal(spoofed.rejected, true);
  assert.deepEqual(spoofed.sender, { name: 'Company', address: accountAddress });

  const aligned = resolveSender({ fromEmail: accountAddress }, '"Support Team" <sender@company.example.test>');
  assert.deepEqual(aligned.sender, { name: 'Support Team', address: accountAddress });
});

test('SEC-02: content.send only accepts a single mailbox for from and replyTo', () => {
  const { validate } = require('../server/src/validation');
  const base = baseMail();
  assert.throws(() => validate('content.send', { ...base, from: '"<a@b.test>" evil@x.test' }));
  assert.throws(() => validate('content.send', { ...base, from: 'evil@x.test (<a@b.test>)' }));
  assert.throws(() => validate('content.send', { ...base, replyTo: 'not an address' }));
  assert.equal(validate('content.send', { ...base, from: 'Brand <a@b.test>' }).from, 'Brand <a@b.test>');
});

test('SEC-02: SMTP never forwards a spoofed raw From string', async () => {
  const restore = withEncryptionKey();
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  let sent;
  nodemailer.createTransport = () => ({ sendMail: async (options) => { sent = options; return { messageId: 'x' }; } });
  try {
    const { encryptCredentials } = require('../server/src/utils/encryption');
    delete require.cache[require.resolve(ROUTER_PATH)];
    const router = require(ROUTER_PATH)({ strapi: { log: quietLog } });
    await router.sendViaSMTP({
      fromEmail: 'sender@company.example.test',
      fromName: 'Company',
      config: encryptCredentials({ host: 'smtp.example.test', user: 'u', pass: 'p' }),
    }, { ...baseMail(), from: '"<sender@company.example.test>" attacker@evil.example.test' });
    assert.deepEqual(sent.from, { name: 'Company', address: 'sender@company.example.test' });
  } finally {
    nodemailer.createTransport = original;
    restore();
  }
});

// ── SEC-08 header allowlist ────────────────────────────────────────────────

test('SEC-08: custom headers use an allowlist and cannot override MagicMail headers', () => {
  const { buildOutboundHeaders } = require(ROUTER_PATH).__test__;
  const headers = buildOutboundHeaders({
    type: 'notification',
    headers: {
      'Return-Path': 'bounce@evil.example.test',
      'Disposition-Notification-To': 'spy@evil.example.test',
      'Resent-From': 'x@evil.example.test',
      'DKIM-Signature': 'v=1',
      'MIME-Version': '2.0',
      'X-Mailer': 'Spoofed',
      'auto-submitted': 'no',
      'X-Campaign': 'spring',
      'List-Id': '<news.example.test>',
    },
  });
  for (const forbidden of ['Return-Path', 'Disposition-Notification-To', 'Resent-From', 'DKIM-Signature', 'MIME-Version']) {
    assert.equal(Object.keys(headers).some((k) => k.toLowerCase() === forbidden.toLowerCase()), false, forbidden);
  }
  assert.equal(headers['X-Mailer'], 'MagicMail/1.0');
  assert.equal(headers['Auto-Submitted'], 'auto-generated');
  assert.equal(Object.keys(headers).filter((k) => k.toLowerCase() === 'auto-submitted').length, 1);
  assert.equal(headers['X-Campaign'], 'spring');
  assert.equal(headers['List-Id'], '<news.example.test>');
});

test('SEC-08: content.send caps custom headers at 20', () => {
  const { validate } = require('../server/src/validation');
  const headers = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`X-H${i}`, 'v']));
  assert.throws(() => validate('content.send', { ...baseMail(), headers }));
});

// ── Attachments (SEC-14, FUN-17, DOC-08, DOC-14) ───────────────────────────

test('SEC-14/DOC-08: path and href attachments are rejected for every entry point', async () => {
  const restore = withEncryptionKey();
  const previousFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return fakeAccepted(); };
  try {
    const { router } = createRouterHarness({ accounts: [account('a1')] });
    await assert.rejects(router.send({ ...baseMail(), attachments: [{ path: '/etc/passwd' }] }), /not supported/);
    await assert.rejects(router.send({ ...baseMail(), attachments: [{ href: 'http://169.254.169.254/' }] }), /not supported/);
    await assert.rejects(router.sendViaSendGrid(account('a1'), { ...baseMail(), attachments: [{ path: '/etc/passwd' }] }), /not supported/);
    await assert.rejects(router.sendViaMailgun(account('a1', {
      provider: 'mailgun',
      config: require('../server/src/utils/encryption').encryptCredentials({ apiKey: 'k', domain: 'mg.example.test' }),
    }), { ...baseMail(), attachments: [{ path: '/etc/passwd' }] }), /not supported/);
    assert.equal(fetchCalls, 0);

    const { validate } = require('../server/src/validation');
    assert.throws(() => validate('content.send', { ...baseMail(), attachments: [{ path: '/etc/passwd' }] }));
  } finally {
    global.fetch = previousFetch;
    restore();
  }
});

test('DOC-14/FUN-17: SendGrid encodes base64 attachments once and maps cid to inline', async () => {
  const restore = withEncryptionKey();
  const previousFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => { body = JSON.parse(options.body); return fakeAccepted(); };
  try {
    const { router } = createRouterHarness();
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252]);
    await router.sendViaSendGrid(account('a1', { fromName: 'Brand' }), {
      ...baseMail(),
      from: '"Campaign" <a1@sender.example.test>',
      headers: { 'X-Campaign': 'c1' },
      attachments: [
        { filename: 'data.bin', content: bytes.toString('base64'), encoding: 'base64', contentType: 'application/octet-stream' },
        { filename: 'logo.png', content: bytes, contentType: 'image/png', cid: 'logo@brand' },
        { filename: 'note.txt', content: 'hello' },
      ],
    });
    assert.equal(body.attachments[0].content, bytes.toString('base64'));
    assert.equal(body.attachments[0].disposition, 'attachment');
    assert.equal(body.attachments[1].disposition, 'inline');
    assert.equal(body.attachments[1].content_id, 'logo@brand');
    assert.equal(Buffer.from(body.attachments[2].content, 'base64').toString(), 'hello');
    assert.deepEqual(body.from, { email: 'a1@sender.example.test', name: 'Campaign' });
    assert.equal(body.headers['X-Campaign'], 'c1');
  } finally {
    global.fetch = previousFetch;
    restore();
  }
});

test('FUN-17: Mailgun forwards custom headers, aligned display name and decoded attachments', async () => {
  const restore = withEncryptionKey();
  const previousFetch = global.fetch;
  let form;
  let url;
  global.fetch = async (requestUrl, options) => { url = requestUrl; form = options.body; return { ok: true, status: 200, json: async () => ({ id: 'm' }) }; };
  try {
    const { encryptCredentials } = require('../server/src/utils/encryption');
    const { router } = createRouterHarness();
    const mailgun = account('mg', { provider: 'mailgun', config: encryptCredentials({ apiKey: 'k', domain: 'mg.example.test' }) });
    await router.sendViaMailgun(mailgun, {
      ...baseMail(),
      from: 'Team <mg@sender.example.test>',
      headers: { 'X-Campaign': 'c2' },
      attachments: [{ filename: 'a.bin', content: Buffer.from('xyz').toString('base64'), encoding: 'base64' }],
    });
    assert.equal(url, 'https://api.mailgun.net/v3/mg.example.test/messages');
    assert.equal(form.get('from'), '"Team" <mg@sender.example.test>');
    assert.equal(form.get('h:X-Campaign'), 'c2');
    assert.equal(Buffer.from(await form.get('attachment').arrayBuffer()).toString(), 'xyz');

    const badDomain = account('mg2', { provider: 'mailgun', config: encryptCredentials({ apiKey: 'k', domain: 'evil.test/../x' }) });
    await assert.rejects(router.sendViaMailgun(badDomain, baseMail()), /valid host name/);
  } finally {
    global.fetch = previousFetch;
    restore();
  }
});

// ── FUN-04 sanitizer keeps designer layout ─────────────────────────────────

test('FUN-04: sanitizer keeps email layout markup and still strips active content', () => {
  const { router } = createRouterHarness();
  const data = {
    ...baseMail(),
    html: [
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><style type="text/css">@media (max-width:600px){td > p{color:red}}</style>',
      '<style>.x{background:url(javascript:alert(1))}</style></head><body>',
      '<table role="presentation" bgcolor="#ffffff" align="center" cellpadding="0" width="600"><tr>',
      '<td align="center" valign="top" bgcolor="#eeeeee" style="padding:4px">Hi</td></tr></table>',
      '<center><font color="#333">Centered</font></center>',
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="logo">',
      '<img src="data:text/html;base64,PHNjcmlwdD4=">',
      '<p style="width:expression(alert(1))">x</p>',
      '<script>alert(1)</script><a href="javascript:alert(2)" onclick="x()">l</a>',
      '</body></html>',
    ].join(''),
  };
  router.validateEmailSecurity(data);
  const html = data.html;
  assert.match(html, /<style type="text\/css">@media \(max-width:600px\)\{td > p\{color:red\}\}<\/style>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /bgcolor="#ffffff"/);
  assert.match(html, /align="center"/);
  assert.match(html, /<center><font color="#333">Centered<\/font><\/center>/);
  assert.match(html, /src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.doesNotMatch(html, /data:text\/html/);
  assert.doesNotMatch(html, /expression\(/);
  assert.doesNotMatch(html, /<script|onclick/);
});

// ── FUN-05 recipient routing ───────────────────────────────────────────────

test('FUN-05: recipient rules work with arrays, CSV strings and display names', async () => {
  const restore = withEncryptionKey();
  try {
    const vip = account('vip');
    const primary = account('primary', { isPrimary: true });
    const rules = [{ matchType: 'recipient', matchValue: '@vip.example.test', accountName: 'VIP', priority: 5 }];
    const { router } = createRouterHarness({ accounts: [primary, vip], rules });

    assert.equal((await router.selectAccount('transactional', 'normal', [], { to: ['x@other.test', 'y@vip.example.test'] })).name, 'vip');
    assert.equal((await router.selectAccount('transactional', 'normal', [], { to: 'x@other.test, Boss <BOSS@vip.example.test>' })).name, 'vip');
    assert.equal((await router.selectAccount('transactional', 'normal', [], { to: ['x@other.test'] })).name, 'primary');
    assert.equal(router.ruleMatches({ matchType: 'recipient', matchValue: 'exact@vip.example.test' }, 'transactional', { to: 'Exact <exact@vip.example.test>' }), true);
    assert.equal(router.ruleMatches({ matchType: 'recipient', matchValue: 'exact@vip.example.test' }, 'transactional', { to: 'notexact@vip.example.test' }), false);
  } finally {
    restore();
  }
});

// ── FUN-06 failover ────────────────────────────────────────────────────────

test('FUN-06: provider errors that guarantee non-delivery fail over to the next account', async () => {
  const restore = withEncryptionKey();
  try {
    const first = account('first', { priority: 9, isPrimary: true });
    const second = account('second', { priority: 5 });
    const { router, logUpdates } = createRouterHarness({ accounts: [first, second] });
    const used = [];
    router.sendViaSendGrid = async (acc) => {
      used.push(acc.name);
      if (acc.name === 'first') { const e = new Error('refused'); e.code = 'ECONNECTION'; throw e; }
      return { messageId: 'ok' };
    };
    const result = await router.send(baseMail());
    assert.equal(result.accountUsed, 'second');
    assert.deepEqual(used, ['first', 'second']);
    const sent = logUpdates.find((u) => u.data.deliveryStatus === 'sent');
    assert.deepEqual(sent.data.metadata.attemptedAccounts, ['first', 'second']);
  } finally {
    restore();
  }
});

test('FUN-06: ambiguous provider errors are not retried (no duplicate delivery)', async () => {
  const restore = withEncryptionKey();
  try {
    const { router } = createRouterHarness({ accounts: [account('first', { priority: 9 }), account('second')] });
    const used = [];
    router.sendViaSendGrid = async (acc) => { used.push(acc.name); const e = new Error('timeout'); e.code = 'ETIMEDOUT'; throw e; };
    await assert.rejects(router.send(baseMail()), /timeout/);
    assert.deepEqual(used, ['first']);
  } finally {
    restore();
  }
});

test('FUN-06: quota exhaustion skips to any account with capacity, not just one fallback', async () => {
  const restore = withEncryptionKey();
  try {
    const { quotaWindowKeys } = require(ROUTER_PATH).__test__;
    const keys = quotaWindowKeys();
    const full = (id, priority) => account(id, { priority, dailyLimit: 1, emailsSentToday: 1, quotaDayKey: keys.day });
    const { router, logUpdates } = createRouterHarness({
      accounts: [full('a', 9), full('b', 8), account('c', { priority: 1 })],
    });
    router.sendViaSendGrid = async () => ({ messageId: 'ok' });
    const result = await router.send(baseMail());
    assert.equal(result.accountUsed, 'c');
    const sent = logUpdates.find((u) => u.data.deliveryStatus === 'sent');
    assert.deepEqual(sent.data.metadata.skippedAccounts, ['a', 'b']);
  } finally {
    restore();
  }
});

test('FUN-06/FUN-07: an explicit account is never replaced and name lookup is case-insensitive', async () => {
  const restore = withEncryptionKey();
  try {
    const { quotaWindowKeys } = require(ROUTER_PATH).__test__;
    const keys = quotaWindowKeys();
    const busy = account('Busy', { dailyLimit: 1, emailsSentToday: 1, quotaDayKey: keys.day });
    const { router } = createRouterHarness({ accounts: [busy, account('other')] });
    const used = [];
    router.sendViaSendGrid = async (acc) => { used.push(acc.name); return { messageId: 'ok' }; };

    await assert.rejects(router.send({ ...baseMail(), accountName: 'busy' }), /over its sending quota/);
    assert.deepEqual(used, []);

    const failing = createRouterHarness({ accounts: [account('Solo'), account('other')] }).router;
    failing.sendViaSendGrid = async () => { const e = new Error('refused'); e.code = 'ECONNECTION'; throw e; };
    await assert.rejects(failing.send({ ...baseMail(), accountName: 'SOLO' }), /refused/);
  } finally {
    restore();
  }
});

test('FUN-07: the account test can target an inactive account by documentId', async () => {
  const restore = withEncryptionKey();
  try {
    const inactive = account('draft', { isActive: false });
    const { router } = createRouterHarness({ accounts: [inactive, account('live', { isPrimary: true })] });
    const used = [];
    router.sendViaSendGrid = async (acc) => { used.push(acc.name); return { messageId: 'ok' }; };
    await assert.rejects(router.send(baseMail(), { accountDocumentId: 'draft' }), /not available/);
    const result = await router.send(baseMail(), { accountDocumentId: 'draft', allowInactive: true });
    assert.equal(result.accountUsed, 'draft');
    assert.deepEqual(used, ['draft']);
  } finally {
    restore();
  }
});

// ── FUN-08 quota reservation (real SQL on node:sqlite) ─────────────────────

function createSqliteQuotaHarness() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE accounts (
    id INTEGER PRIMARY KEY, document_id TEXT, daily_limit INTEGER, hourly_limit INTEGER,
    emails_sent_today INTEGER, emails_sent_this_hour INTEGER, total_emails_sent INTEGER,
    quota_day_key TEXT, quota_hour_key TEXT, last_used INTEGER, updated_at INTEGER)`);
  const builder = require('knex')({ client: 'sqlite3', useNullAsDefault: true });
  const knex = (table) => {
    const qb = builder(table);
    qb.then = (resolve, reject) => {
      try {
        const { sql, bindings } = qb.toSQL();
        const values = bindings.map((v) => (v instanceof Date ? v.getTime() : v));
        return Promise.resolve(db.prepare(sql).run(...values).changes).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    };
    return qb;
  };
  knex.raw = builder.raw.bind(builder);
  const strapi = {
    log: quietLog,
    config: { get: (key, fallback) => fallback },
    db: { connection: knex, metadata: { get: () => ({ tableName: 'accounts' }) } },
  };
  delete require.cache[require.resolve(ROUTER_PATH)];
  const router = require(ROUTER_PATH)({ strapi });
  return { db, router };
}

test('FUN-08: quota reservation is a conditional atomic update with clock-aligned windows', async () => {
  const { db, router } = createSqliteQuotaHarness();
  db.prepare('INSERT INTO accounts (document_id, daily_limit, hourly_limit, emails_sent_today, emails_sent_this_hour, total_emails_sent, quota_day_key, quota_hour_key) VALUES (?,?,?,?,?,?,?,?)')
    .run('acc', 3, 0, 99, 99, 0, '2000-01-01', '2000-01-01T00');

  const results = await Promise.all(Array.from({ length: 10 }, () => router.reserveQuota({ documentId: 'acc' })));
  assert.equal(results.filter((r) => r === 'reserved').length, 3, 'a stale window restarts at zero and stops at the limit');
  assert.equal(results.filter((r) => r === false).length, 7);

  let row = db.prepare('SELECT * FROM accounts WHERE document_id = ?').get('acc');
  assert.equal(row.emails_sent_today, 3);
  const { quotaWindowKeys } = require(ROUTER_PATH).__test__;
  assert.equal(row.quota_day_key, quotaWindowKeys().day);

  await router.releaseQuota({ documentId: 'acc' });
  row = db.prepare('SELECT * FROM accounts WHERE document_id = ?').get('acc');
  assert.equal(row.emails_sent_today, 2, 'a failed dispatch returns its reservation');

  await router.updateAccountStats('acc', { countersReserved: true });
  row = db.prepare('SELECT * FROM accounts WHERE document_id = ?').get('acc');
  assert.equal(row.total_emails_sent, 1);
  assert.equal(row.emails_sent_today, 2, 'reserved counters are not incremented twice');

  db.prepare('UPDATE accounts SET quota_hour_key = ?, quota_day_key = ?, emails_sent_this_hour = 5').run('2000-01-01T00', '2000-01-01');
  await router.refreshQuotaWindows();
  row = db.prepare('SELECT * FROM accounts WHERE document_id = ?').get('acc');
  assert.equal(row.emails_sent_today, 0);
  assert.equal(row.emails_sent_this_hour, 0);
});

test('FUN-08: quota windows follow the configured time zone', () => {
  const { quotaWindowKeys } = require(ROUTER_PATH).__test__;
  const instant = new Date('2026-03-01T23:30:00Z');
  assert.deepEqual(quotaWindowKeys(instant, 'UTC'), { day: '2026-03-01', hour: '2026-03-01T23' });
  assert.deepEqual(quotaWindowKeys(instant, 'Europe/Berlin'), { day: '2026-03-02', hour: '2026-03-02T00' });
});

// ── FUN-10 template category, FUN-11 sender defaults ───────────────────────

test('FUN-10: a marketing template routes and is labelled as marketing', async () => {
  const restore = withEncryptionKey();
  const previousFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => { body = JSON.parse(options.body); return fakeAccepted(); };
  try {
    const rules = [{ matchType: 'emailType', matchValue: 'marketing', accountName: 'bulk', priority: 3 }];
    const { router } = createRouterHarness({
      accounts: [account('main', { isPrimary: true }), account('bulk')],
      rules,
      templates: { 7: { html: '<p>Sale</p>', text: 'Sale', subject: 'Sale', category: 'marketing', templateName: 'Sale' } },
      settings: { enableUnsubscribeHeader: true, unsubscribeUrl: 'https://example.test/u?e={{email}}' },
    });
    const result = await router.send({ to: 'Buyer@example.test', templateReferenceId: '7' });
    assert.equal(result.accountUsed, 'bulk');
    assert.equal(body.headers['X-Email-Type'], 'marketing');
    assert.equal(body.headers['List-Unsubscribe'], '<https://example.test/u?e=buyer%40example.test>');
    assert.equal(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.equal(body.headers.Precedence, 'bulk');
  } finally {
    global.fetch = previousFetch;
    restore();
  }
});

test('FUN-12: the unsubscribe toggle gates the global URL and mailto gets no One-Click', () => {
  const { buildOutboundHeaders } = require(ROUTER_PATH).__test__;
  assert.deepEqual(
    Object.keys(buildOutboundHeaders({ type: 'marketing', unsubscribeUrl: 'mailto:unsub@example.test' })).filter((k) => k.startsWith('List-')),
    ['List-Unsubscribe']
  );
  assert.equal(buildOutboundHeaders({ type: 'marketing', to: ['a@x.test', 'b@x.test'], unsubscribeUrl: 'https://x.test/u?e={{email}}' })['List-Unsubscribe'], undefined);
});

test('FUN-12: with the toggle off the global unsubscribe URL is not applied', async () => {
  const restore = withEncryptionKey();
  try {
    const { router } = createRouterHarness({
      accounts: [account('main')],
      settings: { enableUnsubscribeHeader: false, unsubscribeUrl: 'https://example.test/u' },
    });
    let seen;
    router.sendViaSendGrid = async (_acc, data) => { seen = data; return { messageId: 'ok' }; };
    await router.send({ ...baseMail(), type: 'transactional' });
    assert.equal(seen.unsubscribeUrl, undefined);
  } finally {
    restore();
  }
});

test('FUN-11: defaultFromName is the display-name fallback and produces no warning', async () => {
  const restore = withEncryptionKey();
  try {
    const { log, entries } = captureLog();
    const { router } = createRouterHarness({
      accounts: [account('main', { fromName: '' })],
      settings: { defaultFromName: 'Brand Mail', defaultFromEmail: 'other@elsewhere.test' },
      log,
    });
    let seen;
    router.sendViaSendGrid = async (_acc, data) => { seen = data; return { messageId: 'ok' }; };
    await router.send(baseMail());
    assert.deepEqual(seen.from, { name: 'Brand Mail', address: 'main@sender.example.test' });
    assert.equal(entries.warn.some((line) => /from-override/i.test(line)), false);
  } finally {
    restore();
  }
});

// ── FUN-M01 / FUN-M02 ──────────────────────────────────────────────────────

test('FUN-M01: send() never mutates the caller payload', async () => {
  const restore = withEncryptionKey();
  try {
    const { router } = createRouterHarness({ accounts: [account('main')] });
    const htmls = [];
    router.sendViaSendGrid = async (_acc, data) => { htmls.push(data.html); return { messageId: 'ok' }; };
    const payload = { to: 'ONE@example.test', subject: 'Hi', html: '<p>Hi</p>', cc: ['C@example.test'] };
    const snapshot = JSON.parse(JSON.stringify(payload));
    await router.send(payload);
    assert.deepEqual(payload, snapshot);
    payload.to = 'two@example.test';
    await router.send(payload);
    assert.match(htmls[0], /email-1/);
    assert.match(htmls[1], /email-2/);
    assert.doesNotMatch(htmls[1], /email-1/);
  } finally {
    restore();
  }
});

test('FUN-M02: text-only and tracking-disabled mails are logged too', async () => {
  const restore = withEncryptionKey();
  try {
    const { router, logs, logUpdates } = createRouterHarness({ accounts: [account('main')] });
    let seenHtml;
    router.sendViaSendGrid = async (_acc, data) => { seenHtml = data.html; return { messageId: 'ok' }; };
    await router.send(baseMail());
    await router.send({ ...baseMail(), html: '<p>x</p>', enableTracking: false });
    assert.equal(logs.length, 2);
    assert.equal(logs[1].metadata.tracking, false);
    assert.doesNotMatch(seenHtml, /track\.example/);
    assert.equal(logUpdates.filter((u) => u.data.deliveryStatus === 'sent').length, 2);
  } finally {
    restore();
  }
});

// ── FUN-M04 SMTP TLS opt-out ───────────────────────────────────────────────

test('FUN-M04: allowInsecure is honoured outside production or for loopback hosts only', async () => {
  const restore = withEncryptionKey();
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  const previousEnv = process.env.NODE_ENV;
  const configs = [];
  nodemailer.createTransport = (config) => { configs.push(config); return { sendMail: async () => ({ messageId: 'x' }) }; };
  try {
    const { encryptCredentials } = require('../server/src/utils/encryption');
    delete require.cache[require.resolve(ROUTER_PATH)];
    const router = require(ROUTER_PATH)({ strapi: { log: quietLog } });
    const smtp = (host) => ({ fromEmail: 'a@b.test', config: encryptCredentials({ host, port: 1025, allowInsecure: true }) });

    process.env.NODE_ENV = 'development';
    await router.sendViaSMTP(smtp('mailpit'), baseMail());
    process.env.NODE_ENV = 'production';
    await router.sendViaSMTP(smtp('smtp.example.test'), baseMail());
    await router.sendViaSMTP(smtp('127.0.0.1'), baseMail());
    await router.sendViaSMTP({ fromEmail: 'a@b.test', config: encryptCredentials({ host: 'smtp.example.test' }) }, baseMail());

    assert.deepEqual(configs.map((c) => c.requireTLS), [false, true, false, true]);
    assert.deepEqual(configs.map((c) => c.tls.rejectUnauthorized), [false, true, false, true]);
  } finally {
    nodemailer.createTransport = original;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    restore();
  }
});

// ── Native interception (FUN-01, FUN-02, STR-01, DOC-09) ───────────────────

function createInterceptionHarness({ routerSend }) {
  const providerCalls = [];
  const emailPlugin = {
    provider: { send: async (options) => { providerCalls.push(options); return { messageId: 'native' }; } },
  };
  // The real @strapi/email 5.x service: both methods call provider.send().
  const emailServicePath = require('node:path').join(__dirname, '../node_modules/@strapi/email/dist/server/services/email.js');
  const strapiEmailService = require(emailServicePath)();
  emailPlugin.service = () => strapiEmailService;
  const routerCalls = [];
  const fakeStrapi = {
    log: quietLog,
    config: { get: () => ({}) },
    plugin(name) {
      if (name === 'email') return emailPlugin;
      return { service: () => ({ send: async (payload, options) => { routerCalls.push({ payload, options }); return routerSend(payload, options); }, refreshQuotaWindows: async () => {} }) };
    },
    store: () => ({ get: async () => true, set: async () => {} }),
  };
  return { fakeStrapi, emailPlugin, strapiEmailService, providerCalls, routerCalls };
}

test('FUN-02/STR-01: send() and sendTemplatedEmail() are both routed through MagicMail', async () => {
  const restore = withEncryptionKey();
  const previousStrapi = global.strapi;
  const h = createInterceptionHarness({ routerSend: async () => ({ success: true }) });
  global.strapi = h.fakeStrapi;
  const bootstrap = require('../server/src/bootstrap');
  const destroy = require('../server/src/destroy');
  try {
    await bootstrap({ strapi: h.fakeStrapi });
    await bootstrap({ strapi: h.fakeStrapi }); // hot reload must not stack wrappers

    await h.strapiEmailService.send({ to: 'u@example.test', subject: 's', text: 't', data: { a: 1 } });
    await h.strapiEmailService.sendTemplatedEmail(
      { to: 'admin@example.test' },
      { subject: 'Reset <%= user.name %>', text: 'Hi <%= user.name %>', html: '<p>Hi <%= user.name %></p>' },
      { user: { name: 'Ada' } }
    );

    assert.equal(h.providerCalls.length, 0, 'the native provider is not used while MagicMail can send');
    assert.equal(h.routerCalls.length, 2);
    assert.deepEqual(h.routerCalls[0].payload.templateData, { a: 1 });
    assert.equal(h.routerCalls[1].payload.subject, 'Reset Ada');
    assert.equal(h.routerCalls[1].payload.html, '<p>Hi Ada</p>');
    assert.equal(h.routerCalls[1].options.source, 'strapi-email');

    await destroy({ strapi: h.fakeStrapi });
    await h.strapiEmailService.send({ to: 'u@example.test', subject: 's', text: 't' });
    assert.equal(h.providerCalls.length, 1, 'destroy restores the native provider');
    assert.equal(h.routerCalls.length, 2);
  } finally {
    await destroy({ strapi: h.fakeStrapi });
    if (previousStrapi === undefined) delete global.strapi;
    else global.strapi = previousStrapi;
    restore();
  }
});

test('FUN-01/DOC-09: without a usable account the original provider sends; provider errors never re-send', async () => {
  const restore = withEncryptionKey();
  const previousStrapi = global.strapi;
  let mode = 'no-account';
  const routerHarness = createRouterHarness({ accounts: [] });
  const h = createInterceptionHarness({
    routerSend: async (payload, options) => {
      if (mode === 'no-account') return routerHarness.router.send(payload, options);
      const error = new Error('provider rejected');
      error.code = 'EENVELOPE';
      throw error;
    },
  });
  global.strapi = h.fakeStrapi;
  const bootstrap = require('../server/src/bootstrap');
  const destroy = require('../server/src/destroy');
  try {
    await bootstrap({ strapi: h.fakeStrapi });
    const options = { to: 'u@example.test', subject: 'Welcome', text: 'Hello' };
    const result = await h.strapiEmailService.send(options);
    assert.equal(result.fallback, 'strapi-email-provider');
    assert.deepEqual(h.providerCalls, [options], 'the untouched original payload goes to the native provider');
    const fallbackLog = routerHarness.logUpdates.find((u) => u.data.deliveryStatus === 'sent');
    assert.equal(fallbackLog.data.accountName, 'strapi-email-provider');

    mode = 'provider-error';
    await assert.rejects(h.strapiEmailService.send(options), /provider rejected/);
    assert.equal(h.providerCalls.length, 1, 'a dispatch failure is surfaced, never re-sent natively');
  } finally {
    await destroy({ strapi: h.fakeStrapi });
    if (previousStrapi === undefined) delete global.strapi;
    else global.strapi = previousStrapi;
    restore();
  }
});

test('FUN-01: direct service callers get no silent fallback when no account exists', async () => {
  const restore = withEncryptionKey();
  try {
    const { router, logUpdates } = createRouterHarness({ accounts: [] });
    await assert.rejects(router.send(baseMail()), (error) => error.code === 'MAGIC_MAIL_NO_ACCOUNT');
    assert.ok(logUpdates.some((u) => u.data.deliveryStatus === 'failed'));
  } finally {
    restore();
  }
});

// ── Purge (SEC-10 / FUN-22 / STR-10) ──────────────────────────────────────

test('SEC-10: the sensitive-link purge pages by id and does not skip rows after deletes', async () => {
  const { purgeSensitiveLinkMappings } = require('../server/src/bootstrap');
  const { isSensitiveTrackingUrl } = require('../server/src/utils/tracking-url-policy');
  const sensitive = 'https://app.example.test/reset-password?code=abc';
  assert.equal(isSensitiveTrackingUrl(sensitive), true);
  let rows = Array.from({ length: 450 }, (_, i) => ({ id: i + 1, originalUrl: i % 2 === 0 ? sensitive : `https://shop.example.test/p/${i}` }));
  let flag = null;
  const fakeStrapi = {
    store: () => ({ get: async () => flag, set: async ({ value }) => { flag = value; } }),
    db: {
      query: () => ({
        findMany: async ({ where, limit }) => rows.filter((r) => r.id > where.id.$gt).sort((a, b) => a.id - b.id).slice(0, limit),
        deleteMany: async ({ where }) => { rows = rows.filter((r) => !where.id.$in.includes(r.id)); },
      }),
    },
  };
  await purgeSensitiveLinkMappings(fakeStrapi, { info() {} });
  assert.equal(rows.some((r) => r.originalUrl === sensitive), false);
  assert.equal(rows.length, 225);
  assert.equal(flag.removed, 225);
});

// ── FUN-25 logger ──────────────────────────────────────────────────────────

test('FUN-25: plugin logger always forwards warnings and errors, without error messages', () => {
  const { createLogger } = require('../server/src/utils/logger');
  const { log, entries } = captureLog();
  const logger = createLogger({ log, config: { get: () => ({ debug: false }) } });
  logger.info('hidden');
  logger.debug('hidden');
  logger.warn('visible warning');
  const error = new Error('smtp said no to private@example.test');
  error.code = 'EAUTH';
  logger.error('[BOOTSTRAP] failed:', error);
  assert.deepEqual(entries.info, []);
  assert.deepEqual(entries.debug, []);
  assert.equal(entries.warn.length, 1);
  assert.equal(entries.error.length, 1);
  assert.match(entries.error[0], /Error \(EAUTH\)/);
  assert.doesNotMatch(entries.error[0], /private@example\.test/);
});

// ── Content-API auth and user attribution (SEC-M04) ────────────────────────

function createControllerHarness({ allowUserRoles = false, users = [] } = {}) {
  const sent = [];
  return {
    sent,
    strapi: {
      log: quietLog,
      config: { get: (key, fallback) => (key === 'plugin::magic-mail.contentApi.allowUserRoles' ? allowUserRoles : fallback) },
      db: { query: () => ({ findOne: async ({ where }) => users.find((u) => (where.id ? u.id === where.id : u.documentId === where.documentId)) || null }) },
      plugin: () => ({ service: () => ({ send: async (body, options) => { sent.push({ body, options }); return { accountUsed: 'x' }; } }) }),
    },
  };
}

function controllerContext(body, strategy, user) {
  return { request: { body }, state: { auth: { strategy: { name: strategy } }, user } };
}

test('Content-API send routes accept API tokens only unless allowUserRoles is set', async () => {
  const previousStrapi = global.strapi;
  try {
    const h = createControllerHarness();
    global.strapi = h.strapi;
    const controller = require('../server/src/controllers/controller');

    await assert.rejects(controller.send(controllerContext(baseMail(), 'users-permissions', { id: 5 })), (e) => e.name === 'ForbiddenError');
    await assert.rejects(controller.send(controllerContext(baseMail(), undefined)), (e) => e.name === 'ForbiddenError');
    assert.equal(h.sent.length, 0);

    const ctx = controllerContext(baseMail(), 'api-token');
    await controller.send(ctx);
    assert.equal(ctx.body.success, true);
    assert.equal(h.sent[0].options.source, 'content-api');

    const allowed = createControllerHarness({ allowUserRoles: true });
    global.strapi = allowed.strapi;
    await controller.send(controllerContext({ ...baseMail(), userId: 99 }, 'users-permissions', { id: 5 }));
    assert.equal(allowed.sent[0].body.userId, 5, 'user-role sends are attributed to the caller');
  } finally {
    if (previousStrapi === undefined) delete global.strapi;
    else global.strapi = previousStrapi;
  }
});

test('SEC-M04: API-token sends can only attribute logs to existing users', async () => {
  const previousStrapi = global.strapi;
  try {
    const h = createControllerHarness({ users: [{ id: 7, documentId: 'abc123' }] });
    global.strapi = h.strapi;
    const controller = require('../server/src/controllers/controller');

    await assert.rejects(controller.send(controllerContext({ ...baseMail(), userId: 404 }, 'api-token')), (e) => e.name === 'ValidationError');
    await controller.send(controllerContext({ ...baseMail(), userId: 'abc123' }, 'api-token'));
    assert.equal(h.sent[0].body.userId, 7);
  } finally {
    if (previousStrapi === undefined) delete global.strapi;
    else global.strapi = previousStrapi;
  }
});

// ── SUP-09 template entity decoding ────────────────────────────────────────

test('SUP-09: template rendering keeps escaped literal text and decodes only Mustache tags', async () => {
  const designer = require('../server/src/services/email-designer')({ strapi: { log: quietLog } });
  designer.findByReferenceId = async () => ({
    isActive: true,
    name: 'Fixture',
    category: 'transactional',
    bodyHtml: '<p>Use &lt;b&gt; for bold, {{#show}}{{ name }}{{/show}} &amp; <a title="&quot;x&quot;">{{ link &amp;&amp; 1 }}</a></p>',
    bodyText: 'Tom &amp; Jerry {{ name }}',
    subject: 'Hi &amp; welcome {{ name }}',
  });
  const rendered = await designer.renderTemplate('1', { show: true, name: 'Ada', link: 'x' });
  assert.match(rendered.html, /Use &lt;b&gt; for bold/);
  assert.match(rendered.html, /title="&quot;x&quot;"/);
  assert.match(rendered.html, /Ada &amp;/);
  assert.equal(rendered.text, 'Tom & Jerry Ada');
  assert.equal(rendered.subject, 'Hi & welcome Ada');
});

// ── FUN-07 account test ────────────────────────────────────────────────────

test('FUN-07: testAccount sends through exactly the tested account', async () => {
  let call;
  const strapi = {
    log: quietLog,
    documents: () => ({ findOne: async () => ({ documentId: 'acc-1', name: 'Inactive', isActive: false, fromEmail: 'a@b.test', provider: 'smtp' }) }),
    plugin: () => ({ service: () => ({ send: async (data, options) => { call = { data, options }; return { success: true }; } }) }),
  };
  const manager = require('../server/src/services/account-manager')({ strapi });
  manager.resolveDocumentId = async () => 'acc-1';
  const result = await manager.testAccount('acc-1', 'r@example.test');
  assert.equal(result.success, true);
  assert.deepEqual(call.options, { accountDocumentId: 'acc-1', allowInactive: true, source: 'account-test' });
  assert.equal(call.data.accountName, undefined);
  assert.equal(call.data.from, undefined);
});
