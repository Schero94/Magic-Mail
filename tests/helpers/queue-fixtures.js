'use strict';

/**
 * Fixtures for send queue tests: the outbox and account tables (same column
 * names Strapi creates from the content-type schemas) and a `strapi` double
 * that runs the REAL email-router and queue services against a knex
 * connection. Synthetic data only; SMTP goes to the local fake server.
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const coordination = require(path.join(ROOT, 'server/src/utils/coordination'));
const { encryptCredentials } = require(path.join(ROOT, 'server/src/utils/encryption'));

const OUTBOX_UID = 'plugin::magic-mail.outbox-message';
const ACCOUNT_UID = 'plugin::magic-mail.email-account';
const LOG_UID = 'plugin::magic-mail.email-log';
const OUTBOX_TABLE = 'magic_mail_outbox';
const ACCOUNT_TABLE = 'mm_test_queue_accounts';

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Creates the outbox table with the columns of outbox-message/schema.json
 * (snake_case, as Strapi names them) and its indexes.
 *
 * @param {import('knex').Knex} knex
 */
async function createOutboxTable(knex) {
  await knex.schema.dropTableIfExists(OUTBOX_TABLE);
  await knex.schema.createTable(OUTBOX_TABLE, (t) => {
    t.increments('id');
    t.string('document_id');
    t.string('status');
    t.string('phase');
    t.integer('attempts');
    t.integer('max_attempts');
    t.bigInteger('next_attempt_at');
    t.bigInteger('not_after');
    t.boolean('not_after_fixed').defaultTo(false);
    t.string('lease_token', 32);
    t.bigInteger('lease_until');
    t.string('claimed_by', 64);
    t.string('last_error_code', 64);
    t.string('last_error_class');
    t.datetime('last_error_at');
    t.jsonb('error_history');
    t.string('account_used');
    t.string('last_account_document_id');
    t.string('provider_message_id', 255);
    t.string('email_log_document_id');
    t.string('email_id');
    t.string('idempotency_key_hash', 64);
    t.string('recipient_hash', 64);
    t.string('source', 32);
    t.string('created_via');
    t.integer('created_by_user');
    t.integer('priority_rank');
    t.string('message_id_local', 64);
    t.text('payload', 'longtext');
    t.integer('payload_bytes');
    t.datetime('sent_at');
    t.datetime('resolved_at');
    t.integer('resolved_by');
    t.datetime('created_at');
    t.datetime('updated_at');
    t.datetime('published_at');
    t.index(['status', 'next_attempt_at'], 'magic_mail_outbox_due_idx');
    t.index(['status', 'lease_until'], 'magic_mail_outbox_lease_idx');
    t.unique(['idempotency_key_hash'], { indexName: 'magic_mail_outbox_idem_uq' });
  });
}

/**
 * Account table subset used by quota reservation and stats.
 * @param {import('knex').Knex} knex
 * @param {Array<{documentId: string}>} accounts
 */
async function createAccountTable(knex, accounts) {
  await knex.schema.dropTableIfExists(ACCOUNT_TABLE);
  await knex.schema.createTable(ACCOUNT_TABLE, (t) => {
    t.increments('id');
    t.string('document_id');
    t.integer('daily_limit');
    t.integer('hourly_limit');
    t.integer('emails_sent_today');
    t.integer('emails_sent_this_hour');
    t.string('quota_day_key');
    t.string('quota_hour_key');
    t.integer('total_emails_sent');
    t.datetime('last_used');
    t.datetime('updated_at');
  });
  for (const account of accounts) {
    await knex(ACCOUNT_TABLE).insert({
      document_id: account.documentId,
      daily_limit: account.dailyLimit || 0,
      hourly_limit: account.hourlyLimit || 0,
      emails_sent_today: 0,
      emails_sent_this_hour: 0,
      total_emails_sent: 0,
    });
  }
}

/** @returns {object} synthetic SMTP account pointing at the fake server */
function smtpAccount(name, port, extra = {}) {
  return {
    documentId: `acc${name}`,
    name,
    provider: 'smtp',
    isActive: true,
    isPrimary: extra.isPrimary || false,
    priority: extra.priority || 1,
    fromEmail: `sender-${name}@example.test`,
    fromName: 'Synthetic Sender',
    config: encryptCredentials({ host: '127.0.0.1', port, allowInsecure: true }),
    ...extra,
  };
}

/**
 * Minimal knex-backed core-store double (coordination.updateStoreValue).
 */
function coreStoreQuery(knex) {
  const table = 'mm_test_queue_core_store';
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

/**
 * Builds the strapi double.
 *
 * @param {import('knex').Knex} knex
 * @param {'sqlite'|'postgres'} client
 * @param {{accounts?: object[], queueConfig?: object, settings?: object}} options
 * @returns {{strapi: object, events: Array, logUpdates: Array}}
 */
function makeQueueStrapi(knex, client, { accounts = [], queueConfig = {}, settings = {} } = {}) {
  const events = [];
  const logUpdates = [];
  const services = {};
  const tables = {
    [OUTBOX_UID]: { tableName: OUTBOX_TABLE, attributes: {} },
    [ACCOUNT_UID]: { tableName: ACCOUNT_TABLE, attributes: {} },
  };

  const accountDocuments = {
    findMany: async ({ filters = {} } = {}) => {
      let list = accounts.filter((a) => a.isActive);
      const notIn = filters.documentId?.$notIn;
      if (Array.isArray(notIn)) list = list.filter((a) => !notIn.includes(a.documentId));
      if (filters.name?.$eqi) {
        list = list.filter((a) => a.name.toLowerCase() === String(filters.name.$eqi).toLowerCase());
      }
      return [...list].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    },
    findOne: async ({ documentId }) => accounts.find((a) => a.documentId === documentId) || null,
    update: async () => ({}),
  };
  const logDocuments = {
    findOne: async () => ({ metadata: {} }),
    findMany: async () => [],
    update: async (args) => {
      logUpdates.push(args);
      return {};
    },
    delete: async () => ({}),
  };

  const strapi = {
    log: quietLog,
    config: {
      get: (key, fallback) => {
        if (key === 'plugin::magic-mail.queue') return queueConfig;
        return fallback;
      },
    },
    store: () => ({ get: async () => null, set: async () => {} }),
    eventHub: {
      emit: async (name, payload) => {
        events.push({ name, payload });
      },
    },
    db: {
      connection: knex,
      dialect: { client: client === 'sqlite' ? 'sqlite' : 'postgres' },
      metadata: { get: (uid) => tables[uid] },
      query: (uid) => (uid === 'strapi::core-store' ? coreStoreQuery(knex) : null),
    },
    documents: (uid) => {
      if (uid === ACCOUNT_UID) return accountDocuments;
      if (uid === LOG_UID) return logDocuments;
      return { findMany: async () => [], findOne: async () => null };
    },
    plugin: () => ({ service: (name) => services[name] }),
  };

  services['plugin-settings'] = {
    getSettings: async () => ({ queueMaxAttempts: 3, ...settings }),
  };
  services['email-router'] = require(path.join(ROOT, 'server/src/services/email-router'))({
    strapi,
  });
  services.queue = require(path.join(ROOT, 'server/src/services/queue'))({ strapi });
  return { strapi, events, logUpdates };
}

/**
 * A prepared message as send() hands it to the queue.
 * @param {string} local - fake SMTP mode (local part of the recipient)
 * @param {number} index
 */
function preparedMessage(local, index) {
  return {
    to: `${local}@example.test`,
    subject: `Synthetic ${index}`,
    text: `Synthetic body ${index}`,
    html: `<p>Synthetic body ${index}</p>`,
    type: 'transactional',
    priority: 'normal',
    attachments: [],
  };
}

/** Creates the core-store table used by coordination.updateStoreValue. */
async function createCoreStore(knex) {
  await knex.schema.dropTableIfExists('mm_test_queue_core_store');
  await knex.schema.createTable('mm_test_queue_core_store', (t) => {
    t.increments('id');
    t.string('key');
    t.text('value');
    t.string('type');
    t.string('environment');
    t.string('tag');
  });
}

/** Drops coordination tables so every run starts clean. */
async function resetCoordination(knex) {
  for (const name of Object.values(coordination.TABLES)) {
    await knex.schema.dropTableIfExists(name);
  }
}

module.exports = {
  OUTBOX_TABLE,
  ACCOUNT_TABLE,
  createOutboxTable,
  createAccountTable,
  createCoreStore,
  resetCoordination,
  makeQueueStrapi,
  smtpAccount,
  preparedMessage,
};
