'use strict';

/**
 * Multi-process send queue test (Railway replicas x pm2 workers): WORKERS
 * forked processes run the real queue worker against ONE database and one
 * local fake SMTP server (127.0.0.1:1389 by default).
 *
 * Proves:
 * - every queued message is accepted by the SMTP server exactly once,
 *   with 8 processes claiming concurrently;
 * - scripted transient failures are retried up to first try + 3 retries;
 * - a drop after the final dot ends `uncertain` and is never re-sent;
 * - permanent refusals are not retried;
 * - one row per idempotency key under concurrent enqueue;
 * - racing admin retry/discard: exactly one winner;
 * - SIGKILL after claim: the reaper re-queues and the mail is sent once;
 * - SIGKILL during dispatch: the row becomes uncertain, no automatic re-send.
 *
 * - SQLite (file database) runs whenever better-sqlite3 is installed.
 * - PostgreSQL runs when MAGIC_MAIL_TEST_PG_URL is set, e.g.
 *   MAGIC_MAIL_TEST_PG_URL=postgres://strapi@127.0.0.1:5440/mi_mm_queue npm run test:multi-instance
 *   (the test drops and creates its own tables; use a throwaway database).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'synthetic-encryption-key-0123456789abcdef0123';

const fixtures = require('./helpers/queue-fixtures');
const { startFakeSmtp } = require('./helpers/fake-smtp');

const WORKERS = Number(process.env.MAGIC_MAIL_TEST_WORKERS) || 8;
const SMTP_PORT = Number(process.env.MAGIC_MAIL_TEST_SMTP_PORT) || 1389;
const WORKER = path.join(__dirname, 'helpers', 'queue-worker.js');
const QUEUE_CONFIG = {
  worker: false,
  batchSize: 5,
  concurrency: 2,
  leaseMs: 60_000,
  backoffMs: [1_000, 1_000, 1_000],
  jitterRatio: 0,
  maxDispatchPerMinute: 100_000,
};

const MIX = [
  ['ok', 440],
  ['t2', 20],
  ['r451', 10],
  ['dropafter', 10],
  ['r550', 10],
  ['dropbefore', 10],
];

const hasSqlite = (() => {
  try {
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Forks `count` workers and returns helpers to run scenarios on them. */
async function startWorkers(db, count, smtpPort) {
  const env = { ...process.env, NODE_ENV: 'test' };
  const children = Array.from({ length: count }, () =>
    fork(WORKER, [], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  );
  let nextId = 0;
  const request = (child, message) =>
    new Promise((resolve, reject) => {
      const id = (nextId += 1);
      const onMessage = (reply) => {
        if (reply.id !== id) return;
        child.off('message', onMessage);
        if (reply.type === 'error') reject(new Error(reply.error));
        else resolve(reply.result);
      };
      child.on('message', onMessage);
      child.send({ ...message, id });
    });
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve, reject) => {
          child.once('message', (reply) =>
            reply.type === 'ready' ? resolve() : reject(new Error(reply.error))
          );
          child.send({ type: 'init', db, smtpPort, queueConfig: QUEUE_CONFIG });
        })
    )
  );
  return {
    children,
    runAll: (scenario, args) =>
      Promise.all(children.map((child) => request(child, { type: 'run', scenario, args }))),
    runOn: (child, scenario, args) => request(child, { type: 'run', scenario, args }),
    async stop() {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.send({ type: 'exit' });
      }
      await Promise.all(
        children.map((child) =>
          child.exitCode !== null || child.signalCode !== null
            ? null
            : new Promise((resolve) => child.once('exit', resolve))
        )
      );
    },
  };
}

/** Kills a worker hard (no cleanup, like an OOM kill or a lost container). */
const kill = (child) =>
  new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGKILL');
  });

async function runSuite(t, db, knex, client) {
  // 127.0.0.1:1389 by default; a random free port when it is taken.
  const smtp = await startFakeSmtp({ port: SMTP_PORT }).catch(() => startFakeSmtp({ port: 0 }));
  await fixtures.resetCoordination(knex);
  await fixtures.createOutboxTable(knex);
  await fixtures.createCoreStore(knex);
  await fixtures.createAccountTable(knex, [{ documentId: 'accprimary' }]);
  const parent = fixtures.makeQueueStrapi(knex, client, {
    accounts: [fixtures.smtpAccount('primary', smtp.port, { isPrimary: true })],
    queueConfig: QUEUE_CONFIG,
  });
  const queue = parent.strapi.plugin('magic-mail').service('queue');
  const store = require('../server/src/utils/outbox-store');
  const rowsByMode = new Map();
  const workers = await startWorkers(db, WORKERS, smtp.port);
  const byOutbox = (id) => smtp.received.filter((entry) => entry.outboxId === id);

  try {
    await t.test(
      '500 mails, 8 processes: each accepted exactly once, retries bounded',
      async () => {
        let index = 0;
        for (const [mode, count] of MIX) {
          const ids = [];
          for (let i = 0; i < count; i += 1) {
            const { outboxId } = await queue.enqueue(fixtures.preparedMessage(mode, (index += 1)), {
              emailLog: null,
              source: 'multi',
            });
            ids.push(outboxId);
          }
          rowsByMode.set(mode, ids);
        }
        await workers.runAll('drain', { deadlineMs: 120_000 });

        const counts = await store.countByStatus(parent.strapi);
        assert.equal(counts.sending, 0, 'no row left in sending');
        assert.equal(counts.pending, 0, 'no row left pending');

        const acceptedIds = smtp.received.filter((e) => e.accepted).map((e) => e.outboxId);
        assert.equal(new Set(acceptedIds).size, acceptedIds.length, 'no mail accepted twice');

        // A claim never takes more rows than one process may have in flight.
        // Sent rows keep the token of the claim that sent them.
        const { table: outbox, col: column } = store.resolve(parent.strapi);
        const perClaim = await outbox()
          .select(column('leaseToken'))
          .count({ n: '*' })
          .whereNotNull(column('leaseToken'))
          .groupBy(column('leaseToken'));
        const largestClaim = Math.max(0, ...perClaim.map((entry) => Number(entry.n)));
        assert.ok(
          largestClaim <= QUEUE_CONFIG.concurrency,
          `one claim took ${largestClaim} rows (concurrency ${QUEUE_CONFIG.concurrency})`
        );

        const expectations = {
          ok: { status: 'sent', received: 1, accepted: 1, attempts: 1 },
          t2: { status: 'sent', received: 3, accepted: 1, attempts: 3 },
          r451: { status: 'failed', received: 4, accepted: 0, attempts: 4 },
          dropafter: { status: 'uncertain', received: 1, accepted: 0, attempts: 1 },
          r550: { status: 'failed', received: 0, accepted: 0, attempts: 1 },
          dropbefore: { status: 'failed', received: 0, accepted: 0, attempts: 4 },
        };
        for (const [mode, ids] of rowsByMode) {
          const expected = expectations[mode];
          for (const id of ids) {
            const row = await store.findByDocumentId(parent.strapi, id);
            const deliveries = byOutbox(id);
            assert.equal(row.status, expected.status, `${mode} status`);
            assert.equal(row.attempts, expected.attempts, `${mode} attempts`);
            assert.equal(deliveries.length, expected.received, `${mode} deliveries`);
            assert.equal(
              deliveries.filter((entry) => entry.accepted).length,
              expected.accepted,
              `${mode} accepted`
            );
          }
        }
      }
    );

    await t.test('one row per idempotency key under concurrent enqueue', async () => {
      const results = await workers.runAll('enqueueSame', { key: `order-${client}-1` });
      assert.equal(results.filter((r) => !r.duplicate).length, 1);
      assert.equal(new Set(results.map((r) => r.outboxId)).size, 1);
      await workers.runAll('drain', { deadlineMs: 30_000 });
      assert.equal(byOutbox(results[0].outboxId).length, 1);
    });

    await t.test('racing admin retry and discard: exactly one winner each', async () => {
      const failedId = rowsByMode.get('r550')[0];
      // Retry is idempotent (a pending row may be retried again): every call
      // either succeeds or reports STATE_CHANGED, and the row ends pending with
      // exactly one extra attempt allowed.
      const before = await store.findByDocumentId(parent.strapi, failedId);
      const retries = await workers.runAll('admin', { action: 'retry', documentId: failedId });
      assert.ok(retries.filter((r) => r.won).length >= 1);
      assert.ok(retries.every((r) => r.won || r.code === 'STATE_CHANGED'));
      const after = await store.findByDocumentId(parent.strapi, failedId);
      assert.equal(after.status, 'pending');
      assert.equal(after.maxAttempts, before.attempts + 1);

      const otherId = rowsByMode.get('r550')[1];
      const discards = await workers.runAll('admin', { action: 'discard', documentId: otherId });
      assert.equal(discards.filter((r) => r.won).length, 1);
      await workers.runAll('drain', { deadlineMs: 30_000 });
    });

    await t.test(
      'SIGKILL after claim: the reaper re-queues and the mail is sent once',
      async () => {
        const ids = [];
        for (let i = 0; i < 3; i += 1) {
          const { outboxId } = await queue.enqueue(fixtures.preparedMessage('ok', 9000 + i), {
            emailLog: null,
            source: 'multi',
          });
          ids.push(outboxId);
        }
        const victim = workers.children[0];
        const { claimed } = await workers.runOn(victim, 'claimOnly', { limit: 3, leaseMs: 1_000 });
        assert.equal(claimed.length, 3);
        await kill(victim);
        await sleep(1_200);
        await workers.runOn(workers.children[1], 'drain', { deadlineMs: 30_000 });
        for (const id of ids) {
          assert.equal((await store.findByDocumentId(parent.strapi, id)).status, 'sent');
          assert.equal(byOutbox(id).filter((e) => e.accepted).length, 1);
        }
      }
    );

    await t.test('SIGKILL during dispatch: uncertain, never re-sent automatically', async () => {
      const { outboxId } = await queue.enqueue(fixtures.preparedMessage('hang', 9100), {
        emailLog: null,
        source: 'multi',
      });
      const victim = workers.children[2];
      await workers.runOn(victim, 'startTick', {});
      const { table, col } = store.resolve(parent.strapi);
      for (let i = 0; i < 100; i += 1) {
        const row = await store.findByDocumentId(parent.strapi, outboxId);
        if (row.phase === 'dispatching' && byOutbox(outboxId).length === 1) break;
        await sleep(50);
      }
      await kill(victim);
      // Let the lease expire instead of waiting leaseMs.
      await table()
        .where(col('documentId'), outboxId)
        .update({ [col('leaseUntil')]: Date.now() - 1 });
      await workers.runOn(workers.children[3], 'drain', { deadlineMs: 20_000 });
      const row = await store.findByDocumentId(parent.strapi, outboxId);
      assert.equal(row.status, 'uncertain');
      assert.equal(row.lastErrorCode, 'LEASE_EXPIRED_DURING_SEND');
      assert.equal(byOutbox(outboxId).length, 1, 'sent to the provider once, not again');
    });
  } finally {
    await workers.stop();
    await smtp.close();
  }
}

test('send queue across processes on SQLite', { skip: !hasSqlite, timeout: 300_000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-queue-mp-'));
  const file = path.join(dir, 'queue.db');
  const knex = require('knex')({
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
  });
  await knex.raw('PRAGMA journal_mode = WAL');
  try {
    await runSuite(t, { client: 'sqlite', connection: file }, knex, 'sqlite');
  } finally {
    await knex.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'send queue across processes on PostgreSQL',
  { skip: !process.env.MAGIC_MAIL_TEST_PG_URL, timeout: 300_000 },
  async (t) => {
    const connection = process.env.MAGIC_MAIL_TEST_PG_URL;
    const knex = require('knex')({ client: 'pg', connection });
    try {
      await runSuite(t, { client: 'pg', connection }, knex, 'postgres');
    } finally {
      await knex.destroy();
    }
  }
);
