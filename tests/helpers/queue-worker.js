'use strict';

/**
 * One simulated Strapi process for tests/multi-instance-queue.test.js. It runs
 * the REAL queue and email-router services (through the strapi double in
 * queue-fixtures.js) against the shared database and the parent's fake SMTP
 * server. Synthetic data only.
 */

const path = require('path');
const fixtures = require('./queue-fixtures');

const ROOT = path.join(__dirname, '..', '..');
const store = require(path.join(ROOT, 'server/src/utils/outbox-store'));
const coordination = require(path.join(ROOT, 'server/src/utils/coordination'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
          conn.pragma('busy_timeout = 15000');
          done();
        },
      },
    });
  }
  return knexFactory({ client: 'pg', connection, pool: { min: 1, max: 4 } });
}

let knex;
let harness;
let queue;

const scenarios = {
  /** Runs worker ticks (and the leased reaper) until nothing is left to do. */
  async drain({ deadlineMs = 90_000 }) {
    const deadline = Date.now() + deadlineMs;
    let lastReap = 0;
    let idleRounds = 0;
    while (Date.now() < deadline) {
      const { claimed } = await queue.runOnce();
      if (Date.now() - lastReap > 300) {
        lastReap = Date.now();
        await coordination.runSingleton(harness.strapi, 'outbox-reaper-test', 250, () =>
          queue.reap()
        );
      }
      if (claimed) {
        idleRounds = 0;
        continue;
      }
      const counts = await store.countByStatus(harness.strapi);
      if (counts.pending === 0 && counts.sending === 0) {
        idleRounds += 1;
        if (idleRounds > 3) break;
      }
      await sleep(50 + Math.floor(Math.random() * 50));
    }
    return { done: true };
  },

  /** Every worker enqueues the same idempotency key at once. */
  async enqueueSame({ key }) {
    const result = await queue.enqueue(fixtures.preparedMessage('ok', 0), {
      emailLog: null,
      source: 'multi',
      idempotencyKey: key,
    });
    return { duplicate: result.duplicate === true, outboxId: result.outboxId };
  },

  /** Admin race: retry or discard the same row. */
  async admin({ action, documentId }) {
    try {
      if (action === 'retry') await queue.retry(documentId, { adminId: 1 });
      else await queue.discard(documentId, { adminId: 1 });
      return { won: true };
    } catch (error) {
      return { won: false, code: error.code };
    }
  },

  /** Claims rows with a short lease and never dispatches them (crash after claim). */
  async claimOnly({ limit, leaseMs }) {
    const rows = await store.claimDue(harness.strapi, {
      limit,
      leaseMs,
      holder: 'crash-test',
    });
    return { claimed: rows.map((row) => row.documentId) };
  },

  /** Starts a worker tick without waiting for it (killed during dispatch). */
  async startTick() {
    queue.runOnce().catch(() => {});
    return { started: true };
  },
};

process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      knex = connect(message.db);
      harness = fixtures.makeQueueStrapi(knex, message.db.client, {
        accounts: [fixtures.smtpAccount('primary', message.smtpPort, { isPrimary: true })],
        queueConfig: message.queueConfig,
      });
      queue = harness.strapi.plugin('magic-mail').service('queue');
      await coordination.ready(harness.strapi);
      process.send({ type: 'ready' });
      return;
    }
    if (message.type === 'run') {
      const result = await scenarios[message.scenario](message.args || {});
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
      error: `${error?.name || 'Error'}: ${error?.code || ''} ${error?.message || ''}`,
    });
  }
});
