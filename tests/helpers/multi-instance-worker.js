'use strict';

/**
 * One simulated Strapi process for tests/multi-instance.test.js.
 *
 * The parent forks several of these against ONE database (SQLite file or
 * PostgreSQL) and sends the same scenario to all of them at once. Each
 * worker builds a minimal `strapi` double around a real knex connection and
 * calls the plugin's real coordination code, then reports what it observed.
 * Synthetic data only.
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const coordination = require(path.join(ROOT, 'server/src/utils/coordination'));

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

const LOG_UID = 'plugin::magic-mail.email-log';
const ACCOUNT_UID = 'plugin::magic-mail.email-account';
const TABLES = {
  [LOG_UID]: {
    tableName: 'mm_test_email_logs',
    attributes: {
      documentId: { columnName: 'document_id' },
      openCount: { columnName: 'open_count' },
      firstOpenedAt: { columnName: 'first_opened_at' },
      lastOpenedAt: { columnName: 'last_opened_at' },
      updatedAt: { columnName: 'updated_at' },
    },
  },
  [ACCOUNT_UID]: { tableName: 'mm_test_accounts', attributes: {} },
};

/**
 * Minimal Strapi query-engine double for `strapi::core-store` (the subset
 * coordination.updateStoreValue uses), backed by knex.
 */
function coreStoreQuery(knex) {
  const table = 'mm_test_core_store';
  const applyWhere = (qb, where) => {
    for (const [key, value] of Object.entries(where)) {
      if (value && typeof value === 'object' && Array.isArray(value.$in))
        qb.whereIn(key, value.$in);
      else if (value === null) qb.whereNull(key);
      else qb.where(key, value);
    }
    return qb;
  };
  return {
    findMany: ({ where }) => applyWhere(knex(table), where).orderBy('id', 'asc').select('*'),
    deleteMany: async ({ where }) => ({ count: await applyWhere(knex(table), where).del() }),
    create: async ({ data }) => knex(table).insert(data),
    updateMany: async ({ where, data }) => ({
      count: await applyWhere(knex(table), where).update(data),
    }),
  };
}

function connect({ client, connection }) {
  const knexFactory = require('knex');
  if (client === 'sqlite') {
    return knexFactory({
      client: 'better-sqlite3',
      connection: { filename: connection },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
        afterCreate: (conn, done) => {
          conn.pragma('busy_timeout = 10000');
          done();
        },
      },
    });
  }
  return knexFactory({ client: 'pg', connection, pool: { min: 1, max: 4 } });
}

function makeStrapi(knex, client) {
  return {
    log: quietLog,
    config: { get: (_key, fallback) => fallback },
    store: () => ({ get: async () => null, set: async () => {}, delete: async () => {} }),
    db: {
      connection: knex,
      dialect: { client: client === 'sqlite' ? 'sqlite' : 'postgres' },
      metadata: { get: (uid) => TABLES[uid] },
      query: (uid) => (uid === 'strapi::core-store' ? coreStoreQuery(knex) : null),
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scenarios = {
  /** Every worker claims the same key once; exactly one may win. */
  async claim(strapi, { key }) {
    const token = await coordination.claim(strapi, key, 60_000);
    return { won: Boolean(token) };
  },

  /** Every worker runs the same singleton job once. */
  async singleton(strapi, { name }) {
    const { ran } = await coordination.runSingleton(strapi, name, 60_000, async () => sleep(50));
    return { ran };
  },

  /** Read-modify-write of one counter under the lease: no lost updates. */
  async lease(strapi, { rounds }) {
    const knex = strapi.db.connection;
    for (let i = 0; i < rounds; i += 1) {
      await coordination.withLease(
        strapi,
        'test-counter',
        async () => {
          const row = await knex('mm_test_counter').where({ id: 1 }).first('value');
          await sleep(2);
          await knex('mm_test_counter')
            .where({ id: 1 })
            .update({ value: Number(row.value) + 1 });
        },
        { ttlMs: 10_000, waitMs: 60_000, pollMs: 5 }
      );
    }
    return { rounds };
  },

  /** Shared fixed-window counter. */
  async rateLimit(strapi, { key, hits, max }) {
    let allowed = 0;
    for (let i = 0; i < hits; i += 1) {
      const { count } = await coordination.hitRateLimit(strapi, key, 60 * 60 * 1000);
      if (count <= max) allowed += 1;
    }
    return { allowed };
  },

  /** Creates OAuth flows (states are returned to the parent). */
  async createStates(strapi, { count }) {
    const { createState } = require(path.join(ROOT, 'server/src/utils/oauth-state'));
    const states = await Promise.all(
      Array.from({ length: count }, () =>
        createState(strapi, { clientId: 'client-synthetic', provider: 'gmail', userId: 1 })
      )
    );
    return { states: states.map((flow) => flow.state) };
  },

  /** Tries to consume every state; reports which ones this worker won. */
  async consumeStates(strapi, { states }) {
    const { verifyAndConsumeState } = require(path.join(ROOT, 'server/src/utils/oauth-state'));
    const won = [];
    await Promise.all(
      states.map(async (state, index) => {
        try {
          const result = await verifyAndConsumeState(strapi, state, {
            clientId: 'client-synthetic',
            userId: 1,
          });
          if (result.codeVerifier) won.push(index);
        } catch {
          // lost the race or replay
        }
      })
    );
    return { won };
  },

  /** Each worker writes its own sub-key of one store value repeatedly. */
  async store(strapi, { worker, rounds }) {
    for (let i = 1; i <= rounds; i += 1) {
      await coordination.updateStoreValue(
        strapi,
        { type: 'plugin', name: 'magic-mail-test', key: 'shared' },
        (current) => ({ ...(current || {}), [`w${worker}`]: i }),
        { retries: 200 }
      );
    }
    return { rounds };
  },

  /** Atomic engagement counter (analytics). */
  async opens(strapi, { rounds }) {
    const analytics = require(path.join(ROOT, 'server/src/services/analytics'));
    for (let i = 0; i < rounds; i += 1) {
      await analytics.__test__.incrementCounter(
        strapi,
        LOG_UID,
        'log-synthetic',
        { counter: 'openCount', first: 'firstOpenedAt', last: 'lastOpenedAt' },
        new Date()
      );
    }
    return { rounds };
  },

  /** Quota reservation (single conditional UPDATE). */
  async quota(strapi, { rounds }) {
    const router = require(path.join(ROOT, 'server/src/services/email-router'))({ strapi });
    let reserved = 0;
    for (let i = 0; i < rounds; i += 1) {
      if ((await router.reserveQuota({ documentId: 'acc-synthetic' })) === 'reserved') {
        reserved += 1;
      }
    }
    return { reserved };
  },
};

let knex;
let strapi;

process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      knex = connect(message.db);
      strapi = makeStrapi(knex, message.db.client);
      await coordination.ready(strapi);
      process.send({ type: 'ready' });
      return;
    }
    if (message.type === 'run') {
      const result = await scenarios[message.scenario](strapi, message.args || {});
      process.send({ type: 'result', id: message.id, result });
      return;
    }
    if (message.type === 'exit') {
      await knex.destroy();
      process.exit(0);
    }
  } catch (error) {
    process.send({
      type: 'error',
      id: message.id,
      error: `${error?.name || 'Error'}: ${error?.message || ''}`,
    });
  }
});
