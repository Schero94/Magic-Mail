'use strict';

/**
 * Multi-process concurrency test (Railway replicas x pm2 cluster workers).
 *
 * Forks WORKERS Node processes that share ONE database and run the same
 * scenario at the same moment, then checks the invariants the plugin relies
 * on: one claim winner, one singleton run, no lost updates under a lease,
 * exact shared rate-limit counts, each OAuth flow consumed exactly once,
 * compare-and-set store updates, atomic counters and quota reservations.
 *
 * - SQLite (file database, WAL) runs whenever better-sqlite3 is installed.
 * - PostgreSQL runs when MAGIC_MAIL_TEST_PG_URL is set, e.g.
 *   MAGIC_MAIL_TEST_PG_URL=postgres://strapi@127.0.0.1:5440/mi_mm npm run test:multi-instance
 *   (the test creates and drops its own tables; use a throwaway database).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const WORKERS = Number(process.env.MAGIC_MAIL_TEST_WORKERS) || 8;
const WORKER = path.join(__dirname, 'helpers', 'multi-instance-worker.js');

const hasModule = (name) => {
  try {
    if (name === 'better-sqlite3') {
      // The native binding is missing after `npm ci --ignore-scripts`.
      const Database = require(name);
      new Database(':memory:').close();
    } else {
      require.resolve(name);
    }
    return true;
  } catch {
    return false;
  }
};

/** Creates the fixture tables the scenarios use and empties the plugin tables. */
async function prepare(knex) {
  for (const table of [
    'mm_test_counter',
    'mm_test_core_store',
    'mm_test_email_logs',
    'mm_test_accounts',
    'magic_mail_claims',
    'magic_mail_rate_limits',
    'magic_mail_oauth_pending',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
  await knex.schema.createTable('mm_test_counter', (t) => {
    t.integer('id').primary();
    t.integer('value').notNullable();
  });
  await knex('mm_test_counter').insert({ id: 1, value: 0 });
  await knex.schema.createTable('mm_test_core_store', (t) => {
    t.increments('id');
    t.string('key');
    t.text('value');
    t.string('type');
    t.string('environment');
    t.string('tag');
  });
  await knex.schema.createTable('mm_test_email_logs', (t) => {
    t.increments('id');
    t.string('document_id');
    t.integer('open_count');
    t.datetime('first_opened_at');
    t.datetime('last_opened_at');
    t.datetime('updated_at');
  });
  await knex('mm_test_email_logs').insert({ document_id: 'log-synthetic', open_count: 0 });
  await knex.schema.createTable('mm_test_accounts', (t) => {
    t.increments('id');
    t.string('document_id');
    t.integer('daily_limit');
    t.integer('hourly_limit');
    t.integer('emails_sent_today');
    t.integer('emails_sent_this_hour');
    t.string('quota_day_key');
    t.string('quota_hour_key');
  });
  await knex('mm_test_accounts').insert({
    document_id: 'acc-synthetic',
    daily_limit: 30,
    hourly_limit: 0,
    emails_sent_today: 0,
    emails_sent_this_hour: 0,
  });
}

/** Starts WORKERS processes and returns a function that runs one scenario on all. */
async function startWorkers(db) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    MAGIC_MAIL_OAUTH_STATE_SECRET: 'synthetic-oauth-state-secret-0123456789abcdef',
    MAGIC_MAIL_ENCRYPTION_KEY: 'synthetic-encryption-key-0123456789abcdef0123',
  };
  const children = Array.from({ length: WORKERS }, () =>
    fork(WORKER, [], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  );
  let nextId = 0;
  const request = (child, message) =>
    new Promise((resolve, reject) => {
      const id = (nextId += 1);
      const onMessage = (reply) => {
        if (reply.id !== id && reply.type !== 'ready') return;
        child.off('message', onMessage);
        if (reply.type === 'error') reject(new Error(reply.error));
        else resolve(reply.result);
      };
      child.on('message', onMessage);
      child.send({ ...message, id });
    });
  await Promise.all(children.map((child) => request(child, { type: 'init', db })));

  const runAll = (scenario, argsFor) =>
    Promise.all(
      children.map((child, worker) =>
        request(child, {
          type: 'run',
          scenario,
          args: typeof argsFor === 'function' ? argsFor(worker) : argsFor,
        })
      )
    );
  const stop = async () => {
    await Promise.all(
      children.map(
        (child) =>
          new Promise((resolve) => {
            child.once('exit', resolve);
            child.send({ type: 'exit' });
          })
      )
    );
  };
  return { runAll, stop };
}

async function runSuite(t, { db, knex }) {
  await prepare(knex);
  const { runAll, stop } = await startWorkers(db);
  try {
    await t.test('exactly one process wins a claim', async () => {
      for (let round = 0; round < 5; round += 1) {
        const results = await runAll('claim', { key: `race-${round}` });
        assert.equal(results.filter((r) => r.won).length, 1);
      }
    });

    await t.test('a singleton job runs in exactly one process', async () => {
      const results = await runAll('singleton', { name: 'synthetic-job' });
      assert.equal(results.filter((r) => r.ran).length, 1);
    });

    await t.test('a lease serialises read-modify-write across processes', async () => {
      await runAll('lease', { rounds: 10 });
      const row = await knex('mm_test_counter').where({ id: 1 }).first('value');
      assert.equal(Number(row.value), WORKERS * 10, 'no update was lost');
    });

    await t.test('rate-limit counters are shared by every process', async () => {
      const results = await runAll('rateLimit', { key: 'send::t:synthetic', hits: 20, max: 50 });
      const allowed = results.reduce((sum, r) => sum + r.allowed, 0);
      assert.ok(allowed <= 50, `at most the global limit is allowed (got ${allowed})`);
      const rows = await knex('magic_mail_rate_limits').select('hits');
      const total = rows.reduce((sum, row) => sum + Number(row.hits), 0);
      assert.equal(total, WORKERS * 20, 'every hit was counted once');
    });

    await t.test('each OAuth flow is consumed exactly once across processes', async () => {
      const created = await runAll('createStates', { count: 5 });
      const states = created.flatMap((r) => r.states);
      assert.equal(states.length, WORKERS * 5);
      const pending = await knex('magic_mail_oauth_pending').count({ n: '*' });
      assert.equal(
        Number(pending[0].n),
        WORKERS * 5,
        'concurrent flows do not overwrite each other'
      );
      const consumed = await runAll('consumeStates', { states });
      const winners = new Map();
      for (const { won } of consumed) {
        for (const index of won) winners.set(index, (winners.get(index) || 0) + 1);
      }
      assert.equal(winners.size, states.length, 'every flow was consumed');
      assert.ok(
        [...winners.values()].every((n) => n === 1),
        'no flow was consumed twice'
      );
    });

    await t.test('store compare-and-set keeps every writer change', async () => {
      await runAll('store', (worker) => ({ worker, rounds: 5 }));
      const rows = await knex('mm_test_core_store').where({
        key: 'plugin_magic-mail-test_shared',
      });
      assert.equal(rows.length, 1, 'no duplicate core-store rows');
      const value = JSON.parse(rows[0].value);
      for (let worker = 0; worker < WORKERS; worker += 1) {
        assert.equal(value[`w${worker}`], 5, `worker ${worker} kept its last write`);
      }
    });

    await t.test('engagement counters are incremented atomically', async () => {
      await runAll('opens', { rounds: 25 });
      const row = await knex('mm_test_email_logs').where({ document_id: 'log-synthetic' }).first();
      assert.equal(Number(row.open_count), WORKERS * 25);
      assert.ok(row.first_opened_at);
    });

    await t.test('quota reservations never exceed the daily limit', async () => {
      const results = await runAll('quota', { rounds: 10 });
      const reserved = results.reduce((sum, r) => sum + r.reserved, 0);
      assert.equal(reserved, 30);
      const row = await knex('mm_test_accounts').where({ document_id: 'acc-synthetic' }).first();
      assert.equal(Number(row.emails_sent_today), 30);
    });
  } finally {
    await stop();
  }
}

test(
  `multi-instance: ${WORKERS} processes on one SQLite file`,
  { skip: !hasModule('better-sqlite3') && 'better-sqlite3 (native build) is not available' },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-mail-mi-'));
    const filename = path.join(dir, 'multi-instance.db');
    const knex = require('knex')({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true,
    });
    try {
      await knex.raw('PRAGMA journal_mode = WAL');
      await runSuite(t, { db: { client: 'sqlite', connection: filename }, knex });
    } finally {
      await knex.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
);

test(
  `multi-instance: ${WORKERS} processes on one PostgreSQL database`,
  {
    skip:
      (!process.env.MAGIC_MAIL_TEST_PG_URL && 'MAGIC_MAIL_TEST_PG_URL is not set') ||
      (!hasModule('pg') && 'pg is not installed'),
  },
  async (t) => {
    const connection = process.env.MAGIC_MAIL_TEST_PG_URL;
    const knex = require('knex')({ client: 'pg', connection });
    try {
      await runSuite(t, { db: { client: 'pg', connection }, knex });
    } finally {
      await knex.destroy();
    }
  }
);
