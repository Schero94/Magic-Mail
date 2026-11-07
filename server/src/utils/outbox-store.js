'use strict';

const crypto = require('crypto');
const coordination = require('./coordination');

/**
 * Database layer of the send queue (`plugin::magic-mail.outbox-message`,
 * table `magic_mail_outbox`).
 *
 * Every statement goes through knex on the table Strapi created for the
 * content type (resolved from Strapi's metadata, like plugin-settings.js), so
 * the hot path never loads documents and the same code runs on PostgreSQL,
 * MySQL 8 and SQLite.
 *
 * Multi-process rules:
 * - Claims are exclusive. PostgreSQL: one `UPDATE ... WHERE id IN (SELECT ...
 *   FOR UPDATE SKIP LOCKED) RETURNING` statement. MySQL 8: a transaction with
 *   `SELECT ... FOR UPDATE SKIP LOCKED` and a conditional UPDATE (MySQL rejects
 *   LIMIT inside an IN subquery). SQLite and any fallback: a conditional
 *   UPDATE per row whose affected-row count decides the winner.
 * - Every later write of a claimed row is fenced by `id + lease_token`, so a
 *   process that lost its claim (expired lease, admin action) can never
 *   overwrite the row.
 * - Admin actions use conditional updates on the expected status, so double
 *   clicks and racing admins have exactly one winner.
 *
 * Time columns used in comparisons (`next_attempt_at`, `not_after`,
 * `lease_until`) are epoch milliseconds (biginteger), which compare the same
 * way on every dialect and driver.
 *
 * Docs (checked 2026-11-07): PostgreSQL 17 SELECT "The Locking Clause"
 * (https://www.postgresql.org/docs/17/sql-select.html), MySQL 8.0 InnoDB
 * locking reads (https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html),
 * knex 3 query builder forUpdate/skipLocked/returning
 * (https://knexjs.org/guide/query-builder.html).
 */

const OUTBOX_UID = 'plugin::magic-mail.outbox-message';

const STATUSES = Object.freeze(['pending', 'sending', 'sent', 'failed', 'uncertain', 'discarded']);
const FINAL_STATUSES = Object.freeze(['sent', 'failed', 'discarded']);

/** Attributes the store reads and writes (camelCase as in schema.json). */
const ATTRIBUTES = Object.freeze([
  'id',
  'documentId',
  'status',
  'phase',
  'attempts',
  'maxAttempts',
  'nextAttemptAt',
  'notAfter',
  'leaseToken',
  'leaseUntil',
  'claimedBy',
  'lastErrorCode',
  'lastErrorClass',
  'lastErrorAt',
  'errorHistory',
  'accountUsed',
  'lastAccountDocumentId',
  'providerMessageId',
  'emailLogDocumentId',
  'emailId',
  'idempotencyKeyHash',
  'recipientHash',
  'source',
  'createdVia',
  'createdByUser',
  'priorityRank',
  'messageIdLocal',
  'payload',
  'payloadBytes',
  'sentAt',
  'resolvedAt',
  'resolvedBy',
  'createdAt',
  'updatedAt',
]);

const NUMERIC = new Set([
  'id',
  'attempts',
  'maxAttempts',
  'nextAttemptAt',
  'notAfter',
  'leaseUntil',
  'createdByUser',
  'priorityRank',
  'payloadBytes',
  'resolvedBy',
]);

/** Columns returned by claims and admin reads (the payload only where needed). */
const WITHOUT_PAYLOAD = ATTRIBUTES.filter((name) => name !== 'payload');

/** Error for a store that has no database connection or table. */
class OutboxUnavailableError extends Error {
  constructor() {
    super('[magic-mail] The send queue table is not available');
    this.name = 'OutboxUnavailableError';
    this.code = 'MAGIC_MAIL_QUEUE_UNAVAILABLE';
  }
}

/**
 * Opaque document id for rows inserted with knex (Strapi's own default for
 * the `documentId` attribute is a cuid2: 24 lower-case alphanumerics).
 *
 * @returns {string}
 */
function newDocumentId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(23);
  let id = 'q';
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}

/**
 * Resolves knex, dialect and column names of the outbox table.
 *
 * @param {object} strapi
 * @returns {{db: object, table: () => object, col: (attribute: string) => string, fromRow: (row: object) => object}}
 * @throws {OutboxUnavailableError}
 */
function resolve(strapi) {
  const db = coordination.getDb(strapi);
  const model = coordination.modelTable(strapi, OUTBOX_UID);
  if (!db || !model) throw new OutboxUnavailableError();
  const columns = Object.fromEntries(ATTRIBUTES.map((name) => [name, model.column(name)]));
  const col = (attribute) => columns[attribute] || model.column(attribute);
  const table = () =>
    db.schema ? db.knex(model.tableName).withSchema(db.schema) : db.knex(model.tableName);

  /** Maps a knex row (column names) to attribute names with numbers parsed. */
  const fromRow = (row) => {
    if (!row) return null;
    const out = {};
    for (const name of ATTRIBUTES) {
      const value = row[columns[name]];
      if (value === undefined) continue;
      if (NUMERIC.has(name)) out[name] = value === null ? null : Number(value);
      else if (name === 'errorHistory') out[name] = parseJson(value);
      else out[name] = value;
    }
    return out;
  };

  return { db, table, col, fromRow, tableName: model.tableName };
}

/** @param {*} value @returns {Array} */
function parseJson(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Maps attribute names to column names for a write.
 *
 * @param {Function} col
 * @param {object} fields
 * @returns {object}
 */
function toColumns(col, fields) {
  const out = {};
  for (const [name, value] of Object.entries(fields)) {
    out[col(name)] = name === 'errorHistory' && value !== null ? JSON.stringify(value) : value;
  }
  return out;
}

/** @param {Function} col @param {string[]} names @returns {string[]} */
const selectColumns = (col, names) => names.map((name) => col(name));

/**
 * True when the outbox table exists (schema sync ran).
 *
 * @param {object} strapi
 * @returns {boolean}
 */
function isAvailable(strapi) {
  try {
    resolve(strapi);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads one row by idempotency key hash.
 *
 * @param {object} strapi
 * @param {string} hash
 * @returns {Promise<object|null>} row without payload
 */
async function findByHash(strapi, hash) {
  const { table, col, fromRow } = resolve(strapi);
  const row = await table()
    .where(col('idempotencyKeyHash'), hash)
    .first(selectColumns(col, WITHOUT_PAYLOAD));
  return fromRow(row);
}

/**
 * Reads one row by documentId.
 *
 * @param {object} strapi
 * @param {string} documentId
 * @param {{withPayload?: boolean}} [options]
 * @returns {Promise<object|null>}
 */
async function findByDocumentId(strapi, documentId, { withPayload = false } = {}) {
  const { table, col, fromRow } = resolve(strapi);
  const row = await table()
    .where(col('documentId'), documentId)
    .first(selectColumns(col, withPayload ? ATTRIBUTES : WITHOUT_PAYLOAD));
  return fromRow(row);
}

/**
 * Inserts a row. A unique conflict on the idempotency key returns the
 * existing row instead (race-proof de-duplication).
 *
 * @param {object} strapi
 * @param {object} fields - attribute values (without id/documentId/timestamps)
 * @returns {Promise<{row: object, duplicate: boolean}>}
 */
async function insert(strapi, fields) {
  const { table, col } = resolve(strapi);
  const now = new Date();
  const documentId = newDocumentId();
  const data = {
    ...fields,
    documentId,
    createdAt: now,
    updatedAt: now,
  };
  const record = toColumns(col, data);
  record[col('publishedAt')] = now;
  try {
    await table().insert(record);
  } catch (error) {
    const existing = await findByHash(strapi, fields.idempotencyKeyHash).catch(() => null);
    if (existing) return { row: existing, duplicate: true };
    throw error;
  }
  const row = await findByDocumentId(strapi, documentId);
  return { row, duplicate: false };
}

/**
 * Claims up to `limit` due rows for this process.
 *
 * @param {object} strapi
 * @param {{limit: number, leaseMs: number, holder: string, now?: number}} options
 * @returns {Promise<object[]>} claimed rows including the encrypted payload
 */
async function claimDue(strapi, { limit, leaseMs, holder, now = Date.now() }) {
  const ctx = resolve(strapi);
  const { db, table, col, fromRow } = ctx;
  const token = crypto.randomBytes(16).toString('hex');
  const leaseUntil = now + leaseMs;
  const updates = toColumns(col, {
    status: 'sending',
    phase: 'claimed',
    leaseToken: token,
    leaseUntil,
    claimedBy: String(holder).slice(0, 64),
    updatedAt: new Date(now),
  });
  const due = (qb) => qb.where(col('status'), 'pending').andWhere(col('nextAttemptAt'), '<=', now);
  const order = [
    { column: col('priorityRank'), order: 'asc' },
    { column: col('nextAttemptAt'), order: 'asc' },
    { column: col('id'), order: 'asc' },
  ];

  if (db.dialect === 'postgres') {
    // The locking SELECT runs once in a MATERIALIZED CTE. A plain
    // `WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)` is part of the
    // UPDATE's search condition, which Read Committed re-evaluates when a
    // target row was changed concurrently (PostgreSQL 16 docs 13.2.1); with
    // SKIP LOCKED the re-run picks other rows, and one claim took 8 rows with
    // limit 2 on PostgreSQL 16 with 8 processes. WITH queries are evaluated
    // once per statement and MATERIALIZED keeps them from being folded into
    // the parent query (docs 7.8), so a claim never exceeds `limit`.
    const picked = due(table().select(col('id')))
      .orderBy(order)
      .limit(limit)
      .forUpdate()
      .skipLocked();
    const rows = await table()
      .withMaterialized('magic_mail_outbox_picked', picked)
      .whereIn(col('id'), db.knex.select(col('id')).from('magic_mail_outbox_picked'))
      .andWhere(col('status'), 'pending')
      .update(updates)
      .returning(selectColumns(col, ATTRIBUTES));
    return (rows || []).map(fromRow);
  }

  if (db.dialect === 'mysql' && !claimDue.mysqlFallback) {
    try {
      const ids = await db.knex.transaction(async (trx) => {
        const scoped = () =>
          db.schema ? trx(ctx.tableName).withSchema(db.schema) : trx(ctx.tableName);
        const picked = await due(scoped().select(col('id')))
          .orderBy(order)
          .limit(limit)
          .forUpdate()
          .skipLocked();
        const list = picked.map((row) => row[col('id')]);
        if (list.length === 0) return [];
        await scoped().whereIn(col('id'), list).andWhere(col('status'), 'pending').update(updates);
        return list;
      });
      if (ids.length === 0) return [];
      const rows = await table()
        .where(col('leaseToken'), token)
        .select(selectColumns(col, ATTRIBUTES));
      return rows.map(fromRow);
    } catch (error) {
      // MySQL < 8.0.1 / MariaDB < 10.6 lack SKIP LOCKED (ER_PARSE_ERROR).
      if (!/syntax|parse/i.test(String(error?.code || '') + String(error?.message || ''))) {
        throw error;
      }
      claimDue.mysqlFallback = true;
      strapi.log?.warn?.(
        '[magic-mail] [QUEUE] SKIP LOCKED is not supported; using conditional claims'
      );
    }
  }

  // SQLite and fallback: conditional UPDATE per candidate.
  const candidates = await due(table().select(col('id')))
    .orderBy(order)
    .limit(limit * 2);
  const won = [];
  for (const candidate of candidates) {
    if (won.length >= limit) break;
    const id = candidate[col('id')];
    const affected = await due(table().where(col('id'), id)).update(updates);
    if (Number(affected) === 1) won.push(id);
  }
  if (won.length === 0) return [];
  const rows = await table()
    .whereIn(col('id'), won)
    .andWhere(col('leaseToken'), token)
    .select(selectColumns(col, ATTRIBUTES));
  return rows.map(fromRow);
}

/**
 * Fenced update of a claimed row: only while this claim (id + lease token)
 * still holds it and the row is in one of `statuses`.
 *
 * @param {object} strapi
 * @param {{id: number, leaseToken: string}} row
 * @param {object} fields - attribute values; `attemptsIncrement: true` adds 1
 * @param {string[]} [statuses=['sending']]
 * @returns {Promise<boolean>} true when this claim still owned the row
 */
async function fencedUpdate(strapi, row, fields, statuses = ['sending']) {
  const { db, table, col } = resolve(strapi);
  const { attemptsIncrement, ...rest } = fields;
  const data = toColumns(col, { ...rest, updatedAt: new Date() });
  if (attemptsIncrement) {
    data[col('attempts')] = db.knex.raw('COALESCE(??, 0) + 1', [col('attempts')]);
  }
  const affected = await table()
    .where(col('id'), row.id)
    .andWhere(col('leaseToken'), row.leaseToken)
    .whereIn(col('status'), statuses)
    .update(data);
  return Number(affected) === 1;
}

/**
 * Admin-style conditional update by documentId and expected statuses.
 *
 * @param {object} strapi
 * @param {string} documentId
 * @param {string[]} fromStatuses
 * @param {object} fields
 * @returns {Promise<boolean>} true when exactly this caller changed the row
 */
async function conditionalUpdate(strapi, documentId, fromStatuses, fields) {
  const { table, col } = resolve(strapi);
  const affected = await table()
    .where(col('documentId'), documentId)
    .whereIn(col('status'), fromStatuses)
    .update(toColumns(col, { ...fields, updatedAt: new Date() }));
  return Number(affected) === 1;
}

/**
 * Recovers rows whose claim expired.
 * - phase `claimed`: the provider was never called, back to `pending`.
 * - phase `dispatching`: the provider may have the message, `uncertain`
 *   (lease token kept, so a late success can still mark it sent).
 *
 * @param {object} strapi
 * @param {number} [now]
 * @returns {Promise<{requeued: number, uncertain: number, rows: object[]}>}
 */
async function reapExpired(strapi, now = Date.now()) {
  const { table, col, fromRow } = resolve(strapi);
  const expired = (qb) => qb.where(col('status'), 'sending').andWhere(col('leaseUntil'), '<', now);

  const requeued = await expired(table())
    .andWhere((qb) => qb.where(col('phase'), 'claimed').orWhereNull(col('phase')))
    .update(
      toColumns(col, {
        status: 'pending',
        phase: 'queued',
        leaseToken: null,
        leaseUntil: null,
        claimedBy: null,
        nextAttemptAt: now,
        updatedAt: new Date(now),
      })
    );

  const stuck = await expired(table())
    .andWhere(col('phase'), 'dispatching')
    .select(selectColumns(col, WITHOUT_PAYLOAD));
  const rows = [];
  for (const raw of stuck) {
    const row = fromRow(raw);
    const history = appendHistory(row.errorHistory, {
      code: 'LEASE_EXPIRED_DURING_SEND',
      errorClass: 'ambiguous',
      account: row.lastAccountDocumentId ? 'unknown' : null,
      at: now,
    });
    const affected = await table()
      .where(col('id'), row.id)
      .andWhere(col('status'), 'sending')
      .andWhere(col('phase'), 'dispatching')
      .andWhere(col('leaseUntil'), '<', now)
      .update(
        toColumns(col, {
          status: 'uncertain',
          lastErrorCode: 'LEASE_EXPIRED_DURING_SEND',
          lastErrorClass: 'ambiguous',
          lastErrorAt: new Date(now),
          errorHistory: history,
          updatedAt: new Date(now),
        })
      );
    if (Number(affected) === 1) rows.push({ ...row, status: 'uncertain' });
  }
  return { requeued: Number(requeued) || 0, uncertain: rows.length, rows };
}

/**
 * Fails pending rows whose `notAfter` passed (never sent late).
 *
 * @param {object} strapi
 * @param {number} [now]
 * @returns {Promise<object[]>} expired rows
 */
async function expirePending(strapi, now = Date.now()) {
  const { table, col, fromRow } = resolve(strapi);
  const candidates = await table()
    .where(col('status'), 'pending')
    .whereNotNull(col('notAfter'))
    .andWhere(col('notAfter'), '<', now)
    .limit(500)
    .select(selectColumns(col, WITHOUT_PAYLOAD));
  const expired = [];
  for (const raw of candidates) {
    const row = fromRow(raw);
    const affected = await table()
      .where(col('id'), row.id)
      .andWhere(col('status'), 'pending')
      .update(
        toColumns(col, {
          status: 'failed',
          lastErrorCode: 'EXPIRED',
          lastErrorClass: 'expired',
          lastErrorAt: new Date(now),
          errorHistory: appendHistory(row.errorHistory, {
            code: 'EXPIRED',
            errorClass: 'expired',
            account: null,
            at: now,
          }),
          updatedAt: new Date(now),
        })
      );
    if (Number(affected) === 1) expired.push({ ...row, status: 'failed' });
  }
  return expired;
}

/**
 * Retention: drops payloads and rows per `queue.retention`.
 *
 * @param {object} strapi
 * @param {{sentDays: number, unresolvedDays: number, rowDays: number}} retention
 * @param {number} [now]
 * @returns {Promise<{payloadsCleared: number, rowsDeleted: number}>}
 */
async function purgeRetention(strapi, retention, now = Date.now()) {
  const { table, col } = resolve(strapi);
  const day = 24 * 60 * 60 * 1000;
  const sentBefore = new Date(now - retention.sentDays * day);
  const unresolvedBefore = new Date(now - retention.unresolvedDays * day);
  const rowsBefore = new Date(now - retention.rowDays * day);

  const sentDeleted = await table()
    .whereIn(col('status'), ['sent', 'discarded'])
    .andWhere(col('updatedAt'), '<', sentBefore)
    .del();
  const payloadsCleared = await table()
    .whereIn(col('status'), ['failed', 'uncertain'])
    .whereNotNull(col('payload'))
    .andWhere(col('updatedAt'), '<', unresolvedBefore)
    // Leave updatedAt alone: rowDays counts from the row's last state change,
    // not from this purge (otherwise rows lived unresolvedDays + rowDays).
    .update(toColumns(col, { payload: null }));
  const oldDeleted = await table()
    .whereIn(col('status'), ['failed', 'uncertain'])
    .andWhere(col('updatedAt'), '<', rowsBefore)
    .del();
  return {
    payloadsCleared: Number(payloadsCleared) || 0,
    rowsDeleted: (Number(sentDeleted) || 0) + (Number(oldDeleted) || 0),
  };
}

/**
 * Lists rows for the admin (never the payload).
 *
 * @param {object} strapi
 * @param {{status?: string, lastErrorClass?: string, source?: string, from?: string, to?: string, page?: number, pageSize?: number}} query
 * @returns {Promise<{rows: object[], total: number, page: number, pageSize: number}>}
 */
async function list(strapi, query = {}) {
  const { table, col, fromRow } = resolve(strapi);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const filtered = (qb) => {
    if (query.status === 'retrying') {
      qb.where(col('status'), 'pending').andWhere((inner) =>
        inner.where(col('attempts'), '>', 0).orWhere(col('createdVia'), 'capture-on-failure')
      );
    } else if (query.status) {
      qb.where(col('status'), query.status);
    }
    if (query.lastErrorClass) qb.where(col('lastErrorClass'), query.lastErrorClass);
    if (query.source) qb.where(col('source'), query.source);
    if (query.from) qb.where(col('createdAt'), '>=', new Date(query.from));
    if (query.to) qb.where(col('createdAt'), '<=', new Date(query.to));
    return qb;
  };
  const countRow = await filtered(table()).count({ total: '*' }).first();
  const rows = await filtered(table())
    .orderBy([
      { column: col('createdAt'), order: 'desc' },
      { column: col('id'), order: 'desc' },
    ])
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .select(selectColumns(col, WITHOUT_PAYLOAD));
  return { rows: rows.map(fromRow), total: Number(countRow?.total) || 0, page, pageSize };
}

/**
 * Counts per status.
 *
 * @param {object} strapi
 * @returns {Promise<Record<string, number>>}
 */
async function countByStatus(strapi) {
  const { table, col } = resolve(strapi);
  const rows = await table().select(col('status')).count({ total: '*' }).groupBy(col('status'));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row[col('status')]] = Number(row.total) || 0;
  return counts;
}

/**
 * Queue metrics for the analytics endpoint. Codes and counts only.
 *
 * @param {object} strapi
 * @param {number} [now]
 * @returns {Promise<object>}
 */
async function stats(strapi, now = Date.now()) {
  const { table, col } = resolve(strapi);
  const day = 24 * 60 * 60 * 1000;
  const counts = await countByStatus(strapi);
  const oldest = await table()
    .where(col('status'), 'pending')
    .min({ value: col('createdAt') })
    .first();
  const dueNow = await table()
    .where(col('status'), 'pending')
    .andWhere(col('nextAttemptAt'), '<=', now)
    .count({ total: '*' })
    .first();
  const windowCounts = async (since) => {
    const sinceDate = new Date(now - since);
    const sentAfterRetry = await table()
      .where(col('status'), 'sent')
      .andWhere(col('sentAt'), '>=', sinceDate)
      .andWhere((qb) =>
        qb.where(col('attempts'), '>', 1).orWhere(col('createdVia'), 'capture-on-failure')
      )
      .count({ total: '*' })
      .first();
    const failed = await table()
      .where(col('status'), 'failed')
      .andWhere(col('updatedAt'), '>=', sinceDate)
      .count({ total: '*' })
      .first();
    const uncertain = await table()
      .where(col('status'), 'uncertain')
      .andWhere(col('updatedAt'), '>=', sinceDate)
      .count({ total: '*' })
      .first();
    return {
      sentAfterRetry: Number(sentAfterRetry?.total) || 0,
      failed: Number(failed?.total) || 0,
      uncertain: Number(uncertain?.total) || 0,
    };
  };
  const histogramRows = await table()
    .select(col('attempts'))
    .count({ total: '*' })
    .groupBy(col('attempts'));
  const attemptsHistogram = { 1: 0, 2: 0, 3: 0, '4+': 0 };
  for (const row of histogramRows) {
    const attempts = Number(row[col('attempts')]) || 0;
    if (attempts <= 0) continue;
    const key = attempts >= 4 ? '4+' : String(attempts);
    attemptsHistogram[key] += Number(row.total) || 0;
  }
  const errorRows = await table()
    .whereNotNull(col('lastErrorCode'))
    .select(col('lastErrorCode'))
    .count({ total: '*' })
    .groupBy(col('lastErrorCode'))
    .orderBy('total', 'desc')
    .limit(5);
  const latencyRows = await table()
    .where(col('status'), 'sent')
    .whereNotNull(col('sentAt'))
    .andWhere(col('sentAt'), '>=', new Date(now - 7 * day))
    .orderBy(col('id'), 'desc')
    .limit(500)
    .select(col('createdAt'), col('sentAt'));
  const latencies = latencyRows
    .map((row) => toMillis(row[col('sentAt')]) - toMillis(row[col('createdAt')]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const oldestMs = toMillis(oldest?.value);

  return {
    counts,
    dueNow: Number(dueNow?.total) || 0,
    oldestPendingAgeMs: Number.isFinite(oldestMs) ? Math.max(0, now - oldestMs) : null,
    last24h: await windowCounts(day),
    last7d: await windowCounts(7 * day),
    attemptsHistogram,
    topErrorCodes: errorRows.map((row) => ({
      code: String(row[col('lastErrorCode')]),
      count: Number(row.total) || 0,
    })),
    averageLatencyMs: latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null,
  };
}

/**
 * Converts a database timestamp (Date, ISO string or epoch number) to ms.
 * @param {*} value
 * @returns {number}
 */
function toMillis(value) {
  if (value === null || value === undefined) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return new Date(value).getTime();
}

/**
 * Deletes final rows (sent, failed, discarded) created before `olderThan`.
 *
 * @param {object} strapi
 * @param {Date} olderThan
 * @returns {Promise<number>}
 */
async function deleteFinal(strapi, olderThan) {
  const { table, col } = resolve(strapi);
  const deleted = await table()
    .whereIn(col('status'), FINAL_STATUSES)
    .andWhere(col('createdAt'), '<', olderThan)
    .del();
  return Number(deleted) || 0;
}

/**
 * Deletes every row of a recipient (GDPR erasure), except one being sent.
 *
 * @param {object} strapi
 * @param {string} recipientHash
 * @returns {Promise<number>}
 */
async function deleteByRecipientHash(strapi, recipientHash) {
  const { table, col } = resolve(strapi);
  const deleted = await table()
    .where(col('recipientHash'), recipientHash)
    .whereNot(col('status'), 'sending')
    .del();
  return Number(deleted) || 0;
}

/**
 * Appends one sanitized entry to the error history (max 10 kept).
 *
 * @param {Array|null} history
 * @param {{code: string, errorClass: string, account: string|null, at: number}} entry
 * @returns {Array}
 */
function appendHistory(history, { code, errorClass, account, at }) {
  const list = Array.isArray(history) ? history.slice(-9) : [];
  list.push({
    at: new Date(at).toISOString(),
    code: String(code || 'UNKNOWN').slice(0, 64),
    class: errorClass,
    account: account ? String(account).slice(0, 255) : null,
  });
  return list;
}

module.exports = {
  OUTBOX_UID,
  STATUSES,
  FINAL_STATUSES,
  OutboxUnavailableError,
  isAvailable,
  resolve,
  insert,
  findByHash,
  findByDocumentId,
  claimDue,
  fencedUpdate,
  conditionalUpdate,
  reapExpired,
  expirePending,
  purgeRetention,
  list,
  countByStatus,
  stats,
  deleteFinal,
  deleteByRecipientHash,
  appendHistory,
  toMillis,
};
