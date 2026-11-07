'use strict';

/**
 * Unit tests for the multi-instance building blocks (H1-H12 of the
 * multi-instance audit). "Another process" is simulated by clearing the
 * module's in-memory state between calls while both share one real
 * database (better-sqlite3 in memory). The cross-process test with real
 * forked processes is tests/multi-instance.test.js. Synthetic data only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const coordination = require('../server/src/utils/coordination');
const rateLimit = require('../server/src/middlewares/rate-limit');
const deliveryService = require('../server/src/services/delivery-webhooks');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

const hasSqlite = (() => {
  try {
    // The native binding is missing after `npm ci --ignore-scripts`.
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();
const skip = !hasSqlite && 'better-sqlite3 (native build) is not available';

/** Fresh in-memory SQLite knex (one connection, so the memory DB is shared). */
function memoryKnex() {
  return require('knex')({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  });
}

function strapiFor(knex, extra = {}) {
  return {
    log: quietLog,
    config: { get: (_key, fallback) => fallback },
    db: {
      connection: knex,
      dialect: { client: 'sqlite' },
      metadata: { get: (uid) => (extra.metadata ? extra.metadata[uid] : undefined) },
      query: extra.query || (() => null),
    },
    ...extra.strapi,
  };
}

const makeCtx = (token = 'token-synthetic') => ({
  state: { auth: { credentials: { id: token } } },
  request: { ip: '192.0.2.10' },
  status: 200,
  body: null,
  headers: {},
  set(name, value) {
    this.headers[name] = value;
  },
});

test('coordination: claim, release, takeover of an expired claim', { skip }, async () => {
  const knex = memoryKnex();
  try {
    const strapi = strapiFor(knex);
    const first = await coordination.claim(strapi, 'k1', 60_000);
    assert.ok(first);
    assert.equal(await coordination.claim(strapi, 'k1', 60_000), null, 'held');
    await coordination.release(strapi, 'k1', 'not-the-holder');
    assert.equal(await coordination.claim(strapi, 'k1', 60_000), null, 'foreign release ignored');
    await coordination.release(strapi, 'k1', first);
    assert.ok(await coordination.claim(strapi, 'k1', 60_000), 'free after release');

    await knex('magic_mail_claims').where({ claim_key: 'k2' }).del();
    await knex('magic_mail_claims').insert({ claim_key: 'k2', holder: 'dead', expires_at: 1 });
    assert.ok(await coordination.claim(strapi, 'k2', 60_000), 'expired claim taken over');

    const long = 'x'.repeat(500);
    assert.ok(await coordination.claim(strapi, long, 60_000), 'long keys are bounded');
    assert.ok(coordination.boundKey(long).length <= 191);
  } finally {
    await knex.destroy();
  }
});

test('coordination: no database means in-process behaviour', async () => {
  const strapi = { log: quietLog };
  assert.equal(await coordination.claim(strapi, 'x', 1000), undefined);
  assert.equal(await coordination.hitRateLimit(strapi, 'x', 1000), null);
  let ran = 0;
  await coordination.withLease(strapi, 'x', async () => {
    ran += 1;
  });
  const { ran: singletonRan } = await coordination.runSingleton(strapi, 'job', 1000, async () => {
    ran += 1;
  });
  assert.equal(ran, 2);
  assert.equal(singletonRan, true);
});

test('coordination: a lease times out while another holder is live', { skip }, async () => {
  const knex = memoryKnex();
  try {
    const strapi = strapiFor(knex);
    const token = await coordination.claim(strapi, 'busy', 60_000);
    assert.ok(token);
    await assert.rejects(
      coordination.withLease(strapi, 'busy', async () => {}, { waitMs: 100, pollMs: 10 }),
      (error) => error instanceof coordination.LeaseTimeoutError
    );
  } finally {
    await knex.destroy();
  }
});

test(
  'H8: a singleton job keeps its lease after success and releases it after a failure',
  { skip },
  async () => {
    const knex = memoryKnex();
    try {
      const strapi = strapiFor(knex);
      await assert.rejects(
        coordination.runSingleton(strapi, 'job-a', 60_000, async () => {
          throw new Error('synthetic failure');
        })
      );
      const retry = await coordination.runSingleton(strapi, 'job-a', 60_000, async () => 'done');
      assert.deepEqual(retry, { ran: true, result: 'done' }, 'retried after a failure');
      const again = await coordination.runSingleton(strapi, 'job-a', 60_000, async () => 'twice');
      assert.deepEqual(again, { ran: false }, 'other processes skip until the lease expires');
    } finally {
      await knex.destroy();
    }
  }
);

test('H2: the rate limit is shared by every process (database store)', { skip }, async () => {
  const knex = memoryKnex();
  try {
    const strapi = strapiFor(knex);
    rateLimit.resetForTests();
    const processA = rateLimit({ bucket: 'send-shared', max: 2, window: 60_000 }, { strapi });
    const processB = rateLimit({ bucket: 'send-shared', max: 2, window: 60_000 }, { strapi });

    const outcomes = [];
    for (const mw of [processA, processB, processA]) {
      // Each "process" has its own memory: clear the local counters.
      rateLimit.resetForTests();
      const ctx = makeCtx();
      let passed = false;
      await mw(ctx, async () => {
        passed = true;
      });
      outcomes.push({ passed, status: ctx.status, retry: ctx.headers['Retry-After'] });
    }
    assert.deepEqual(
      outcomes.map((o) => o.passed),
      [true, true, false],
      'the third request is blocked although each process saw only one or two'
    );
    assert.equal(outcomes[2].status, 429);
    assert.ok(Number(outcomes[2].retry) >= 1);
  } finally {
    await knex.destroy();
  }
});

test(
  'H2: tracking buckets write to the database only after the local burst',
  { skip },
  async () => {
    const knex = memoryKnex();
    try {
      const strapi = strapiFor(knex);
      rateLimit.resetForTests();
      const mw = rateLimit(
        { bucket: 'tracking-burst', max: 20, window: 60_000, degrade: true },
        { strapi }
      );
      const ctx = makeCtx();
      await mw(ctx, async () => {});
      await coordination.ready(strapi);
      assert.equal((await knex('magic_mail_rate_limits').select()).length, 0, 'first hit is local');
      await mw(makeCtx(), async () => {});
      const rows = await knex('magic_mail_rate_limits').select('hits');
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].hits), 2, 'the local hits are added at the first flush');
    } finally {
      await knex.destroy();
    }
  }
);

test('H2: memory store keeps the per-process limiter', { skip }, async () => {
  const knex = memoryKnex();
  try {
    const strapi = strapiFor(knex);
    strapi.config.get = (key, fallback) =>
      key === 'plugin::magic-mail.rateLimit' ? { store: 'memory' } : fallback;
    rateLimit.resetForTests();
    const mw = rateLimit({ bucket: 'send-memory', max: 1, window: 60_000 }, { strapi });
    await mw(makeCtx(), async () => {});
    assert.equal(await knex.schema.hasTable('magic_mail_rate_limits'), false);
  } finally {
    await knex.destroy();
  }
});

test(
  'H2: redis store counts per window and falls back to the database on errors',
  { skip },
  async () => {
    const knex = memoryKnex();
    try {
      const values = new Map();
      const expiries = new Map();
      const redis = {
        incrby: async (key, by) => {
          values.set(key, (values.get(key) || 0) + by);
          return values.get(key);
        },
        pexpire: async (key, ms) => {
          expiries.set(key, ms);
          return 1;
        },
      };
      const strapi = strapiFor(knex);
      strapi.config.get = (key, fallback) =>
        key === 'plugin::magic-mail.rateLimit' ? { store: 'redis', redis } : fallback;
      rateLimit.resetForTests();
      const mw = rateLimit({ bucket: 'send-redis', max: 1, window: 60_000 }, { strapi });
      const first = makeCtx();
      await mw(first, async () => {});
      rateLimit.resetForTests();
      const second = makeCtx();
      await mw(second, async () => {});
      assert.equal(second.status, 429, 'the redis count is shared');
      assert.equal(values.size, 1);
      assert.match([...values.keys()][0], /^magic-mail:rl:send-redis::t:[a-f0-9]{16}@\d+$/);
      assert.equal([...expiries.values()][0], 61_000);

      redis.incrby = async () => {
        throw new Error('synthetic redis outage');
      };
      rateLimit.resetForTests();
      const fallback = rateLimit({ bucket: 'send-redis-down', max: 5, window: 60_000 }, { strapi });
      await fallback(makeCtx(), async () => {});
      const rows = await knex('magic_mail_rate_limits').select('rl_key');
      assert.equal(rows.length, 1, 'the database store took over');
    } finally {
      await knex.destroy();
    }
  }
);

test(
  'H3: a webhook event claimed by another process is not processed twice',
  { skip },
  async () => {
    const knex = memoryKnex();
    try {
      const events = [];
      const emitted = [];
      const logs = [{ id: 1, documentId: 'log1', providerMessageId: 'a.b@mg.example.test' }];
      let failCreate = false;
      const strapi = strapiFor(knex, {
        query: (uid) => ({
          findOne: async ({ where }) => {
            if (uid.endsWith('email-event')) return null; // events not visible yet
            const ids = where.providerMessageId.$in;
            return logs.find((log) => ids.includes(log.providerMessageId)) || null;
          },
        }),
        strapi: {
          eventHub: { emit: async (name) => emitted.push(name) },
          documents: () => ({
            update: async () => {},
            create: async ({ data }) => {
              if (failCreate) throw new Error('synthetic write failure');
              events.push(data);
              return data;
            },
          }),
        },
      });
      const event = {
        eventId: 'evt-shared',
        messageId: '<a.b@mg.example.test>',
        kind: 'bounced',
        reasonCode: 'MAILGUN_BOUNCE_550',
      };

      deliveryService.__test__.resetSeen();
      failCreate = true;
      await assert.rejects(deliveryService({ strapi }).recordEvent('mailgun', event));
      failCreate = false;

      deliveryService.__test__.resetSeen();
      assert.equal(
        await deliveryService({ strapi }).recordEvent('mailgun', event),
        true,
        'a failed attempt released its claim, so the retry is processed'
      );
      deliveryService.__test__.resetSeen(); // "another process": empty memory
      assert.equal(await deliveryService({ strapi }).recordEvent('mailgun', event), false);
      assert.equal(events.length, 1);
      assert.deepEqual(emitted, ['magic-mail.delivery.bounced']);
    } finally {
      await knex.destroy();
    }
  }
);

test('H4: engagement counters use one atomic UPDATE', { skip }, async () => {
  const knex = memoryKnex();
  try {
    await knex.schema.createTable('logs', (t) => {
      t.increments('id');
      t.string('document_id');
      t.integer('open_count');
      t.bigInteger('first_opened_at');
      t.bigInteger('last_opened_at');
      t.bigInteger('updated_at');
    });
    await knex('logs').insert({ document_id: 'd1', open_count: null });
    const strapi = strapiFor(knex, {
      metadata: { 'plugin::magic-mail.email-log': { tableName: 'logs', attributes: {} } },
    });
    const { incrementCounter } = require('../server/src/services/analytics').__test__;
    const first = new Date('2026-01-01T00:00:00Z');
    const later = new Date('2026-01-02T00:00:00Z');
    const fields = { counter: 'openCount', first: 'firstOpenedAt', last: 'lastOpenedAt' };
    await Promise.all([
      incrementCounter(strapi, 'plugin::magic-mail.email-log', 'd1', fields, first),
      incrementCounter(strapi, 'plugin::magic-mail.email-log', 'd1', fields, first),
    ]);
    await incrementCounter(strapi, 'plugin::magic-mail.email-log', 'd1', fields, later);
    const row = await knex('logs').where({ document_id: 'd1' }).first();
    assert.equal(row.open_count, 3);
    assert.equal(Number(row.first_opened_at), first.getTime(), 'first open is kept');
    assert.equal(Number(row.last_opened_at), later.getTime());
    assert.equal(
      await incrementCounter({ log: quietLog }, 'x', 'd1', fields, first),
      false,
      'no database: caller falls back'
    );
  } finally {
    await knex.destroy();
  }
});

test(
  'H7: store compare-and-set removes duplicate rows and keeps other keys',
  { skip },
  async () => {
    const knex = memoryKnex();
    try {
      await knex.schema.createTable('core_store', (t) => {
        t.increments('id');
        t.string('key');
        t.text('value');
        t.string('type');
        t.string('environment');
        t.string('tag');
      });
      const fullKey = 'plugin_users-permissions_email';
      await knex('core_store').insert([
        { key: fullKey, value: JSON.stringify({ reset_password: { a: 1 } }), type: 'object' },
        { key: fullKey, value: JSON.stringify({ stale: true }), type: 'object' },
      ]);
      const where = (qb, w) => {
        for (const [key, value] of Object.entries(w)) {
          if (value && typeof value === 'object' && value.$in) qb.whereIn(key, value.$in);
          else if (value === null) qb.whereNull(key);
          else qb.where(key, value);
        }
        return qb;
      };
      const query = () => ({
        findMany: ({ where: w }) => where(knex('core_store'), w).orderBy('id').select('*'),
        deleteMany: async ({ where: w }) => ({ count: await where(knex('core_store'), w).del() }),
        create: ({ data }) => knex('core_store').insert(data),
        updateMany: async ({ where: w, data }) => ({
          count: await where(knex('core_store'), w).update(data),
        }),
      });
      const strapi = strapiFor(knex, { query });
      const params = { type: 'plugin', name: 'users-permissions', key: 'email' };
      await Promise.all([
        coordination.updateStoreValue(strapi, params, (v) => ({
          ...v,
          email_confirmation: { b: 2 },
        })),
        coordination.updateStoreValue(strapi, params, (v) => ({ ...v, reset_password: { a: 3 } })),
      ]);
      const rows = await knex('core_store').where({ key: fullKey });
      assert.equal(rows.length, 1, 'duplicate rows were removed');
      assert.deepEqual(JSON.parse(rows[0].value), {
        reset_password: { a: 3 },
        email_confirmation: { b: 2 },
      });
    } finally {
      await knex.destroy();
    }
  }
);

test('H9: quota windows only move forward', { skip }, async () => {
  const knex = memoryKnex();
  try {
    await knex.schema.createTable('accounts', (t) => {
      t.increments('id');
      t.string('document_id');
      t.integer('daily_limit');
      t.integer('hourly_limit');
      t.integer('emails_sent_today');
      t.integer('emails_sent_this_hour');
      t.string('quota_day_key');
      t.string('quota_hour_key');
    });
    // Another replica (clock slightly ahead) already opened the next window.
    await knex('accounts').insert({
      document_id: 'acc',
      daily_limit: 0,
      hourly_limit: 6,
      emails_sent_today: 0,
      emails_sent_this_hour: 5,
      quota_day_key: '2999-01-01',
      quota_hour_key: '2999-01-01T00',
    });
    const strapi = strapiFor(knex, {
      metadata: { 'plugin::magic-mail.email-account': { tableName: 'accounts' } },
    });
    const router = require('../server/src/services/email-router')({ strapi });
    assert.equal(await router.reserveQuota({ documentId: 'acc' }), 'reserved');
    assert.equal(await router.reserveQuota({ documentId: 'acc' }), false, 'not reset to 1');
    await router.refreshQuotaWindows();
    const row = await knex('accounts').where({ document_id: 'acc' }).first();
    assert.equal(row.emails_sent_this_hour, 6, 'a lagging refresh never zeroes a newer window');
    assert.equal(row.quota_hour_key, '2999-01-01T00');
  } finally {
    await knex.destroy();
  }
});

test(
  'H6: a token refreshed by another process is used instead of refreshing again',
  { skip },
  async () => {
    const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'k'.repeat(32);
    const knex = memoryKnex();
    try {
      const { encryptCredentials } = require('../server/src/utils/encryption');
      const stored = encryptCredentials({
        accessToken: 'refreshed-elsewhere',
        refreshToken: 'rotated-elsewhere',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      const strapi = strapiFor(knex, {
        strapi: {
          documents: () => ({
            findOne: async () => ({ oauth: stored }),
            update: async () => {
              throw new Error('must not write');
            },
          }),
        },
      });
      const router = require('../server/src/services/email-router')({ strapi });
      let calls = 0;
      const oauth = {
        accessToken: 'old',
        refreshToken: 'old-refresh',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      const token = await router.currentOAuthToken({ documentId: 'acc-h6' }, oauth, async () => {
        calls += 1;
        return { accessToken: 'never', expiresAt: new Date() };
      });
      assert.equal(token, 'refreshed-elsewhere');
      assert.equal(calls, 0, 'no second refresh request reached the provider');
      assert.equal(oauth.refreshToken, 'rotated-elsewhere', 'the rotated refresh token is adopted');
    } finally {
      await knex.destroy();
      if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
      else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
    }
  }
);

test(
  'H10: a settings change on another instance is seen within about a second',
  { skip },
  async () => {
    const knex = memoryKnex();
    const realNow = Date.now;
    try {
      await knex.schema.createTable('settings', (t) => {
        t.increments('id');
        t.string('document_id');
        t.boolean('enable_open_tracking');
        t.bigInteger('updated_at');
      });
      await knex('settings').insert({
        document_id: 's1',
        enable_open_tracking: true,
        updated_at: 1000,
      });
      const read = async () => {
        const row = await knex('settings').orderBy('id').first();
        return {
          id: row.id,
          documentId: row.document_id,
          enableOpenTracking: Boolean(row.enable_open_tracking),
          updatedAt: Number(row.updated_at),
        };
      };
      const strapi = strapiFor(knex, {
        metadata: {
          'plugin::magic-mail.plugin-settings': {
            tableName: 'settings',
            attributes: {
              id: { columnName: 'id' },
              updatedAt: { columnName: 'updated_at' },
            },
          },
        },
        strapi: {
          documents: () => ({
            findFirst: read,
            findMany: async () => [await read()],
          }),
        },
      });
      const settings = require('../server/src/services/plugin-settings')({ strapi });
      let now = realNow();
      Date.now = () => now;
      assert.equal((await settings.getSettings()).enableOpenTracking, true);

      // Another instance turns open tracking off.
      await knex('settings').update({ enable_open_tracking: false, updated_at: 2000 });
      now += 200;
      assert.equal((await settings.getSettings()).enableOpenTracking, true, 'cached briefly');
      now += 1_000;
      assert.equal((await settings.getSettings()).enableOpenTracking, false, 'revalidated');
    } finally {
      Date.now = realNow;
      await knex.destroy();
    }
  }
);

test('config: rateLimit options are validated', () => {
  const { validator } = require('../server/src/config');
  assert.doesNotThrow(() => validator({ rateLimit: { store: 'database' } }));
  assert.doesNotThrow(() => validator({ rateLimit: { store: 'memory' } }));
  assert.throws(() => validator({ rateLimit: { store: 'mongo' } }), /rateLimit.store/);
  assert.throws(() => validator({ rateLimit: { store: 'redis' } }), /rateLimit.redis/);
  assert.doesNotThrow(() =>
    validator({ rateLimit: { store: 'redis', redis: { incrBy() {}, pExpire() {} } } })
  );
  assert.throws(() => validator({ rateLimit: [] }), /must be an object/);
});

test('H12: secret fingerprints are logged without the secrets', () => {
  const { logSecretFingerprints } = require('../server/src/bootstrap');
  const previous = {
    key: process.env.MAGIC_MAIL_ENCRYPTION_KEY,
    tracking: process.env.MAGIC_MAIL_TRACKING_SECRET,
  };
  const secret = 'synthetic-secret-value-0123456789abcdef';
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = secret;
  delete process.env.MAGIC_MAIL_TRACKING_SECRET;
  const lines = [];
  try {
    logSecretFingerprints({ log: { info: (line) => lines.push(line) }, config: { get() {} } });
  } finally {
    if (previous.key === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous.key;
    if (previous.tracking !== undefined) process.env.MAGIC_MAIL_TRACKING_SECRET = previous.tracking;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /encryption=[a-f0-9]{8} tracking=[a-f0-9]{8} oauthState=[a-f0-9]{8}/);
  assert.ok(!lines[0].includes(secret));
});
