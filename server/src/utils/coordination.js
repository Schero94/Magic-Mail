'use strict';

const crypto = require('crypto');

/**
 * Cross-process coordination for multi-instance deployments (several
 * replicas and/or pm2 cluster workers sharing one database).
 *
 * The database is the single source of truth, so no extra infrastructure is
 * required. Three small plugin-owned tables are created on first use with
 * knex (Strapi leaves tables it never tracked alone during schema sync):
 *
 * - `magic_mail_claims`        claim_key PK, holder, expires_at (epoch ms)
 *     leases (single-runner jobs, per-key critical sections) and
 *     idempotency claims (webhook de-duplication)
 * - `magic_mail_rate_limits`   rl_key PK, hits, expires_at
 *     fixed-window rate-limit counters shared by every process
 * - `magic_mail_oauth_pending` nonce PK, code_verifier, created_at
 *     one row per pending OAuth flow (PKCE verifier, one-time consume)
 *
 * Every statement is portable (PostgreSQL, MySQL, SQLite):
 * `INSERT ... ON CONFLICT DO NOTHING / DO UPDATE` (knex `onConflict()`,
 * `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE` on MySQL) and conditional
 * `UPDATE ... WHERE` / `DELETE ... WHERE` whose affected-row count decides who
 * won. PostgreSQL uses `RETURNING` as a fast path. Session-level advisory
 * locks are deliberately not used: through a connection pool the lock and
 * unlock can run on different connections.
 *
 * When no knex connection is available (unit-test doubles, exotic setups)
 * every helper reports `null`/"unavailable" and callers keep their previous
 * in-process behaviour.
 */

const TABLES = Object.freeze({
  claims: 'magic_mail_claims',
  rateLimits: 'magic_mail_rate_limits',
  oauthPending: 'magic_mail_oauth_pending',
});

/** Primary-key columns stay below MySQL's 191-character utf8mb4 index limit. */
const MAX_KEY_LENGTH = 191;

/** @type {WeakMap<object, Promise<boolean>>} knex instance -> tables ready */
const readyByKnex = new WeakMap();

/**
 * Returns the knex connection, dialect and optional schema, or null.
 *
 * @param {object} strapi
 * @returns {{knex: Function, dialect: 'postgres'|'mysql'|'sqlite', schema: string|undefined}|null}
 */
function getDb(strapi) {
  try {
    const knex = strapi?.db?.connection;
    if (typeof knex !== 'function' || typeof knex.schema !== 'object') return null;
    const raw = String(
      strapi.db.dialect?.client ||
        strapi.db.config?.connection?.client ||
        knex.client?.config?.client ||
        ''
    ).toLowerCase();
    let dialect = 'sqlite';
    if (raw.includes('pg') || raw.includes('postgres')) dialect = 'postgres';
    else if (raw.includes('mysql')) dialect = 'mysql';
    let schema;
    try {
      schema = dialect === 'postgres' ? strapi.db.getSchemaName?.() || undefined : undefined;
    } catch {
      schema = undefined;
    }
    return { knex, dialect, schema };
  } catch {
    return null;
  }
}

/**
 * Query builder for a plugin table (schema-qualified on PostgreSQL when the
 * Strapi connection uses a custom schema).
 *
 * @param {{knex: Function, schema?: string}} db
 * @param {string} name
 */
const table = (db, name) => (db.schema ? db.knex(name).withSchema(db.schema) : db.knex(name));

/**
 * Bounded, opaque primary-key value. Long keys are hashed.
 *
 * @param {string} key
 * @returns {string}
 */
function boundKey(key) {
  const value = String(key);
  if (value.length <= MAX_KEY_LENGTH) return value;
  const digest = crypto.createHash('sha256').update(value).digest('hex');
  return `${value.slice(0, MAX_KEY_LENGTH - 66)}#${digest}`;
}

/**
 * Creates one table unless it exists. Concurrent creators (other processes)
 * are tolerated: a failed CREATE is ignored when the table exists afterwards.
 */
async function createTableIfMissing(db, name, build) {
  const schemaBuilder = () => (db.schema ? db.knex.schema.withSchema(db.schema) : db.knex.schema);
  if (await schemaBuilder().hasTable(name)) return;
  try {
    await schemaBuilder().createTable(name, build);
  } catch (error) {
    if (!(await schemaBuilder().hasTable(name))) throw error;
  }
}

/**
 * Ensures the coordination tables exist (memoised per connection).
 *
 * @param {object} strapi
 * @returns {Promise<{knex: Function, dialect: string, schema?: string}|null>} db handle or null
 */
async function ready(strapi) {
  const db = getDb(strapi);
  if (!db) return null;
  let pending = readyByKnex.get(db.knex);
  if (!pending) {
    pending = (async () => {
      await createTableIfMissing(db, TABLES.claims, (t) => {
        t.string('claim_key', MAX_KEY_LENGTH).primary();
        t.string('holder', 64).notNullable();
        t.bigInteger('expires_at').notNullable().index();
      });
      await createTableIfMissing(db, TABLES.rateLimits, (t) => {
        t.string('rl_key', MAX_KEY_LENGTH).primary();
        t.integer('hits').notNullable().defaultTo(0);
        t.bigInteger('expires_at').notNullable().index();
      });
      await createTableIfMissing(db, TABLES.oauthPending, (t) => {
        t.string('nonce', 64).primary();
        t.string('code_verifier', 128).nullable();
        t.bigInteger('created_at').notNullable().index();
      });
      return true;
    })();
    readyByKnex.set(db.knex, pending);
    pending.catch(() => {
      // Retry on the next call instead of caching the failure.
      if (readyByKnex.get(db.knex) === pending) readyByKnex.delete(db.knex);
    });
  }
  await pending;
  return db;
}

const newToken = () => crypto.randomBytes(16).toString('hex');

/**
 * Atomically claims `key` for `ttlMs`. Exactly one concurrent caller wins
 * while the claim is live; an expired claim can be taken over.
 *
 * @param {object} strapi
 * @param {string} key
 * @param {number} ttlMs
 * @returns {Promise<string|null|undefined>} holder token when won, null when held
 *   by someone else, undefined when no database is available
 */
async function claim(strapi, key, ttlMs) {
  const db = await ready(strapi);
  if (!db) return undefined;
  const claimKey = boundKey(key);
  const token = newToken();
  const now = Date.now();
  const expiresAt = now + Math.max(1, Math.floor(ttlMs));

  await table(db, TABLES.claims)
    .insert({ claim_key: claimKey, holder: token, expires_at: expiresAt })
    .onConflict('claim_key')
    .ignore();
  const row = await table(db, TABLES.claims)
    .where({ claim_key: claimKey })
    .first('holder', 'expires_at');
  if (row && row.holder === token) return token;
  if (row && Number(row.expires_at) <= now) {
    // Take over an expired claim; the WHERE re-check lets one caller win.
    const affected = await table(db, TABLES.claims)
      .where({ claim_key: claimKey })
      .andWhere('expires_at', '<=', now)
      .update({ holder: token, expires_at: expiresAt });
    if (Number(affected) === 1) return token;
  }
  return null;
}

/**
 * Releases a claim, but only while `token` still holds it.
 *
 * @param {object} strapi
 * @param {string} key
 * @param {string} token
 * @returns {Promise<void>}
 */
async function release(strapi, key, token) {
  if (!token) return;
  const db = await ready(strapi);
  if (!db) return;
  await table(db, TABLES.claims)
    .where({ claim_key: boundKey(key), holder: token })
    .del();
}

/** In-process FIFO per key: coalesces same-process waiters before the DB lease. */
const localQueues = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
async function runLocalExclusive(key, task) {
  const previous = localQueues.get(key) || Promise.resolve();
  let releaseLocal;
  const current = new Promise((resolve) => {
    releaseLocal = resolve;
  });
  const chained = previous.then(() => current);
  localQueues.set(key, chained);
  await previous;
  try {
    return await task();
  } finally {
    releaseLocal();
    if (localQueues.get(key) === chained) localQueues.delete(key);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Error thrown when a lease could not be acquired within `waitMs`. */
class LeaseTimeoutError extends Error {
  constructor(key) {
    super(`[magic-mail] Timed out waiting for lease "${key}"`);
    this.name = 'LeaseTimeoutError';
    this.code = 'MAGIC_MAIL_LEASE_TIMEOUT';
  }
}

/**
 * Runs `task` while holding the database lease `key` (a cross-process
 * mutex with a TTL, so a crashed holder can never block forever). Same-process
 * callers queue in memory first. Without a database the task runs under the
 * in-process queue only.
 *
 * @template T
 * @param {object} strapi
 * @param {string} key
 * @param {() => Promise<T>} task
 * @param {{ttlMs?: number, waitMs?: number, pollMs?: number}} [options]
 * @returns {Promise<T>}
 * @throws {LeaseTimeoutError} when another process holds the lease longer than waitMs
 */
async function withLease(strapi, key, task, { ttlMs = 30_000, waitMs = 10_000, pollMs = 50 } = {}) {
  return runLocalExclusive(key, async () => {
    const deadline = Date.now() + waitMs;
    let token = await claim(strapi, key, ttlMs);
    let delay = pollMs;
    while (token === null) {
      if (Date.now() >= deadline) throw new LeaseTimeoutError(key);
      await sleep(delay + Math.floor(Math.random() * pollMs));
      delay = Math.min(delay * 2, 500);
      token = await claim(strapi, key, ttlMs);
    }
    try {
      return await task();
    } finally {
      if (token) {
        try {
          await release(strapi, key, token);
        } catch {
          // The TTL frees the lease.
        }
      }
    }
  });
}

/**
 * Runs a scheduled job in at most one process per `ttlMs`. The lease is kept
 * after success (other processes skip until it expires) and released after a
 * failure so another process can retry on its next tick.
 *
 * @template T
 * @param {object} strapi
 * @param {string} name - job name
 * @param {number} ttlMs - minimum spacing between two runs across all processes
 * @param {() => Promise<T>} task
 * @returns {Promise<{ran: boolean, result?: T}>}
 */
async function runSingleton(strapi, name, ttlMs, task) {
  const key = `job:${name}`;
  const token = await claim(strapi, key, ttlMs);
  if (token === null) return { ran: false };
  try {
    return { ran: true, result: await task() };
  } catch (error) {
    if (token) await release(strapi, key, token).catch(() => {});
    throw error;
  }
}

/**
 * Adds `increment` hits to the fixed window that contains now and returns the
 * window total across all processes.
 *
 * @param {object} strapi
 * @param {string} key - bucket + caller key
 * @param {number} windowMs
 * @param {number} [increment=1]
 * @returns {Promise<{count: number, resetAt: number}|null>} null without database
 */
async function hitRateLimit(strapi, key, windowMs, increment = 1) {
  const db = await ready(strapi);
  if (!db) return null;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const rlKey = boundKey(`${key}@${windowStart}`);
  const by = Math.max(1, Math.floor(increment));

  const upsert = table(db, TABLES.rateLimits)
    .insert({ rl_key: rlKey, hits: by, expires_at: resetAt })
    .onConflict('rl_key')
    .merge({ hits: db.knex.raw('?? + ?', [`${TABLES.rateLimits}.hits`, by]) });

  if (db.dialect === 'postgres') {
    const rows = await upsert.returning('hits');
    const row = Array.isArray(rows) ? rows[0] : null;
    const count = Number(row && typeof row === 'object' ? row.hits : row);
    if (Number.isFinite(count)) return { count, resetAt };
  } else {
    await upsert;
  }
  const row = await table(db, TABLES.rateLimits).where({ rl_key: rlKey }).first('hits');
  return { count: Number(row?.hits) || by, resetAt };
}

/**
 * Deletes expired claims, rate-limit windows and abandoned OAuth flows.
 *
 * @param {object} strapi
 * @param {{oauthTtlMs?: number}} [options]
 * @returns {Promise<{claims: number, rateLimits: number, oauthPending: number}|null>}
 */
async function purgeExpired(strapi, { oauthTtlMs = 10 * 60 * 1000 } = {}) {
  const db = await ready(strapi);
  if (!db) return null;
  const now = Date.now();
  const claims = await table(db, TABLES.claims).where('expires_at', '<', now).del();
  const rateLimits = await table(db, TABLES.rateLimits).where('expires_at', '<', now).del();
  const oauthPending = await table(db, TABLES.oauthPending)
    .where('created_at', '<', now - oauthTtlMs)
    .del();
  return {
    claims: Number(claims) || 0,
    rateLimits: Number(rateLimits) || 0,
    oauthPending: Number(oauthPending) || 0,
  };
}

/**
 * Table and column names of a content type (from Strapi metadata).
 *
 * @param {object} strapi
 * @param {string} uid
 * @returns {{tableName: string, column: (attribute: string) => string}|null}
 */
function modelTable(strapi, uid) {
  try {
    const meta = strapi?.db?.metadata?.get(uid);
    if (!meta?.tableName) return null;
    return {
      tableName: meta.tableName,
      column: (attribute) =>
        meta.attributes?.[attribute]?.columnName ||
        attribute.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`),
    };
  } catch {
    return null;
  }
}

/**
 * Compare-and-set update of one Strapi core-store value (plugin store,
 * users-permissions store, ...). `store.set()` reads and writes in two steps
 * and the core-store table has no unique key, so concurrent writers lose
 * updates and can create duplicate rows for one key. This helper:
 *
 * 1. reads the lowest-id row of the key (and deletes duplicate rows),
 * 2. applies `mutate` to the parsed value,
 * 3. writes with `WHERE id = ? AND value = <value read>` and retries when
 *    another writer changed the row in between.
 *
 * Without a database connection it falls back to `store.get/set`.
 *
 * @template T
 * @param {object} strapi
 * @param {{type: string, name?: string, key: string}} params
 * @param {(current: any) => T} mutate - returns the new value
 * @param {{retries?: number}} [options]
 * @returns {Promise<T>} the value written
 */
async function updateStoreValue(strapi, { type, name, key }, mutate, { retries = 8 } = {}) {
  const query =
    typeof strapi?.db?.query === 'function' ? strapi.db.query('strapi::core-store') : null;
  if (!query || typeof query.updateMany !== 'function' || !getDb(strapi)) {
    const store = await strapi.store({ type, name });
    const next = await mutate(await store.get({ key }));
    await store.set({ key, value: next });
    return next;
  }

  const fullKey = `${type}${name ? `_${name}` : ''}_${key}`;
  const where = { key: fullKey, environment: null, tag: null };
  const parse = (row) => {
    if (!row) return null;
    if (['object', 'array', 'boolean', 'string'].includes(row.type)) {
      try {
        return JSON.parse(row.value);
      } catch {
        return null;
      }
    }
    if (row.type === 'number') return Number(row.value);
    return null;
  };
  const serialise = (value) => ({ value: JSON.stringify(value), type: typeof value });

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const rows = await query.findMany({ where, orderBy: { id: 'asc' } });
    const current = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (rows && rows.length > 1) {
      await query.deleteMany({ where: { id: { $in: rows.slice(1).map((row) => row.id) } } });
    }
    const next = await mutate(parse(current));
    if (!current) {
      await query.create({ data: { ...where, ...serialise(next) } });
      // A concurrent first writer may also have inserted; the next pass
      // de-duplicates (keeping the lowest id) and re-applies the mutation.
      const after = await query.findMany({ where, orderBy: { id: 'asc' } });
      if (after.length === 1) return next;
      continue;
    }
    const result = await query.updateMany({
      where: { id: current.id, value: current.value },
      data: serialise(next),
    });
    if (Number(result?.count) === 1) return next;
    await sleep(10 + Math.floor(Math.random() * 40));
  }
  throw new Error(`[magic-mail] Could not update store key "${key}" (concurrent writers)`);
}

module.exports = {
  TABLES,
  getDb,
  ready,
  claim,
  release,
  withLease,
  runSingleton,
  runLocalExclusive,
  hitRateLimit,
  purgeExpired,
  modelTable,
  updateStoreValue,
  boundKey,
  LeaseTimeoutError,
  /** Test hook: forget memoised table checks. */
  resetForTests() {
    localQueues.clear();
  },
};
