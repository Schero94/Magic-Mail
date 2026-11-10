'use strict';

/**
 * Bounce monitoring: IMAP polling against a local fake IMAP server (real
 * protocol through imapflow), Gmail API and Microsoft Graph with mocked
 * fetch, log matching (outbox header, Message-ID, recipient), suppression
 * list, cursors, and per-account leases across "processes" on PostgreSQL
 * when MAGIC_MAIL_TEST_PG_URL is set. Synthetic data only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'synthetic-encryption-key-0123456789abcdef0123';

const { encryptCredentials } = require('../server/src/utils/encryption');
const { startFakeImap } = require('./helpers/fake-imap');
const createBounceMonitor = require('../server/src/services/bounce-monitor');

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', 'bounces', name), 'utf8');

const ACCOUNT_UID = 'plugin::magic-mail.email-account';
const LOG_UID = 'plugin::magic-mail.email-log';
const EVENT_UID = 'plugin::magic-mail.email-event';
const OUTBOX_UID = 'plugin::magic-mail.outbox-message';
const SUPPRESSED_UID = 'plugin::magic-mail.suppressed-recipient';

const quietLog = { info() {}, warn() {}, error() {}, debug() {} };

/** Matches the small subset of where clauses the service uses. */
function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
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
}

function table(rows) {
  let nextId = rows.length + 1;
  return {
    rows,
    findOne: async ({ where, orderBy } = {}) => {
      let list = rows.filter((r) => matches(r, where));
      if (orderBy?.sentAt === 'desc')
        list = list.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
      return list[0] || null;
    },
    findMany: async ({ where } = {}) => rows.filter((r) => matches(r, where)),
    count: async () => rows.length,
    create: async ({ data }) => {
      if (data.addressHash && rows.some((r) => r.addressHash === data.addressHash)) {
        throw new Error('unique');
      }
      const row = { id: nextId, documentId: `doc${nextId}`, ...data };
      nextId += 1;
      rows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => matches(r, where));
      if (row) Object.assign(row, data);
      return row;
    },
    delete: async ({ where }) => {
      const index = rows.findIndex((r) => matches(r, where));
      if (index !== -1) rows.splice(index, 1);
    },
    deleteMany: async ({ where }) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], where)) rows.splice(i, 1);
      return { count: before - rows.length };
    },
  };
}

function makeStrapi({ accounts = [], logs = [], outbox = [], settings = {}, connection } = {}) {
  const tables = {
    [ACCOUNT_UID]: table(accounts),
    [LOG_UID]: table(logs),
    [EVENT_UID]: table([]),
    [OUTBOX_UID]: table(outbox),
    [SUPPRESSED_UID]: table([]),
  };
  const events = [];
  const services = {};
  const strapi = {
    log: quietLog,
    eventHub: { emit: async (name, payload) => events.push({ name, payload }) },
    db: {
      query: (uid) => tables[uid],
      ...(connection ? { connection, dialect: { client: 'postgres' } } : {}),
    },
    documents: (uid) => ({
      update: async ({ documentId, data }) => tables[uid].update({ where: { documentId }, data }),
      create: async ({ data }) => tables[uid].create({ data }),
    }),
    plugin: () => ({ service: (name) => services[name] }),
  };
  services['plugin-settings'] = { getSettings: async () => ({ ...settings }) };
  services['email-router'] = {
    currentOAuthToken: async (_account, oauth) => oauth.accessToken,
  };
  services.oauth = {};
  const monitor = createBounceMonitor({ strapi });
  services['bounce-monitor'] = monitor;
  return { strapi, monitor, tables, events };
}

function imapAccount(port, extra = {}) {
  return {
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
      imap: { host: '127.0.0.1', port, secure: false, user: 'bounces@sender.example' },
      ...extra,
    },
    bounceMonitorState: null,
  };
}

/** The fake IMAP server speaks plain TCP; tests allow it without STARTTLS. */
function plainImapHook(monitor) {
  const { ImapFlow } = require('imapflow');
  monitor.setTestHooks({
    imap: (options) => new ImapFlow({ ...options, doSTARTTLS: false, tls: undefined }),
  });
}

test('IMAP: a Gmail-style bounce marks the matching log bounced and emits for Magic Link', async () => {
  const imap = await startFakeImap();
  try {
    const sentAt = new Date();
    const { monitor, tables, events } = makeStrapi({
      accounts: [imapAccount(imap.port)],
      logs: [
        {
          id: 1,
          documentId: 'log1',
          recipient: 'pool-user-1@nowhere.test',
          accountId: 'accImap',
          sentAt,
          messageIdLocal: 'a1b2c3d4e5f6a7b8c9d0e1f2',
          providerMessageId: 'a1b2c3d4e5f6a7b8c9d0e1f2@sender.example',
          deliveryStatus: 'sent',
        },
      ],
      settings: { suppressHardBounces: true },
    });
    plainImapHook(monitor);
    // First poll records the starting point; mail older than the cursor is
    // read through the initial look-back.
    imap.add(fixture('normal-mail.eml'));
    imap.add(fixture('gmail-address-not-found.eml'));
    imap.add(fixture('auto-reply.eml'));
    const account = tables[ACCOUNT_UID].rows[0];
    const result = await monitor.pollAccount(account);
    assert.equal(result.found, 1);
    assert.equal(result.bounced, 1);
    const log = tables[LOG_UID].rows[0];
    assert.equal(log.bounced, true);
    assert.equal(log.deliveryStatus, 'bounced');
    assert.equal(log.bounceReason, 'DNS_NXDOMAIN');
    assert.equal(log.bounceSource, 'mailbox');
    assert.equal(tables[EVENT_UID].rows.length, 1);
    assert.equal(tables[EVENT_UID].rows[0].type, 'bounce');
    assert.equal(tables[EVENT_UID].rows[0].metadata.match, 'message-id');
    assert.deepEqual(events, [
      {
        name: 'magic-mail.delivery.bounced',
        payload: {
          provider: 'mailbox',
          messageId: 'a1b2c3d4e5f6a7b8c9d0e1f2@sender.example',
          reasonCode: 'DNS_NXDOMAIN',
        },
      },
    ]);
    // Suppression list: hashed address, masked for display.
    assert.equal(tables[SUPPRESSED_UID].rows.length, 1);
    assert.equal(tables[SUPPRESSED_UID].rows[0].maskedAddress, 'p***@nowhere.test');
    assert.equal(await monitor.isSuppressed('Pool-User-1@nowhere.test'), true);
    assert.equal(await monitor.isSuppressed('someone@else.test'), false);

    // Cursor: a second poll only reads new mail and never records twice.
    assert.equal(account.bounceMonitorState.cursor.lastUid, 3);
    assert.equal(account.bounceMonitorState.lastStatus, 'ok');
    imap.add(fixture('soft-delayed.eml'));
    const second = await monitor.pollAccount(account);
    assert.equal(second.scanned, 1);
    assert.equal(second.found, 1);
    assert.equal(second.deferred, 1);
    assert.equal(tables[EVENT_UID].rows.length, 1, 'soft bounce of an unknown mail: no event row');
    assert.equal(account.bounceMonitorState.totalBounced, 1);
    assert.equal(account.bounceMonitorState.totalDeferred, 1);
  } finally {
    await imap.close();
  }
});

test('IMAP: the outbox header wins over the recipient match; moved to a folder when enabled', async () => {
  const imap = await startFakeImap();
  try {
    const { monitor, tables } = makeStrapi({
      accounts: [imapAccount(imap.port, { moveProcessed: true })],
      logs: [
        {
          id: 1,
          documentId: 'logOld',
          recipient: 'gone@receiver.example',
          accountId: 'accImap',
          sentAt: new Date(),
        },
        {
          id: 2,
          documentId: 'logQueued',
          recipient: 'gone@receiver.example',
          accountId: 'accImap',
          sentAt: new Date(Date.now() - 1000),
        },
      ],
      outbox: [{ id: 1, documentId: 'abcDEF123', emailLogDocumentId: 'logQueued' }],
    });
    plainImapHook(monitor);
    imap.add(fixture('exim-nonstandard.eml'));
    const account = tables[ACCOUNT_UID].rows[0];
    const result = await monitor.pollAccount(account);
    assert.equal(result.bounced, 1);
    assert.equal(tables[LOG_UID].rows.find((r) => r.documentId === 'logQueued').bounced, true);
    assert.equal(tables[LOG_UID].rows.find((r) => r.documentId === 'logOld').bounced, undefined);
    assert.equal(tables[EVENT_UID].rows[0].metadata.match, 'outbox');
    // imapflow resolves the folder path against the server's namespace.
    assert.match(imap.messages[0].folder, /(^|\/)Magic Mail\/Bounces$/);
  } finally {
    await imap.close();
  }
});

test('IMAP: only the recipient matches (weak match is flagged)', async () => {
  const imap = await startFakeImap();
  try {
    const { monitor, tables } = makeStrapi({
      accounts: [imapAccount(imap.port)],
      logs: [
        {
          id: 1,
          documentId: 'log1',
          recipient: 'nobody@receiver.example',
          accountId: 'accImap',
          sentAt: new Date(),
        },
      ],
    });
    plainImapHook(monitor);
    imap.add(fixture('postfix-user-unknown.eml'));
    await monitor.pollAccount(tables[ACCOUNT_UID].rows[0]);
    assert.equal(tables[EVENT_UID].rows[0].metadata.match, 'recipient');
    assert.equal(tables[LOG_UID].rows[0].bounceReason, 'SMTP_550_5_1_1');
  } finally {
    await imap.close();
  }
});

test('IMAP: wrong password is reported as AUTH_FAILED on the account, no secret in the state', async () => {
  const imap = await startFakeImap({ pass: 'another-pass' });
  try {
    const { monitor, tables } = makeStrapi({ accounts: [imapAccount(imap.port)] });
    plainImapHook(monitor);
    const account = tables[ACCOUNT_UID].rows[0];
    await assert.rejects(monitor.pollAccount(account), { code: 'AUTH_FAILED' });
    assert.equal(account.bounceMonitorState.lastStatus, 'error');
    assert.equal(account.bounceMonitorState.lastErrorCode, 'AUTH_FAILED');
    assert.doesNotMatch(JSON.stringify(account.bounceMonitorState), /synthetic-pass|smtp-secret/);
    await assert.rejects(monitor.pollAccount(account, { testOnly: true }), { code: 'AUTH_FAILED' });
  } finally {
    await imap.close();
  }
});

test('IMAP: test connection reports the message count without reading mail', async () => {
  const imap = await startFakeImap();
  try {
    const { monitor, tables } = makeStrapi({ accounts: [imapAccount(imap.port)] });
    plainImapHook(monitor);
    imap.add(fixture('normal-mail.eml'));
    const result = await monitor.pollAccount(tables[ACCOUNT_UID].rows[0], { testOnly: true });
    assert.deepEqual(result, { ok: true, exists: 1 });
    assert.equal(imap.commands.includes('UID'), false, 'no search or fetch');
  } finally {
    await imap.close();
  }
});

test('IMAP on Gmail: the initial look-back uses X-GM-RAW', async () => {
  const imap = await startFakeImap({ gmail: true });
  try {
    const { monitor, tables } = makeStrapi({ accounts: [imapAccount(imap.port)] });
    plainImapHook(monitor);
    imap.add(fixture('normal-mail.eml'));
    imap.add(fixture('gmail-address-not-found.eml'));
    const result = await monitor.pollAccount(tables[ACCOUNT_UID].rows[0]);
    assert.equal(result.scanned, 1, 'the server pre-filtered to the bounce');
    assert.equal(result.found, 1);
  } finally {
    await imap.close();
  }
});

function oauthAccount(provider, scope) {
  return {
    id: 1,
    documentId: provider === 'gmail-oauth' ? 'accGmail' : 'accGraph',
    provider,
    isActive: true,
    fromEmail: 'noreply@sender.example',
    config: encryptCredentials({ clientId: 'cid', clientSecret: 'cs', tenantId: 'common' }),
    oauth: encryptCredentials({ accessToken: 'synthetic-token', refreshToken: 'r', scope }),
    bounceMonitor: { enabled: true },
    bounceMonitorState: null,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => Buffer.from(String(body)),
  };
}

test('Gmail API: without the read scope the account asks for consent, sending is untouched', async () => {
  const { monitor, tables } = makeStrapi({
    accounts: [oauthAccount('gmail-oauth', 'https://www.googleapis.com/auth/gmail.send openid')],
  });
  const account = tables[ACCOUNT_UID].rows[0];
  assert.equal(monitor.hasReadScope(account), false);
  await assert.rejects(monitor.pollAccount(account), { code: 'NEEDS_CONSENT' });
  assert.equal(account.bounceMonitorState.lastStatus, 'needs_consent');
});

test('Gmail API: full sync, then history; bounces recorded, other mail only read as metadata', async () => {
  const raw = Buffer.from(fixture('gmail-address-not-found.eml')).toString('base64url');
  const calls = [];
  const { monitor, tables } = makeStrapi({
    accounts: [
      oauthAccount(
        'gmail-oauth',
        'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly'
      ),
    ],
    logs: [
      {
        id: 1,
        documentId: 'log1',
        messageIdLocal: 'a1b2c3d4e5f6a7b8c9d0e1f2',
        recipient: 'x',
        sentAt: new Date(),
      },
    ],
  });
  monitor.setTestHooks({
    fetch: async (url) => {
      calls.push(url.replace('https://gmail.googleapis.com/gmail/v1/users/me', ''));
      if (url.endsWith('/profile')) return jsonResponse({ historyId: '100', messagesTotal: 5 });
      if (url.includes('/messages?'))
        return jsonResponse({ messages: [{ id: 'm1' }, { id: 'm2' }] });
      if (url.includes('/history?')) return jsonResponse({ history: [], historyId: '120' });
      if (url.includes('/messages/m1?format=metadata')) {
        return jsonResponse({
          sizeEstimate: 2000,
          payload: {
            headers: [
              { name: 'From', value: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' },
              { name: 'Content-Type', value: 'multipart/report; report-type=delivery-status' },
            ],
          },
        });
      }
      if (url.includes('/messages/m2?format=metadata')) {
        return jsonResponse({
          sizeEstimate: 500,
          payload: {
            headers: [
              { name: 'From', value: 'kunde@receiver.example' },
              { name: 'Subject', value: 'Frage' },
            ],
          },
        });
      }
      if (url.includes('/messages/m1?format=raw')) return jsonResponse({ raw });
      return jsonResponse({}, 404);
    },
  });
  const account = tables[ACCOUNT_UID].rows[0];
  const first = await monitor.pollAccount(account);
  assert.equal(first.found, 1);
  assert.equal(tables[LOG_UID].rows[0].bounced, true);
  assert.ok(!calls.some((c) => c.includes('m2?format=raw')), 'normal mail is never downloaded');
  assert.deepEqual(account.bounceMonitorState.cursor, { mode: 'gmail', historyId: '100' });
  const second = await monitor.pollAccount(account);
  assert.equal(second.scanned, 0);
  assert.equal(account.bounceMonitorState.cursor.historyId, '120');
});

test('Gmail API: an expired history id falls back to a full sync', async () => {
  const { monitor, tables } = makeStrapi({
    accounts: [oauthAccount('gmail-oauth', 'https://www.googleapis.com/auth/gmail.readonly')],
  });
  const account = tables[ACCOUNT_UID].rows[0];
  account.bounceMonitorState = { cursor: { mode: 'gmail', historyId: '5' } };
  let fullSync = false;
  monitor.setTestHooks({
    fetch: async (url) => {
      if (url.endsWith('/profile')) return jsonResponse({ historyId: '900' });
      if (url.includes('/history?')) return jsonResponse({}, 404);
      if (url.includes('/messages?')) {
        fullSync = true;
        return jsonResponse({ messages: [] });
      }
      return jsonResponse({}, 404);
    },
  });
  await monitor.pollAccount(account);
  assert.equal(fullSync, true);
  assert.equal(account.bounceMonitorState.cursor.historyId, '900');
});

test('Microsoft Graph: Inbox since the cursor, MIME of bounces only', async () => {
  const mime = fixture('outlook-ndr.eml');
  const downloads = [];
  const { monitor, tables } = makeStrapi({
    accounts: [oauthAccount('microsoft-oauth', 'Mail.Send Mail.Read User.Read')],
    logs: [
      {
        id: 1,
        documentId: 'log1',
        providerMessageId: '0123456789abcdef01234567@contoso.example',
        sentAt: new Date(),
      },
    ],
  });
  monitor.setTestHooks({
    fetch: async (url) => {
      if (url.includes('/$value')) {
        downloads.push(url);
        return {
          ok: true,
          status: 200,
          headers: { get: () => String(mime.length) },
          arrayBuffer: async () => Buffer.from(mime),
        };
      }
      if (url.includes('/mailFolders/inbox/messages')) {
        return jsonResponse({
          value: [
            {
              id: 'n1',
              receivedDateTime: '2026-11-10T08:00:00Z',
              from: {
                emailAddress: {
                  name: 'Microsoft Outlook',
                  address: 'postmaster@contoso.onmicrosoft.com',
                },
              },
              subject: 'Undeliverable: Invoice',
            },
            {
              id: 'n2',
              receivedDateTime: '2026-11-10T08:05:00Z',
              from: { emailAddress: { name: 'Kunde', address: 'kunde@receiver.example' } },
              subject: 'Frage',
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    },
  });
  const account = tables[ACCOUNT_UID].rows[0];
  const result = await monitor.pollAccount(account);
  assert.equal(result.found, 1);
  assert.equal(downloads.length, 1);
  assert.equal(tables[LOG_UID].rows[0].bounced, true);
  assert.equal(account.bounceMonitorState.cursor.since, '2026-11-10T08:05:00Z');
});

test('SendGrid and Mailgun accounts have no mailbox mode', async () => {
  const { monitor } = makeStrapi();
  assert.deepEqual(monitor.MODES.sendgrid, []);
  await assert.rejects(
    monitor.pollAccount({ provider: 'mailgun', bounceMonitor: { enabled: true } }),
    { code: 'UNSUPPORTED' }
  );
});

test('IMAP host suggestion from the SMTP host', () => {
  const { suggestImapHost } = createBounceMonitor;
  assert.equal(suggestImapHost('smtp.gmail.com'), 'imap.gmail.com');
  assert.equal(suggestImapHost('smtp.office365.com'), 'outlook.office365.com');
  assert.equal(suggestImapHost('mail.example.org'), 'imap.example.org');
  assert.equal(suggestImapHost(''), '');
});

const PG_URL = process.env.MAGIC_MAIL_TEST_PG_URL;

test(
  'one poll per account across 8 processes on PostgreSQL (database lease)',
  { skip: PG_URL ? false : 'MAGIC_MAIL_TEST_PG_URL not set' },
  async () => {
    const knexFactory = require('knex');
    const imap = await startFakeImap();
    const processes = [];
    try {
      imap.add(fixture('gmail-address-not-found.eml'));
      for (let i = 0; i < 8; i += 1) {
        const connection = knexFactory({
          client: 'pg',
          connection: PG_URL,
          pool: { min: 0, max: 2 },
        });
        const ctx = makeStrapi({ accounts: [imapAccount(imap.port, {})], connection });
        ctx.tables[ACCOUNT_UID].rows[0].documentId = `accLease${process.pid}`;
        plainImapHook(ctx.monitor);
        processes.push({ ctx, connection });
      }
      // Clear a lease left by an earlier run.
      await processes[0].connection
        .raw("delete from magic_mail_claims where claim_key like 'job:bounce-poll:%'")
        .catch(() => {});
      const results = await Promise.all(processes.map(({ ctx }) => ctx.monitor.tick()));
      const polled = results.reduce((sum, r) => sum + r.polled, 0);
      assert.equal(polled, 1, 'exactly one process polled the account');
      assert.equal(imap.logins, 1, 'one IMAP login in total');
    } finally {
      await imap.close();
      await Promise.all(processes.map(({ connection }) => connection.destroy()));
    }
  }
);
