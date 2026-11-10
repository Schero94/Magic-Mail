'use strict';

/**
 * Send queue (outbox) service against a real SQLite database and a local
 * fake SMTP server: enqueue, worker dispatch, retries with backoff, uncertain
 * handling, fencing, reaper, expiry, capacity deferral, admin actions, stats
 * and the send() integration (queue: true and capture-on-failure).
 * Synthetic data only, loopback only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'synthetic-encryption-key-0123456789abcdef0123';

const store = require('../server/src/utils/outbox-store');
const { startFakeSmtp } = require('./helpers/fake-smtp');
const fixtures = require('./helpers/queue-fixtures');

const hasSqlite = (() => {
  try {
    const Database = require('better-sqlite3');
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

const QUEUE_CONFIG = {
  worker: false,
  batchSize: 10,
  concurrency: 10,
  leaseMs: 60_000,
  backoffMs: [60_000, 300_000, 900_000],
  jitterRatio: 0,
  maxDispatchPerMinute: 100_000,
};

/** Fresh database + strapi double per test. */
async function setup({ accounts, settings, queueConfig } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-queue-'));
  const knex = require('knex')({
    client: 'better-sqlite3',
    connection: { filename: path.join(dir, 'queue.db') },
    useNullAsDefault: true,
  });
  await fixtures.createOutboxTable(knex);
  await fixtures.createCoreStore(knex);
  const accountList = accounts || [fixtures.smtpAccount('primary', smtp.port, { isPrimary: true })];
  await fixtures.createAccountTable(knex, accountList);
  const harness = fixtures.makeQueueStrapi(knex, 'sqlite', {
    accounts: accountList,
    settings,
    queueConfig: { ...QUEUE_CONFIG, ...(queueConfig || {}) },
  });
  const queue = harness.strapi.plugin('magic-mail').service('queue');
  let now = Date.now();
  queue.setTestHooks({ clock: () => now, random: () => 0.5 });
  return {
    ...harness,
    knex,
    queue,
    router: harness.strapi.plugin('magic-mail').service('email-router'),
    advance: (ms) => {
      now += ms;
    },
    now: () => now,
    async close() {
      await knex.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

let smtp;
const receivedFor = (outboxId) => smtp.received.filter((entry) => entry.outboxId === outboxId);

test.before(async () => {
  smtp = await startFakeSmtp();
});
test.after(async () => {
  await smtp.close();
});

/** Runs worker ticks until nothing is due now (bounded). */
async function drain(queue) {
  for (let i = 0; i < 20; i += 1) {
    const { claimed } = await queue.runOnce();
    if (!claimed) return;
  }
}

test(
  'queue:true enqueue -> worker sends once with outbox header and stable Message-ID',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const result = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 1), {
        emailLog: { documentId: 'log1', emailId: 'email-1' },
        source: 'service',
      });
      assert.equal(result.success, true);
      assert.equal(result.queued, true);
      assert.equal(result.status, 'pending');
      assert.equal(result.emailId, 'email-1');
      assert.equal(result.accountUsed, null);
      assert.equal(result.messageId, null);

      const raw = await ctx.knex(fixtures.OUTBOX_TABLE).first();
      assert.match(raw.payload, /^o1:/);
      assert.ok(!raw.payload.includes('example.test'), 'payload is encrypted');
      assert.equal(raw.max_attempts, 4, 'first try plus 3 retries');

      await drain(ctx.queue);
      const row = await store.findByDocumentId(ctx.strapi, result.outboxId, { withPayload: true });
      assert.equal(row.status, 'sent');
      assert.equal(row.attempts, 1);
      assert.equal(row.payload, null, 'payload removed after sending');
      assert.equal(row.accountUsed, 'primary');
      const deliveries = receivedFor(result.outboxId);
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].accepted, true);
      assert.match(deliveries[0].messageId, new RegExp(`^<${row.messageIdLocal}@example\\.test>$`));
      assert.deepEqual(
        ctx.events.map((event) => event.name),
        ['magic-mail.queue.enqueued', 'magic-mail.queue.sent']
      );
      for (const event of ctx.events) {
        assert.ok(!JSON.stringify(event.payload).includes('@'), 'events carry no addresses');
      }
      assert.ok(
        ctx.logUpdates.some((update) => update.data.deliveryStatus === 'sent'),
        'email log marked sent'
      );
    } finally {
      await ctx.close();
    }
  }
);

test(
  'a queued mail keeps the Message-ID of its inline attempts (bounce matching)',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const inlineLocal = 'abcdef0123456789abcdef01';
      const result = await ctx.queue.enqueue(
        { ...fixtures.preparedMessage('ok', 2), __messageIdLocal: inlineLocal },
        { emailLog: { documentId: 'log2', emailId: 'email-2' }, source: 'service' }
      );
      const raw = await ctx.knex(fixtures.OUTBOX_TABLE).first();
      assert.equal(raw.message_id_local, inlineLocal);
      await drain(ctx.queue);
      const deliveries = receivedFor(result.outboxId);
      assert.equal(deliveries.length, 1);
      assert.match(deliveries[0].messageId, new RegExp(`^<${inlineLocal}@example\\.test>$`));

      // An invalid local part is never trusted; a fresh random one is used.
      await ctx.queue.enqueue(
        { ...fixtures.preparedMessage('ok', 3), __messageIdLocal: 'BAD id<>' },
        { emailLog: { documentId: 'log3', emailId: 'email-3' }, source: 'service' }
      );
      const second = await ctx.knex(fixtures.OUTBOX_TABLE).orderBy('id', 'desc').first();
      assert.match(second.message_id_local, /^[a-f0-9]{24}$/);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'transient failures retry with 1m/5m backoff and keep the Message-ID',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('t2', 2), {
        emailLog: null,
        source: 'service',
      });
      await drain(ctx.queue);
      let row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'pending');
      assert.equal(row.attempts, 1);
      assert.equal(row.lastErrorCode, 'SMTP_451');
      assert.equal(row.lastErrorClass, 'transient');
      assert.equal(row.nextAttemptAt - ctx.now(), 60_000, 'retry 1 after 1 minute');

      await drain(ctx.queue);
      assert.equal(receivedFor(outboxId).length, 1, 'not due yet');
      ctx.advance(60_000);
      await drain(ctx.queue);
      row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.attempts, 2);
      assert.equal(row.nextAttemptAt - ctx.now(), 300_000, 'retry 2 after 5 minutes');
      ctx.advance(300_000);
      await drain(ctx.queue);
      row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'sent');
      assert.equal(row.attempts, 3);
      const deliveries = receivedFor(outboxId);
      assert.equal(deliveries.length, 3);
      assert.equal(deliveries.filter((entry) => entry.accepted).length, 1);
      assert.equal(new Set(deliveries.map((entry) => entry.messageId)).size, 1);
      assert.equal(row.errorHistory.length, 2);
      for (const entry of row.errorHistory) {
        assert.deepEqual(Object.keys(entry).sort(), ['account', 'at', 'class', 'code']);
      }
    } finally {
      await ctx.close();
    }
  }
);

test(
  'a permanently refusing server ends failed after first try plus 3 retries',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('r451', 3), {
        emailLog: { documentId: 'log3', emailId: 'email-3' },
        source: 'service',
      });
      for (let i = 0; i < 6; i += 1) {
        await drain(ctx.queue);
        ctx.advance(900_000);
      }
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'failed');
      assert.equal(row.attempts, 4);
      assert.equal(receivedFor(outboxId).length, 4);
      assert.equal(
        ctx.events.filter((event) => event.name === 'magic-mail.queue.retry-scheduled').length,
        3
      );
      assert.equal(ctx.events.at(-1).name, 'magic-mail.queue.failed');
      assert.ok(ctx.logUpdates.some((update) => update.data.deliveryStatus === 'failed'));
    } finally {
      await ctx.close();
    }
  }
);

test('SMTP 5xx is permanent; a drop before 354 is retried', { skip: !hasSqlite }, async () => {
  const ctx = await setup();
  try {
    const permanent = await ctx.queue.enqueue(fixtures.preparedMessage('r550', 4), {
      emailLog: null,
      source: 'service',
    });
    const early = await ctx.queue.enqueue(fixtures.preparedMessage('dropbefore', 5), {
      emailLog: null,
      source: 'service',
    });
    await drain(ctx.queue);
    const failed = await store.findByDocumentId(ctx.strapi, permanent.outboxId);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 1);
    assert.equal(failed.lastErrorClass, 'permanent');
    const retried = await store.findByDocumentId(ctx.strapi, early.outboxId);
    assert.equal(retried.status, 'pending');
    assert.equal(retried.lastErrorClass, 'transient');
  } finally {
    await ctx.close();
  }
});

test(
  'a drop after the final dot is uncertain and never re-sent automatically',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('dropafter', 6), {
        emailLog: null,
        source: 'service',
      });
      for (let i = 0; i < 4; i += 1) {
        await drain(ctx.queue);
        ctx.advance(3_600_000);
        await ctx.queue.reap();
      }
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'uncertain');
      assert.equal(row.lastErrorClass, 'ambiguous');
      assert.equal(receivedFor(outboxId).length, 1);

      await assert.rejects(ctx.queue.retry(outboxId, {}), {
        code: 'MAGIC_MAIL_CONFIRMATION_REQUIRED',
      });
      const detail = await ctx.queue.markSent(outboxId, { adminId: 1 });
      assert.equal(detail.status, 'sent');
      assert.equal(detail.hasPayload, undefined);
      await assert.rejects(ctx.queue.markSent(outboxId, { adminId: 1 }), { code: 'STATE_CHANGED' });
    } finally {
      await ctx.close();
    }
  }
);

test(
  'retry of an uncertain row needs confirmDuplicateRisk; discard drops the payload',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('dropafter', 7), {
        emailLog: null,
        source: 'service',
      });
      await drain(ctx.queue);
      const retried = await ctx.queue.retry(outboxId, { confirmDuplicateRisk: true, adminId: 1 });
      assert.equal(retried.status, 'pending');
      assert.equal(retried.maxAttempts, 2);
      // Double click: the second retry finds it already pending and wins nothing new.
      const again = await ctx.queue.retry(outboxId, { adminId: 1 });
      assert.equal(again.status, 'pending');

      const discarded = await ctx.queue.discard(outboxId, { adminId: 1 });
      assert.equal(discarded.status, 'discarded');
      const row = await store.findByDocumentId(ctx.strapi, outboxId, { withPayload: true });
      assert.equal(row.payload, null);
      await assert.rejects(ctx.queue.discard(outboxId, {}), { code: 'STATE_CHANGED' });
      await assert.rejects(ctx.queue.retry('missing', {}), { code: 'NOT_FOUND' });
    } finally {
      await ctx.close();
    }
  }
);

test(
  'capacity (no account) defers to the next window without spending an attempt',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup({ accounts: [] });
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 8), {
        emailLog: null,
        source: 'service',
      });
      await drain(ctx.queue);
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'pending');
      assert.equal(row.attempts, 0);
      assert.equal(row.lastErrorClass, 'capacity');
      assert.ok(row.nextAttemptAt > ctx.now());
      assert.equal(new Date(row.nextAttemptAt - 30_000).getUTCMinutes(), 0, 'next clock hour');
    } finally {
      await ctx.close();
    }
  }
);

test(
  'notAfter: an expired row fails as EXPIRED and is never sent',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 9), {
        emailLog: null,
        source: 'service',
        notAfter: new Date(ctx.now() + 1_000),
      });
      ctx.advance(5_000);
      await ctx.queue.reap();
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'failed');
      assert.equal(row.lastErrorCode, 'EXPIRED');
      assert.equal(receivedFor(outboxId).length, 0);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'reaper: expired claim goes back to pending; expired dispatch becomes uncertain and a late success still resolves it',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const a = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 10), {
        emailLog: null,
        source: 'service',
      });
      const b = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 11), {
        emailLog: null,
        source: 'service',
      });
      const claimed = await store.claimDue(ctx.strapi, {
        limit: 2,
        leaseMs: 1_000,
        holder: 'test',
        now: ctx.now(),
      });
      assert.equal(claimed.length, 2);
      const rowB = claimed.find((row) => row.documentId === b.outboxId);
      assert.equal(
        await store.fencedUpdate(ctx.strapi, rowB, {
          phase: 'dispatching',
          attemptsIncrement: true,
        }),
        true
      );
      // A second claim must not see claimed rows.
      assert.equal(
        (
          await store.claimDue(ctx.strapi, {
            limit: 5,
            leaseMs: 1_000,
            holder: 'x',
            now: ctx.now(),
          })
        ).length,
        0
      );

      ctx.advance(2_000);
      const reaped = await ctx.queue.reap();
      assert.equal(reaped.requeued, 1);
      assert.equal(reaped.uncertain, 1);
      assert.equal((await store.findByDocumentId(ctx.strapi, a.outboxId)).status, 'pending');
      const uncertain = await store.findByDocumentId(ctx.strapi, b.outboxId);
      assert.equal(uncertain.status, 'uncertain');
      assert.equal(uncertain.lastErrorCode, 'LEASE_EXPIRED_DURING_SEND');

      // The slow worker still holds the token: its late success marks the row sent.
      assert.equal(
        await store.fencedUpdate(ctx.strapi, rowB, { status: 'sent' }, ['sending', 'uncertain']),
        true
      );
      // A foreign token never writes.
      assert.equal(
        await store.fencedUpdate(
          ctx.strapi,
          { ...rowB, leaseToken: 'f'.repeat(32) },
          {
            status: 'failed',
          },
          ['sent']
        ),
        false
      );
    } finally {
      await ctx.close();
    }
  }
);

test(
  'idempotency key: the second enqueue returns the first row',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const first = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 12), {
        emailLog: null,
        source: 'content-api',
        idempotencyKey: 'order-42:welcome',
      });
      const second = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 12), {
        emailLog: { documentId: 'log-dup' },
        source: 'content-api',
        idempotencyKey: 'order-42:welcome',
      });
      assert.equal(second.duplicate, true);
      assert.equal(second.outboxId, first.outboxId);
      const other = await ctx.queue.findDuplicate('service', 'order-42:welcome');
      assert.equal(other, null, 'keys are scoped per source');
      const [{ total }] = await ctx.knex(fixtures.OUTBOX_TABLE).count({ total: '*' });
      assert.equal(Number(total), 1);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'retries prefer another account than the one that failed last',
  { skip: !hasSqlite },
  async () => {
    const accounts = [
      fixtures.smtpAccount('alpha', smtp.port, { isPrimary: true, priority: 5 }),
      fixtures.smtpAccount('beta', smtp.port, { priority: 1 }),
    ];
    const ctx = await setup({ accounts });
    try {
      // 451 after DATA proves non-acceptance: the worker fails over in the same run.
      const first = await ctx.queue.enqueue(fixtures.preparedMessage('t1', 13), {
        emailLog: null,
        source: 'service',
      });
      await drain(ctx.queue);
      let row = await store.findByDocumentId(ctx.strapi, first.outboxId);
      assert.equal(row.status, 'sent');
      assert.equal(row.attempts, 1, 'one queue attempt, two accounts');
      assert.equal(row.accountUsed, 'beta');
      assert.equal(receivedFor(first.outboxId).length, 2);

      // A row whose last attempt used the primary account starts with the other one.
      const second = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 131), {
        emailLog: null,
        source: 'service',
      });
      await ctx
        .knex(fixtures.OUTBOX_TABLE)
        .where({ document_id: second.outboxId })
        .update({ last_account_document_id: 'accalpha' });
      await drain(ctx.queue);
      row = await store.findByDocumentId(ctx.strapi, second.outboxId);
      assert.equal(row.status, 'sent');
      assert.equal(row.accountUsed, 'beta');
    } finally {
      await ctx.close();
    }
  }
);

test('payload size limit and DTO never leak content', { skip: !hasSqlite }, async () => {
  const ctx = await setup({ queueConfig: { maxPayloadBytes: 2048 } });
  try {
    const big = { ...fixtures.preparedMessage('ok', 14), html: `<p>${'x'.repeat(4096)}</p>` };
    assert.throws(() => ctx.queue.assertQueueable(big), {
      code: 'MAGIC_MAIL_VALIDATION',
    });
    const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 15), {
      emailLog: null,
      source: 'service',
    });
    const listed = await ctx.queue.list({ page: 1, pageSize: 10 });
    assert.equal(listed.data.length, 1);
    const detail = await ctx.queue.detail(outboxId);
    const json = JSON.stringify({ listed, detail });
    for (const forbidden of [
      'payload"',
      'leaseToken',
      'idempotencyKeyHash',
      'recipientHash',
      'Synthetic body',
    ]) {
      assert.ok(!json.includes(forbidden), `DTO must not contain ${forbidden}`);
    }
    const stats = await ctx.queue.stats();
    assert.equal(stats.counts.pending, 1);
    assert.equal(stats.dueNow, 1);
    assert.ok(stats.oldestPendingAgeMs >= 0);
  } finally {
    await ctx.close();
  }
});

test(
  'send(): queue:true returns the queued shape without dispatching inline',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const before = smtp.received.length;
      const result = await ctx.router.send(
        { to: 'ok@example.test', subject: 'Synthetic', text: 'Hello' },
        { queue: true, idempotencyKey: 'k-1' }
      );
      assert.equal(result.success, true);
      assert.equal(result.queued, true);
      assert.equal(result.status, 'pending');
      assert.ok(result.outboxId);
      assert.equal(smtp.received.length, before, 'nothing sent inline');
      const dup = await ctx.router.send(
        { to: 'ok@example.test', subject: 'Synthetic', text: 'Hello' },
        { queue: true, idempotencyKey: 'k-1' }
      );
      assert.equal(dup.duplicate, true);
      assert.equal(dup.outboxId, result.outboxId);
      await assert.rejects(
        ctx.router.send(
          { to: 'ok@example.test', subject: 'S', text: 'x' },
          { queue: true, allowInactive: true }
        ),
        { code: 'MAGIC_MAIL_VALIDATION' }
      );
    } finally {
      await ctx.close();
    }
  }
);

test(
  'send(): without the owner setting failures throw exactly as before and nothing is queued',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      await assert.rejects(
        ctx.router.send({ to: 'r451@example.test', subject: 'Synthetic', text: 'x' }),
        (error) => error.responseCode === 451 && error.magicMailOutboxId === undefined
      );
      const ok = await ctx.router.send({ to: 'ok@example.test', subject: 'Synthetic', text: 'x' });
      assert.equal(ok.success, true);
      assert.equal(ok.queued, undefined);
      assert.deepEqual(Object.keys(ok).sort(), ['accountUsed', 'messageId', 'success']);
      const [{ total }] = await ctx.knex(fixtures.OUTBOX_TABLE).count({ total: '*' });
      assert.equal(Number(total), 0);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'send(): queueFailedSends captures transient (resolves), ambiguous (throws + id), not permanent',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup({ settings: { queueFailedSends: true } });
    try {
      const transient = await ctx.router.send({
        to: 'r451@example.test',
        subject: 'Synthetic',
        text: 'x',
      });
      assert.equal(transient.success, true);
      assert.equal(transient.queued, true);
      assert.equal(transient.status, 'pending');
      const row = await store.findByDocumentId(ctx.strapi, transient.outboxId);
      assert.equal(row.createdVia, 'capture-on-failure');
      assert.equal(row.maxAttempts, 3);
      assert.equal(row.attempts, 0);
      assert.equal(row.nextAttemptAt - ctx.now(), 60_000);

      await assert.rejects(
        ctx.router.send({ to: 'dropafter@example.test', subject: 'Synthetic', text: 'x' }),
        (error) => {
          assert.ok(error.magicMailOutboxId, 'ambiguous failure recorded');
          return true;
        }
      );
      await assert.rejects(
        ctx.router.send({ to: 'r550@example.test', subject: 'Synthetic', text: 'x' }),
        (error) => error.responseCode === 550 && !error.magicMailOutboxId
      );
      // queue:false keeps 4.3 semantics even with the setting on.
      await assert.rejects(
        ctx.router.send(
          { to: 'r451@example.test', subject: 'Synthetic', text: 'x' },
          { queue: false }
        )
      );
      // Explicit accounts are never captured.
      await assert.rejects(
        ctx.router.send({
          to: 'r451@example.test',
          subject: 'S',
          text: 'x',
          accountName: 'primary',
        })
      );
      const counts = await store.countByStatus(ctx.strapi);
      assert.equal(counts.pending, 1);
      assert.equal(counts.uncertain, 1);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'send(): an ambiguous inline failure never fails over; with queueFailedSends it is uncertain',
  { skip: !hasSqlite },
  async () => {
    const backup = await startFakeSmtp({ fixedMode: 'ok' });
    const accounts = [
      fixtures.smtpAccount('alpha', smtp.port, { isPrimary: true, priority: 5 }),
      fixtures.smtpAccount('beta', backup.port, { priority: 1 }),
    ];
    for (const queueFailedSends of [false, true]) {
      const ctx = await setup({ accounts, settings: { queueFailedSends } });
      try {
        const backupBefore = backup.received.length;
        await assert.rejects(
          ctx.router.send({ to: 'dropafter@example.test', subject: 'Synthetic', text: 'x' }),
          (error) => {
            assert.equal(error.code, 'ECONNECTION');
            assert.equal(Boolean(error.magicMailOutboxId), queueFailedSends);
            return true;
          }
        );
        assert.equal(backup.received.length, backupBefore, 'not handed to the second account');
        const counts = await store.countByStatus(ctx.strapi);
        assert.equal(counts.uncertain || 0, queueFailedSends ? 1 : 0);
        assert.equal(counts.pending || 0, 0);

        // Proven non-acceptance (451 after DATA) still fails over inline.
        const result = await ctx.router.send({
          to: 'r451@example.test',
          subject: 'Synthetic',
          text: 'x',
        });
        assert.equal(result.accountUsed, 'beta');
        assert.equal(result.queued, undefined);
      } finally {
        await ctx.close();
      }
    }
    await backup.close();
  }
);

test('forgetRecipient deletes rows by recipient hash', { skip: !hasSqlite }, async () => {
  const ctx = await setup();
  try {
    await ctx.queue.enqueue(fixtures.preparedMessage('ok', 16), { emailLog: null, source: 's' });
    await ctx.queue.enqueue(fixtures.preparedMessage('other', 17), { emailLog: null, source: 's' });
    assert.equal(await ctx.queue.forgetRecipient('OK@example.test'), 1);
    const [{ total }] = await ctx.knex(fixtures.OUTBOX_TABLE).count({ total: '*' });
    assert.equal(Number(total), 1);
  } finally {
    await ctx.close();
  }
});

test('retention removes sent rows and old payloads', { skip: !hasSqlite }, async () => {
  const ctx = await setup();
  try {
    const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 18), {
      emailLog: null,
      source: 's',
    });
    await drain(ctx.queue);
    const old = new Date(Date.now() - 40 * 24 * 3_600_000);
    await ctx.knex(fixtures.OUTBOX_TABLE).update({ updated_at: old });
    const result = await store.purgeRetention(ctx.strapi, {
      sentDays: 7,
      unresolvedDays: 14,
      rowDays: 30,
    });
    assert.equal(result.rowsDeleted, 1);
    assert.equal(await store.findByDocumentId(ctx.strapi, outboxId), null);
  } finally {
    await ctx.close();
  }
});

test(
  'retention: an unresolved row is removed rowDays after its last change, not after the content purge',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 19), {
        emailLog: null,
        source: 's',
      });
      const day = 24 * 3_600_000;
      const start = Date.now();
      // A failed row whose last state change was 20 days ago.
      await ctx
        .knex(fixtures.OUTBOX_TABLE)
        .where({ document_id: outboxId })
        .update({ status: 'failed', updated_at: new Date(start - 20 * day) });
      const retention = { sentDays: 7, unresolvedDays: 14, rowDays: 30 };
      // Day 20: the content is past unresolvedDays and is purged; the row stays.
      let result = await store.purgeRetention(ctx.strapi, retention, start);
      assert.equal(result.payloadsCleared, 1);
      assert.equal(result.rowsDeleted, 0);
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.payload ?? null, null);
      // Day 31: the row is removed (30 days after its last state change).
      result = await store.purgeRetention(ctx.strapi, retention, start + 11 * day);
      assert.equal(result.rowsDeleted, 1);
      assert.equal(await store.findByDocumentId(ctx.strapi, outboxId), null);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'a database error on the sent write never re-sends an accepted message',
  { skip: !hasSqlite },
  async () => {
    const original = store.fencedUpdate;
    const refused = () =>
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const ctx = await setup();
    try {
      ctx.queue.setTestHooks({ sleep: async () => {} });

      // 1) One failed write: retried, recorded as sent, one delivery.
      const once = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 31), {
        emailLog: null,
        source: 'service',
      });
      let failures = 1;
      store.fencedUpdate = async (strapi, row, fields, statuses) => {
        if (fields.status === 'sent' && failures > 0) {
          failures -= 1;
          throw refused();
        }
        return original(strapi, row, fields, statuses);
      };
      await ctx.queue.runOnce();
      let row = await store.findByDocumentId(ctx.strapi, once.outboxId);
      assert.equal(row.status, 'sent');
      assert.equal(receivedFor(once.outboxId).length, 1);

      // 2) The write keeps failing: the row is never pending again, the
      // reaper marks it uncertain and the worker never sends it twice.
      const always = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 32), {
        emailLog: null,
        source: 'service',
      });
      store.fencedUpdate = async (strapi, target, fields, statuses) => {
        if (fields.status === 'sent') throw refused();
        return original(strapi, target, fields, statuses);
      };
      await ctx.queue.runOnce();
      store.fencedUpdate = original;
      row = await store.findByDocumentId(ctx.strapi, always.outboxId);
      assert.equal(row.status, 'sending');
      assert.equal(row.phase, 'dispatching');
      assert.ok(
        !ctx.events.some(
          (e) => e.name === 'magic-mail.queue.sent' && e.payload.outboxId === always.outboxId
        )
      );

      ctx.advance(QUEUE_CONFIG.leaseMs + 1_000);
      await ctx.queue.reap();
      for (let i = 0; i < 5; i += 1) {
        ctx.advance(3_600_000);
        await ctx.queue.runOnce();
        await ctx.queue.reap();
      }
      row = await store.findByDocumentId(ctx.strapi, always.outboxId);
      assert.equal(row.status, 'uncertain');
      assert.equal(row.lastErrorCode, 'LEASE_EXPIRED_DURING_SEND');
      const accepted = receivedFor(always.outboxId).filter((entry) => entry.accepted);
      assert.equal(accepted.length, 1, 'exactly one accepted delivery');
    } finally {
      store.fencedUpdate = original;
      await ctx.close();
    }
  }
);

test(
  'a database error after the first dispatch is ambiguous, never transient',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    const router = ctx.router;
    const original = router.routeAndDispatch;
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 33), {
        emailLog: null,
        source: 'service',
      });
      router.routeAndDispatch = async function (data, routingCtx) {
        await routingCtx.onBeforeDispatch({ documentId: 'acc-1', name: 'primary' });
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      };
      await ctx.queue.runOnce();
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'uncertain');
      assert.equal(row.lastErrorClass, 'ambiguous');
    } finally {
      router.routeAndDispatch = original;
      await ctx.close();
    }
  }
);

test(
  'admin retry of a pending row keeps its remaining automatic retries',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('r451', 34), {
        emailLog: null,
        source: 'service',
      });
      await ctx.queue.runOnce();
      let row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'pending');
      assert.equal(row.attempts, 1);
      assert.equal(row.maxAttempts, 4);
      await ctx.queue.retry(outboxId, { adminId: 1 });
      row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'pending');
      assert.equal(row.maxAttempts, 4, 'budget kept');
      await ctx.queue.runOnce();
      row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'pending', 'still retried after the manual attempt');
      assert.equal(row.attempts, 2);
    } finally {
      await ctx.close();
    }
  }
);

test(
  'send(): a failed Strapi-provider fallback is captured only when an account can send it later',
  { skip: !hasSqlite },
  async () => {
    const refused = () =>
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    // No MagicMail account at all: the worker could never deliver it.
    const none = await setup({ accounts: [], settings: { queueFailedSends: true } });
    try {
      let calls = 0;
      await assert.rejects(
        none.router.send(
          { to: 'ok@example.test', subject: 'Synthetic', text: 'x' },
          {
            source: 'strapi-email',
            fallbackSend: async () => {
              calls += 1;
              throw refused();
            },
          }
        ),
        { code: 'ECONNREFUSED' }
      );
      assert.equal(calls, 1);
      const [{ total }] = await none.knex(fixtures.OUTBOX_TABLE).count({ total: '*' });
      assert.equal(Number(total), 0, 'nothing captured');
    } finally {
      await none.close();
    }

    // Quota exhausted: a later quota window can deliver it.
    const limited = await setup({
      accounts: [fixtures.smtpAccount('primary', smtp.port, { isPrimary: true, hourlyLimit: 1 })],
      settings: { queueFailedSends: true },
    });
    try {
      const first = await limited.router.send({
        to: 'ok@example.test',
        subject: 'Synthetic',
        text: 'x',
      });
      assert.equal(first.success, true);
      const second = await limited.router.send(
        { to: 'ok@example.test', subject: 'Synthetic', text: 'x' },
        { source: 'strapi-email', fallbackSend: async () => Promise.reject(refused()) }
      );
      assert.equal(second.queued, true);
      assert.equal(second.status, 'pending');
    } finally {
      await limited.close();
    }
  }
);

test(
  'Content API: idempotency keys are scoped per API token (no cross-caller suppression)',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    const previous = global.strapi;
    global.strapi = ctx.strapi;
    try {
      const controller = require('../server/src/controllers/controller');
      const call = async (tokenId) => {
        const request = {
          request: {
            body: {
              to: 'ok@example.test',
              subject: 'Synthetic',
              text: 'x',
              queue: true,
              idempotencyKey: 'reset-42',
            },
          },
          state: {
            auth: { strategy: { name: 'content-api-token' }, credentials: { id: tokenId } },
          },
          body: undefined,
        };
        await controller.send(request);
        return request.body;
      };
      const a = await call(1);
      const b = await call(2);
      const a2 = await call(1);
      assert.equal(a.queued, true);
      assert.equal(b.queued, true);
      assert.notEqual(b.outboxId, a.outboxId, 'token 2 gets its own row');
      assert.equal(b.duplicate, undefined);
      assert.equal(a2.duplicate, true, 'the same token is de-duplicated');
      assert.equal(a2.outboxId, a.outboxId);
      const [{ total }] = await ctx.knex(fixtures.OUTBOX_TABLE).count({ total: '*' });
      assert.equal(Number(total), 2);
    } finally {
      if (previous === undefined) delete global.strapi;
      else global.strapi = previous;
      await ctx.close();
    }
  }
);

test(
  'a claim lost during a slow token step aborts the send (no duplicate after the reaper)',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    const original = ctx.router.sendViaAccount;
    try {
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('ok', 35), {
        emailLog: null,
        source: 'service',
      });
      let providerCalls = 0;
      ctx.router.sendViaAccount = async function (account, attempt) {
        // The token refresh stalls past the lease; the reaper takes the row.
        ctx.advance(QUEUE_CONFIG.leaseMs + 1_000);
        await ctx.queue.reap();
        await this.confirmDispatchClaim(attempt.__dispatch);
        providerCalls += 1;
        return original.call(this, account, attempt);
      };
      await ctx.queue.runOnce();
      assert.equal(providerCalls, 0, 'provider never called without the claim');
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.status, 'uncertain');
      assert.equal(receivedFor(outboxId).length, 0);
    } finally {
      ctx.router.sendViaAccount = original;
      await ctx.close();
    }
  }
);

test(
  'a sender deadline is final: retry never extends it and is refused after it passed',
  { skip: !hasSqlite },
  async () => {
    const ctx = await setup();
    try {
      const deadline = new Date(ctx.now() + 15 * 60_000);
      const { outboxId } = await ctx.queue.enqueue(fixtures.preparedMessage('dropafter', 41), {
        emailLog: null,
        source: 'service',
        notAfter: deadline,
      });
      await drain(ctx.queue);
      const retried = await ctx.queue.retry(outboxId, { confirmDuplicateRisk: true, adminId: 1 });
      assert.equal(retried.status, 'pending');
      const row = await store.findByDocumentId(ctx.strapi, outboxId);
      assert.equal(row.notAfter, deadline.getTime(), 'retry keeps the sender deadline');
      await drain(ctx.queue);
      ctx.advance(16 * 60_000);
      await assert.rejects(ctx.queue.retry(outboxId, { confirmDuplicateRisk: true, adminId: 1 }), {
        code: 'DEADLINE_PASSED',
      });
    } finally {
      await ctx.close();
    }
  }
);
