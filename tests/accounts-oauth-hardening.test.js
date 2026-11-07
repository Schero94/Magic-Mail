'use strict';

/**
 * Behavioural tests for account, OAuth, key-management and route hardening.
 * Synthetic data only: no network, no providers, no real credentials.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/** Runs `fn` with temporary env values, restoring them afterwards. */
async function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const KEY = 'k'.repeat(32);

/**
 * Minimal in-memory Document Service for accounts and routing rules.
 */
function makeStrapi({ accounts = [], rules = [], extra = {} } = {}) {
  const tables = {
    'plugin::magic-mail.email-account': accounts,
    'plugin::magic-mail.routing-rule': rules,
  };
  const calls = [];
  const matches = (row, filters = {}) =>
    Object.entries(filters).every(([key, cond]) => {
      if (key === '$or') return cond.some((sub) => matches(row, sub));
      if (cond && typeof cond === 'object' && '$eqi' in cond) {
        return String(row[key] || '').toLowerCase() === String(cond.$eqi).toLowerCase();
      }
      return row[key] === cond;
    });
  const strapi = {
    log: quietLog,
    calls,
    documents: (uid) => {
      const table = tables[uid] || [];
      return {
        findOne: async ({ documentId }) =>
          table.find((row) => row.documentId === documentId) || null,
        findMany: async ({ filters } = {}) => table.filter((row) => matches(row, filters)),
        create: async ({ data }) => {
          const row = { documentId: `d${table.length + 1}`, ...data };
          table.push(row);
          return row;
        },
        update: async ({ documentId, data }) => {
          calls.push({ uid, op: 'update', documentId, data });
          const row = table.find((r) => r.documentId === documentId);
          Object.assign(row, data);
          return { ...row };
        },
        delete: async ({ documentId }) => {
          calls.push({ uid, op: 'delete', documentId });
          const index = table.findIndex((r) => r.documentId === documentId);
          if (index >= 0) table.splice(index, 1);
        },
      };
    },
    ...extra,
  };
  return strapi;
}

// ── SEC-04 / SUP-06 / SUP-M02: secret masking and merge ──────────────────────

test('SEC-04: changing the SMTP host with a masked or omitted password requires re-entering it', async () => {
  await withEnv({ MAGIC_MAIL_ENCRYPTION_KEY: KEY }, async () => {
    const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');
    const account = {
      documentId: 'acc1',
      name: 'Main',
      provider: 'smtp',
      config: encryptCredentials({
        host: 'smtp.example.test',
        port: 587,
        user: 'mailer',
        pass: 'synthetic-password',
      }),
    };
    const strapi = makeStrapi({ accounts: [account] });
    const manager = require('../server/src/services/account-manager')({ strapi });
    const mask = manager.SECRET_MASK;

    await assert.rejects(
      manager.updateAccount('acc1', {
        config: { host: 'smtp.attacker.test', port: 587, user: 'mailer', pass: mask },
      }),
      (err) => err.name === 'ValidationError' && /pass/.test(err.message)
    );
    await assert.rejects(
      manager.updateAccount('acc1', { config: { host: 'smtp.attacker.test' } }),
      (err) => err.name === 'ValidationError' && /pass/.test(err.message)
    );
    await assert.rejects(
      manager.updateAccount('acc1', {
        config: { host: 'smtp.example.test', user: 'other-user', pass: mask },
      }),
      (err) => err.name === 'ValidationError'
    );
    // Stored secret is untouched after the rejected attempts.
    assert.equal(decryptCredentials(account.config).pass, 'synthetic-password');

    // Same endpoint: the mask keeps the stored secret.
    await manager.updateAccount('acc1', {
      config: { host: 'SMTP.example.test', port: 587, user: 'mailer', pass: mask },
    });
    assert.equal(decryptCredentials(account.config).pass, 'synthetic-password');

    // New host with a new password is fine.
    await manager.updateAccount('acc1', {
      config: { host: 'smtp2.example.test', port: 587, user: 'mailer', pass: 'new-synthetic' },
    });
    const stored = decryptCredentials(account.config);
    assert.equal(stored.host, 'smtp2.example.test');
    assert.equal(stored.pass, 'new-synthetic');
  });
});

test('SEC-04: provider change, OAuth client change and nested DKIM masks are enforced', async () => {
  await withEnv({ MAGIC_MAIL_ENCRYPTION_KEY: KEY }, async () => {
    const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');
    const accounts = [
      {
        documentId: 'o1',
        name: 'OAuth',
        provider: 'gmail-oauth',
        config: encryptCredentials({ clientId: 'client-a', clientSecret: 'secret-a' }),
      },
      {
        documentId: 's1',
        name: 'Smtp',
        provider: 'smtp',
        config: encryptCredentials({
          host: 'h.example.test',
          user: 'u',
          pass: 'p-synthetic',
          dkim: { privateKey: 'synthetic-key', selector: 's1' },
        }),
      },
    ];
    const manager = require('../server/src/services/account-manager')({
      strapi: makeStrapi({ accounts }),
    });
    const mask = manager.SECRET_MASK;

    await assert.rejects(
      manager.updateAccount('o1', { config: { clientId: 'client-b', clientSecret: mask } }),
      /clientSecret/
    );
    await assert.rejects(
      manager.updateAccount('s1', { provider: 'sendgrid' }),
      (err) => err.name === 'ValidationError'
    );
    await assert.rejects(
      manager.updateAccount('s1', { provider: 'sendgrid', config: { apiKey: mask } }),
      /apiKey/
    );

    await manager.updateAccount('s1', {
      config: {
        host: 'h.example.test',
        user: 'u',
        pass: mask,
        dkim: { privateKey: mask, selector: 's2' },
      },
    });
    const stored = decryptCredentials(accounts[1].config);
    assert.equal(stored.dkim.privateKey, 'synthetic-key');
    assert.equal(stored.dkim.selector, 's2');

    await assert.rejects(
      manager.updateAccount('s1', {
        config: { host: 'evil.example.test', pass: 'new', dkim: { privateKey: mask } },
      }),
      /dkim\.privateKey/
    );

    // Provider change with fresh secrets drops every old config key.
    await manager.updateAccount('s1', { provider: 'sendgrid', config: { apiKey: 'SG.synthetic' } });
    assert.deepEqual(decryptCredentials(accounts[1].config), { apiKey: 'SG.synthetic' });
  });
});

test('SUP-06/SUP-M02: the edit DTO never contains a part of a secret or the crypto error', async () => {
  await withEnv({ MAGIC_MAIL_ENCRYPTION_KEY: KEY }, async () => {
    const { encryptCredentials } = require('../server/src/utils/encryption');
    const accounts = [
      {
        documentId: 'a1',
        name: 'A',
        provider: 'smtp',
        config: encryptCredentials({ host: 'h.example.test', user: 'u', pass: 'abcdef123456' }),
      },
      {
        documentId: 'a2',
        name: 'B',
        provider: 'smtp',
        config: { encrypted: `v1:${'0'.repeat(24)}:${'0'.repeat(32)}:abcd` },
      },
    ];
    const manager = require('../server/src/services/account-manager')({
      strapi: makeStrapi({ accounts }),
    });

    const dto = await manager.getAccountForDisplay('a1');
    assert.equal(dto.config.pass, manager.SECRET_MASK);
    assert.equal(dto.config.host, 'h.example.test');
    assert.doesNotMatch(JSON.stringify(dto), /3456|abcdef/);

    const broken = await manager.getAccountForDisplay('a2');
    assert.equal(broken.credentialsUnreadable, true);
    assert.equal(broken.credentialsUnreadableReason, 'KEY_MISMATCH');
    assert.deepEqual(broken.config, {});

    // A real secret that merely starts with asterisks is stored, not treated as a mask.
    await manager.updateAccount('a1', {
      config: { host: 'h.example.test', user: 'u', pass: '****abcd-real' },
    });
    const { decryptCredentials } = require('../server/src/utils/encryption');
    assert.equal(decryptCredentials(accounts[0].config).pass, '****abcd-real');

    // Unreadable stored config: a mask can not be kept.
    await assert.rejects(
      manager.updateAccount('a2', {
        config: { host: 'h.example.test', pass: manager.SECRET_MASK },
      }),
      /pass/
    );
  });
});

test('FUN-16: update clears Reply-To/description and keeps unlimited (0) quotas', async () => {
  await withEnv({ MAGIC_MAIL_ENCRYPTION_KEY: KEY }, async () => {
    const { validate } = require('../server/src/validation');
    const accounts = [
      {
        documentId: 'a1',
        name: 'A',
        provider: 'smtp',
        replyTo: 'old@example.test',
        description: 'x',
        dailyLimit: 0,
        hourlyLimit: 0,
      },
    ];
    const strapi = makeStrapi({ accounts });
    const manager = require('../server/src/services/account-manager')({ strapi });

    const body = validate('accounts.update', {
      replyTo: '',
      description: '',
      dailyLimit: 0,
      hourlyLimit: 0,
    });
    await manager.updateAccount('a1', body);
    const update = strapi.calls.find((call) => call.op === 'update');
    assert.equal(update.data.replyTo, null);
    assert.equal(update.data.description, null);
    assert.equal(update.data.dailyLimit, 0);
    assert.equal(update.data.hourlyLimit, 0);
    assert.equal('name' in update.data, false, 'omitted fields are not written');
  });
});

test('UI-M04: renaming an account updates routing rules, deleting it deactivates them', async () => {
  const accounts = [{ documentId: 'a1', name: 'Marketing', provider: 'sendgrid' }];
  const rules = [
    {
      documentId: 'r1',
      name: 'R1',
      accountName: 'marketing',
      fallbackAccountName: null,
      isActive: true,
    },
    {
      documentId: 'r2',
      name: 'R2',
      accountName: 'Other',
      fallbackAccountName: 'Marketing',
      isActive: true,
    },
    {
      documentId: 'r3',
      name: 'R3',
      accountName: 'Other',
      fallbackAccountName: null,
      isActive: true,
    },
  ];
  const manager = require('../server/src/services/account-manager')({
    strapi: makeStrapi({ accounts, rules }),
  });

  await manager.updateAccount('a1', { name: 'Newsletter' });
  assert.equal(rules[0].accountName, 'Newsletter');
  assert.equal(rules[1].fallbackAccountName, 'Newsletter');
  assert.equal(rules[2].accountName, 'Other');

  const result = await manager.deleteAccount('a1');
  assert.deepEqual(result, { deactivatedRules: 1, clearedFallbacks: 1 });
  assert.equal(rules[0].isActive, false);
  assert.equal(rules[1].fallbackAccountName, null);
  assert.equal(rules[1].isActive, true);
  await assert.rejects(manager.deleteAccount('a1'), (err) => err.name === 'NotFoundError');
});

test('SEC-12/SEC-13: account test returns a fixed message instead of the transport error', async () => {
  const transportError = Object.assign(
    new Error('connect ECONNREFUSED 10.1.2.3:2525 user@internal.test'),
    { code: 'ESOCKET' }
  );
  const strapi = {
    log: quietLog,
    documents: () => ({
      findOne: async () => ({
        documentId: 'a1',
        name: 'A',
        provider: 'smtp',
        fromEmail: 'a@example.test',
      }),
    }),
    plugin: () => ({
      service: () => ({
        send: async () => {
          throw transportError;
        },
      }),
    }),
  };
  const manager = require('../server/src/services/account-manager')({ strapi });
  manager.resolveDocumentId = async () => 'a1';
  const result = await manager.testAccount('a1', 'r@example.test');
  assert.equal(result.success, false);
  assert.doesNotMatch(result.message, /10\.1\.2\.3|2525|internal\.test/);
  assert.match(result.message, /connect/i);

  const { toClientSendMessage } = require('../server/src/utils/client-errors');
  assert.match(
    toClientSendMessage(Object.assign(new Error('535 auth failed for x@y'), { code: 'EAUTH' })),
    /credentials/
  );
  assert.equal(
    toClientSendMessage(new Error('SendGrid API request failed: 401')),
    'SendGrid API request failed: 401'
  );
  assert.equal(
    toClientSendMessage(
      Object.assign(new Error('Mailgun domain is not a valid host name'), {
        code: 'MAGIC_MAIL_ACCOUNT_CONFIG',
      })
    ),
    'Mailgun domain is not a valid host name'
  );
  assert.match(toClientSendMessage(new Error('weird internal 192.168.0.1')), /server log/);
});

// ── SEC-09: key management ──────────────────────────────────────────────────

test('SEC-09: credentials use a versioned HKDF format, legacy blobs still decrypt, rotation works', async () => {
  const encryption = require('../server/src/utils/encryption');

  await withEnv(
    {
      MAGIC_MAIL_ENCRYPTION_KEY: KEY,
      MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS: undefined,
      NODE_ENV: 'production',
    },
    async () => {
      const blob = encryption.encryptCredentials({ pass: 'synthetic' });
      const parts = blob.encrypted.split(':');
      assert.equal(parts[0], 'v1');
      assert.equal(parts[1].length, 24, '12-byte GCM IV');
      assert.equal(encryption.isLegacyCiphertext(blob), false);
      assert.deepEqual(encryption.decryptCredentials(blob), { pass: 'synthetic' });

      // Legacy 3.x format: iv16:tag:ct with sha256(key) as AES key.
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        crypto.createHash('sha256').update(KEY).digest(),
        iv
      );
      const ct = Buffer.concat([
        cipher.update(JSON.stringify({ pass: 'legacy' }), 'utf8'),
        cipher.final(),
      ]);
      const legacy = {
        encrypted: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`,
      };
      assert.equal(encryption.isLegacyCiphertext(legacy), true);
      assert.deepEqual(encryption.decryptCredentials(legacy), { pass: 'legacy' });

      // Rotation: new key + previous key decrypts old blobs.
      await withEnv(
        { MAGIC_MAIL_ENCRYPTION_KEY: 'n'.repeat(32), MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS: KEY },
        async () => {
          assert.deepEqual(encryption.decryptCredentials(blob), { pass: 'synthetic' });
          assert.deepEqual(encryption.decryptCredentials(legacy), { pass: 'legacy' });
        }
      );
      await withEnv(
        {
          MAGIC_MAIL_ENCRYPTION_KEY: 'n'.repeat(32),
          MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS: undefined,
        },
        async () => {
          assert.throws(() => encryption.decryptCredentials(blob), /could not be decrypted/);
        }
      );
    }
  );
});

test('SEC-09: no derived key outside development/test and no constant fallback', async () => {
  const encryption = require('../server/src/utils/encryption');
  await withEnv(
    {
      MAGIC_MAIL_ENCRYPTION_KEY: undefined,
      NODE_ENV: 'staging',
      ADMIN_JWT_SECRET: 'synthetic-admin-secret',
    },
    async () => {
      assert.throws(
        () => encryption.encryptCredentials({ a: 1 }),
        /MAGIC_MAIL_ENCRYPTION_KEY is required/
      );
    }
  );
  await withEnv(
    {
      MAGIC_MAIL_ENCRYPTION_KEY: undefined,
      NODE_ENV: 'development',
      ADMIN_JWT_SECRET: undefined,
      APP_KEYS: undefined,
    },
    async () => {
      assert.throws(() => encryption.encryptCredentials({ a: 1 }), /no ADMIN_JWT_SECRET\/APP_KEYS/);
    }
  );
  await withEnv(
    {
      MAGIC_MAIL_ENCRYPTION_KEY: undefined,
      NODE_ENV: 'development',
      ADMIN_JWT_SECRET: 'synthetic-admin-secret',
    },
    async () => {
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        const blob = encryption.encryptCredentials({ a: 1 });
        assert.deepEqual(encryption.decryptCredentials(blob), { a: 1 });
      } finally {
        console.warn = originalWarn;
      }
    }
  );
});

// ── OAuth state: SEC-16 / FUN-26 / SUP-M01 ───────────────────────────────────

function makeStore() {
  const values = new Map();
  return {
    values,
    strapi: {
      log: quietLog,
      store: () => ({
        get: async ({ key }) => values.get(key),
        set: async ({ key, value }) => {
          values.set(key, value);
        },
        delete: async ({ key }) => {
          values.delete(key);
        },
      }),
    },
  };
}

test('SUP-M01: OAuth state is bound to the initiating admin and to the reconnected account', async () => {
  await withEnv({ MAGIC_MAIL_OAUTH_STATE_SECRET: 's'.repeat(32) }, async () => {
    const { createState, verifyAndConsumeState } = require('../server/src/utils/oauth-state');
    const { strapi } = makeStore();

    const first = await createState(strapi, { clientId: 'c', provider: 'gmail', userId: 7 });
    await assert.rejects(
      verifyAndConsumeState(strapi, first.state, { clientId: 'c', userId: 8 }),
      /another admin/
    );
    // The failed attempt did not consume the flow; the right admin succeeds once.
    const ok = await verifyAndConsumeState(strapi, first.state, { clientId: 'c', userId: '7' });
    assert.ok(ok.codeVerifier);
    await assert.rejects(
      verifyAndConsumeState(strapi, first.state, { clientId: 'c', userId: 7 }),
      /already used/
    );

    const reconnect = await createState(strapi, {
      clientId: 'c',
      provider: 'gmail',
      userId: 7,
      accountId: 'acc1',
    });
    await assert.rejects(
      verifyAndConsumeState(strapi, reconnect.state, { clientId: 'c', userId: 7, accountId: null }),
      /another account/
    );
    await verifyAndConsumeState(strapi, reconnect.state, {
      clientId: 'c',
      userId: 7,
      accountId: 'acc1',
    });
  });
});

test('SEC-16/FUN-26: abandoned flows are pruned from one store entry and legacy rows are removed', async () => {
  await withEnv({ MAGIC_MAIL_OAUTH_STATE_SECRET: 's'.repeat(32) }, async () => {
    const stateModule = require('../server/src/utils/oauth-state');
    const { strapi, values } = makeStore();
    let legacyDelete = null;
    strapi.db = {
      query: () => ({
        deleteMany: async (args) => {
          legacyDelete = args;
        },
      }),
    };
    stateModule.resetLegacyCleanupForTests();

    const realNow = Date.now;
    try {
      Date.now = () => realNow() - stateModule.STATE_TTL_MS - 60_000;
      await stateModule.createState(strapi, { clientId: 'c', provider: 'gmail', userId: 1 });
      await stateModule.createState(strapi, { clientId: 'c', provider: 'gmail', userId: 1 });
    } finally {
      Date.now = realNow;
    }
    assert.equal(Object.keys(values.get(stateModule.PENDING_STORE_KEY)).length, 2);

    const fresh = await stateModule.createState(strapi, {
      clientId: 'c',
      provider: 'gmail',
      userId: 1,
    });
    const pending = values.get(stateModule.PENDING_STORE_KEY);
    assert.equal(Object.keys(pending).length, 1, 'expired flows are pruned on create');
    assert.equal([...values.keys()].filter((key) => key.startsWith('oauth:pkce:')).length, 0);
    assert.match(legacyDelete.where.key.$startsWith, /^plugin_magic-mail_oauth:pkce:/);

    // Many concurrent flows for different nonces are all recorded (no lost update).
    const many = await Promise.all(
      Array.from({ length: 20 }, () =>
        stateModule.createState(strapi, { clientId: 'c', provider: 'gmail', userId: 1 })
      )
    );
    const consumed = await Promise.all(
      many.map((flow) =>
        stateModule.verifyAndConsumeState(strapi, flow.state, { clientId: 'c', userId: 1 })
      )
    );
    assert.equal(consumed.length, 20);
    assert.deepEqual(Object.keys(values.get(stateModule.PENDING_STORE_KEY)), [
      Object.keys(pending)[0],
    ]);
    await stateModule.verifyAndConsumeState(strapi, fresh.state, { clientId: 'c', userId: 1 });
  });
});

// ── OAuth service: SUP-07 / STR-05 / FUN-15 / SEC-12 ─────────────────────────

test('SUP-07/STR-05: redirect URI comes from server.absoluteUrl; production never uses localhost', async () => {
  const configFor = (absoluteUrl) => ({
    log: quietLog,
    config: { get: (key) => (key === 'server.absoluteUrl' ? absoluteUrl : undefined) },
  });

  await withEnv({ URL: undefined, NODE_ENV: 'production' }, async () => {
    const oauth = require('../server/src/services/oauth')({
      strapi: configFor('https://cms.example.test/'),
    });
    assert.equal(
      oauth.getRedirectUri('gmail'),
      'https://cms.example.test/magic-mail/oauth/gmail/callback'
    );
    const authUrl = new URL(oauth.getGmailAuthUrl('client', 'state'));
    assert.equal(
      authUrl.searchParams.get('redirect_uri'),
      'https://cms.example.test/magic-mail/oauth/gmail/callback'
    );

    const local = require('../server/src/services/oauth')({
      strapi: configFor('http://localhost:1337'),
    });
    assert.throws(() => local.getRedirectUri('gmail'), /public https URL/);
  });
  await withEnv({ URL: 'https://legacy.example.test', NODE_ENV: 'production' }, async () => {
    const oauth = require('../server/src/services/oauth')({
      strapi: configFor('https://cms.example.test'),
    });
    assert.equal(
      oauth.getRedirectUri('yahoo'),
      'https://legacy.example.test/magic-mail/oauth/yahoo/callback'
    );
  });
  await withEnv({ URL: undefined, NODE_ENV: 'development' }, async () => {
    const oauth = require('../server/src/services/oauth')({ strapi: configFor(undefined) });
    assert.equal(
      oauth.getRedirectUri('microsoft'),
      'http://localhost:1337/magic-mail/oauth/microsoft/callback'
    );
  });
});

test('SEC-12: Microsoft tenant ids can not alter the login URL path', async () => {
  await withEnv({ NODE_ENV: 'development', URL: undefined }, async () => {
    const oauth = require('../server/src/services/oauth')({ strapi: { log: quietLog } });
    const url = new URL(oauth.getMicrosoftAuthUrl('client', 'contoso.onmicrosoft.com', 'state'));
    assert.equal(url.pathname, '/contoso.onmicrosoft.com/oauth2/v2.0/authorize');
    for (const bad of ['../evil', 'common/oauth2?x=', 'a b', '%2e%2e', '']) {
      assert.throws(() => oauth.getMicrosoftAuthUrl('client', bad, 'state'), /tenant/i);
    }
    const { validate } = require('../server/src/validation');
    assert.throws(() => validate('oauth.auth', { clientId: 'c', tenantId: '../x' }));
    assert.equal(validate('oauth.auth', { clientId: 'c', tenantId: 'common' }).tenantId, 'common');
  });
});

test('FUN-15: refreshes return rotated refresh tokens and the stored blob keeps the old one otherwise', async () => {
  await withEnv({ MAGIC_MAIL_ENCRYPTION_KEY: KEY }, async () => {
    const oauth = require('../server/src/services/oauth')({ strapi: { log: quietLog } });
    const previousFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'synthetic-at',
          refresh_token: 'synthetic-rt2',
          expires_in: 60,
        }),
      });
      const ms = await oauth.refreshMicrosoftTokens('rt1', 'c', 's', 'common');
      assert.equal(ms.refreshToken, 'synthetic-rt2');
      const yahoo = await oauth.refreshYahooTokens('rt1', 'c', 's');
      assert.equal(yahoo.refreshToken, 'synthetic-rt2');

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'synthetic-at' }),
      });
      const gmail = await oauth.refreshGmailTokens('rt1', 'c', 's');
      assert.equal(gmail.refreshToken, undefined);

      global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
      await assert.rejects(oauth.refreshGmailTokens('rt1', 'c', 's'), /No access token/);
    } finally {
      global.fetch = previousFetch;
    }

    const { decryptCredentials } = require('../server/src/utils/encryption');
    const kept = decryptCredentials(
      oauth.buildOAuthBlob(
        { email: 'a@example.test', refreshToken: 'old' },
        { accessToken: 'new', expiresAt: 'x' }
      )
    );
    assert.equal(kept.refreshToken, 'old');
    const rotated = decryptCredentials(
      oauth.buildOAuthBlob(
        { refreshToken: 'old' },
        { accessToken: 'new', refreshToken: 'rotated', expiresAt: 'x' }
      )
    );
    assert.equal(rotated.refreshToken, 'rotated');
  });
});

test("FUN-15/SUP-M01: reconnect updates only the same mailbox; create rejects another admin's state", async () => {
  await withEnv(
    {
      MAGIC_MAIL_ENCRYPTION_KEY: KEY,
      MAGIC_MAIL_OAUTH_STATE_SECRET: 's'.repeat(32),
      NODE_ENV: 'development',
      URL: undefined,
    },
    async () => {
      const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');
      const { createState } = require('../server/src/utils/oauth-state');
      const store = makeStore();
      const account = {
        documentId: 'acc1',
        name: 'Gmail',
        provider: 'gmail-oauth',
        fromEmail: 'box@example.test',
        config: encryptCredentials({ clientId: 'client-1', clientSecret: 'secret-1' }),
        oauth: encryptCredentials({ accessToken: 'old', refreshToken: 'old-rt' }),
      };
      const base = makeStrapi({ accounts: [account] });
      const oauthServiceFactory = require('../server/src/services/oauth');
      let exchangeResult = {
        email: 'Box@Example.test',
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        expiresAt: new Date(),
      };
      let oauthService;
      global.strapi = {
        ...base,
        store: store.strapi.store,
        plugin: () => ({ service: () => oauthService }),
      };
      oauthService = oauthServiceFactory({ strapi: global.strapi });
      oauthService.exchangeCode = async () => exchangeResult;
      const controller = require('../server/src/controllers/oauth');

      try {
        // auth with accountId uses the stored client id and returns the redirect URI
        const authCtx = {
          query: { accountId: 'acc1' },
          state: { user: { id: 5 } },
          badRequest(m) {
            this.status = 400;
            this.body = m;
          },
        };
        await controller.gmailAuth(authCtx);
        assert.match(authCtx.body.authUrl, /client_id=client-1/);
        assert.equal(
          authCtx.body.redirectUri,
          'http://localhost:1337/magic-mail/oauth/gmail/callback'
        );
        const state = new URL(authCtx.body.authUrl).searchParams.get('state');

        const ctx = {
          params: { accountId: 'acc1' },
          request: { body: { provider: 'gmail', code: 'c', state } },
          state: { user: { id: 5 } },
          throw() {
            throw new Error('unexpected');
          },
        };
        await controller.reconnectOAuthAccount(ctx);
        assert.equal(ctx.body.success, true);
        const tokens = decryptCredentials(account.oauth);
        assert.equal(tokens.accessToken, 'new-at');
        assert.equal(tokens.refreshToken, 'new-rt');

        // another mailbox is rejected
        const again = await createState(global.strapi, {
          clientId: 'client-1',
          provider: 'gmail',
          userId: 5,
          accountId: 'acc1',
        });
        exchangeResult = { email: 'other@example.test', accessToken: 'x', expiresAt: new Date() };
        const mismatch = {
          params: { accountId: 'acc1' },
          request: { body: { provider: 'gmail', code: 'c', state: again.state } },
          state: { user: { id: 5 } },
          throw() {},
        };
        await assert.rejects(
          controller.reconnectOAuthAccount(mismatch),
          (err) => err.name === 'ValidationError' && /different mailbox/.test(err.message)
        );
        assert.equal(decryptCredentials(account.oauth).accessToken, 'new-at');

        // create-account with a state issued to another admin
        const foreign = await createState(global.strapi, {
          clientId: 'client-2',
          provider: 'gmail',
          userId: 99,
        });
        const createCtx = {
          request: {
            body: {
              provider: 'gmail',
              code: 'c',
              state: foreign.state,
              accountDetails: { name: 'X', config: { clientId: 'client-2', clientSecret: 'y' } },
            },
          },
          state: { user: { id: 5 } },
          throw() {},
        };
        await assert.rejects(
          controller.createOAuthAccount(createCtx),
          (err) => err.name === 'ValidationError' && /OAuth state/.test(err.message)
        );
      } finally {
        delete global.strapi;
      }
    }
  );
});

// ── Routes and policies: SEC-07 / SEC-15 ─────────────────────────────────────

test('SEC-15: every admin test-send route is rate limited per admin', () => {
  const admin = require('../server/src/routes/admin').routes;
  const testRoutes = admin.filter((route) =>
    route.config.policies?.some((p) => p.config?.actions?.includes('plugin::magic-mail.test-send'))
  );
  assert.equal(testRoutes.length, 3);
  for (const route of testRoutes) {
    assert.deepEqual(route.config.middlewares, [
      {
        name: 'plugin::magic-mail.rate-limit',
        config: { bucket: 'admin-test-send', max: 10, window: 60_000 },
      },
    ]);
  }
});

test('SEC-07: content-API send routes carry the api-token-only policy', () => {
  const routes = require('../server/src/routes/content-api').routes;
  const policies = require('../server/src/policies');
  for (const route of routes.filter((r) => r.path === '/send' || r.path === '/send-message')) {
    assert.deepEqual(route.config.policies, ['plugin::magic-mail.api-token-only']);
  }
  const policy = policies['api-token-only'];
  const strapiWith = (allow) => ({ strapi: { config: { get: () => allow } } });
  const ctxWith = (name) => ({ state: { auth: { strategy: { name } } } });
  assert.equal(policy(ctxWith('api-token'), {}, strapiWith(false)), true);
  // Strapi 5.45+ names the Content-API token strategy `content-api-token`.
  assert.equal(policy(ctxWith('content-api-token'), {}, strapiWith(false)), true);
  // Admin tokens belong to the admin API.
  assert.equal(policy(ctxWith('admin-token'), {}, strapiWith(true)), false);
  assert.equal(policy(ctxWith('users-permissions'), {}, strapiWith(false)), false);
  assert.equal(policy(ctxWith('users-permissions'), {}, strapiWith(true)), true);
  assert.equal(policy({ state: {} }, {}, strapiWith(true)), false);
});

test('SUP-07/STR-05: the callback page posts to the admin origin and never puts the code into a URL', () => {
  const { renderOAuthCallback } = require('../server/src/utils/oauth-callback-response');
  const render = () => {
    const headers = {};
    const ctx = {
      set: (name, value) => {
        headers[name] = value;
      },
    };
    renderOAuthCallback(ctx, 'microsoft');
    return String(ctx.body);
  };

  global.strapi = {
    config: {
      get: (key) =>
        key === 'admin.absoluteUrl' ? 'https://admin.example.test/dashboard' : undefined,
    },
  };
  try {
    const body = render();
    assert.match(body, /var ADMIN_ORIGIN = "https:\/\/admin\.example\.test";/);
    assert.doesNotMatch(body, /oauth_code|location\.href\s*=/);
  } finally {
    delete global.strapi;
  }

  const fallback = render();
  assert.match(fallback, /var ADMIN_ORIGIN = null;/);
});
