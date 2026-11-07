'use strict';

const crypto = require('crypto');
const coordination = require('../utils/coordination');
const store = require('../utils/outbox-store');
const { encryptPayload, decryptPayload, purposeHmac } = require('../utils/encryption');
const {
  backoffDelay,
  combineOutcome,
  classifyDeliveryError,
  sanitizeErrorCode,
} = require('../utils/delivery-outcome');
const { normalizeMessageId } = require('../utils/message-id');

const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';

const DEFAULT_QUEUE_CONFIG = Object.freeze({
  worker: true,
  pollIntervalMs: 10_000,
  batchSize: 5,
  concurrency: 2,
  leaseMs: 180_000,
  backoffMs: [60_000, 300_000, 900_000],
  jitterRatio: 0.2,
  maxAgeHours: 24,
  maxPayloadBytes: 10 * 1024 * 1024,
  maxDispatchPerMinute: 120,
  retention: { sentDays: 7, unresolvedDays: 14, rowDays: 30 },
});

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
const REAPER_INTERVAL_MS = 60_000;
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Message fields stored in the encrypted payload (the prepared message). */
const PAYLOAD_FIELDS = [
  'to',
  'cc',
  'bcc',
  'replyTo',
  'subject',
  'text',
  'html',
  'headers',
  'type',
  'priority',
  'from',
  'accountName',
  'unsubscribeUrl',
  '__forceUnsubscribe',
  'templateReferenceId',
  'templateName',
  'templateId',
  'customField',
];

/**
 * Creates an error with a stable code and a client-safe message.
 *
 * @param {string} code
 * @param {string} message
 * @param {number} [status]
 * @returns {Error}
 */
function queueError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

/** Thrown inside a dispatch when this process lost its claim. */
class LeaseLostError extends Error {
  constructor() {
    super('[magic-mail] Outbox claim lost before dispatch');
    this.name = 'LeaseLostError';
    this.code = 'MAGIC_MAIL_LEASE_LOST';
  }
}

/**
 * Send queue (outbox) service.
 *
 * - enqueue(): stores a prepared message (encrypted) for the worker.
 * - capture(): stores a send that failed after failover (owner setting).
 * - runOnce(): one worker tick (claim, dispatch, record the outcome).
 * - reap()/maintain(): crash recovery, expiry and retention (leased jobs).
 * - admin actions (list, detail, retry, discard, mark-sent, delete) and stats.
 *
 * Without a database table (unit-test doubles) every write path reports
 * "unavailable" and send() keeps its 4.3 behaviour.
 */
module.exports = ({ strapi }) => {
  const holder = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const state = {
    inFlight: 0,
    running: false,
    stopped: false,
    nudged: false,
    clock: () => Date.now(),
    random: Math.random,
  };

  const now = () => state.clock();

  /** @returns {typeof DEFAULT_QUEUE_CONFIG} */
  const config = () => {
    let configured;
    try {
      configured = strapi.config?.get?.('plugin::magic-mail.queue', {}) || {};
    } catch {
      configured = {};
    }
    return {
      ...DEFAULT_QUEUE_CONFIG,
      ...configured,
      retention: { ...DEFAULT_QUEUE_CONFIG.retention, ...(configured.retention || {}) },
    };
  };

  const router = () => strapi.plugin('magic-mail').service('email-router');

  /**
   * Emits a queue event after the write (best effort, no personal data).
   *
   * @param {string} name - e.g. 'sent'
   * @param {object} row
   * @param {object} [extra]
   */
  const emit = async (name, row, extra = {}) => {
    try {
      if (!strapi.eventHub || typeof strapi.eventHub.emit !== 'function') return;
      await strapi.eventHub.emit(`magic-mail.queue.${name}`, {
        outboxId: row.documentId,
        emailId: row.emailId || null,
        status: extra.status || row.status,
        attempts: extra.attempts ?? row.attempts,
        maxAttempts: row.maxAttempts,
        code: extra.code ?? row.lastErrorCode ?? null,
        errorClass: extra.errorClass ?? row.lastErrorClass ?? null,
        accountName: extra.accountName ?? row.accountUsed ?? null,
        source: row.source || null,
      });
    } catch (error) {
      strapi.log.warn('[magic-mail] [QUEUE] Event listener failed:', error?.name || 'Error');
    }
  };

  /**
   * Updates the delivery log of a row (best effort).
   *
   * @param {object} row
   * @param {object} fields
   * @param {object} queueInfo - merged into metadata.queue
   */
  const updateLog = async (row, fields, queueInfo) => {
    if (!row.emailLogDocumentId) return;
    try {
      const documents = strapi.documents(EMAIL_LOG_UID);
      const current = await documents.findOne({
        documentId: row.emailLogDocumentId,
        fields: ['metadata'],
      });
      if (!current) return;
      const metadata =
        current.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      await documents.update({
        documentId: row.emailLogDocumentId,
        data: {
          ...fields,
          metadata: {
            ...metadata,
            queue: { ...(metadata.queue || {}), outboxId: row.documentId, ...queueInfo },
          },
        },
      });
    } catch (error) {
      strapi.log.error('[magic-mail] [QUEUE] Email log update failed:', error?.name || 'Error');
    }
  };

  /**
   * Builds the payload object (prepared message) from the working copy.
   *
   * @param {object} data
   * @returns {object}
   */
  const toPayload = (data) => {
    const payload = {};
    for (const field of PAYLOAD_FIELDS) {
      if (data[field] !== undefined && data[field] !== null) payload[field] = data[field];
    }
    payload.attachments = (Array.isArray(data.attachments) ? data.attachments : []).map(
      (attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        ...(attachment.cid ? { cid: attachment.cid } : {}),
        content: Buffer.isBuffer(attachment.content)
          ? attachment.content.toString('base64')
          : Buffer.from(String(attachment.content || ''), 'utf8').toString('base64'),
        encoding: 'base64',
      })
    );
    return payload;
  };

  /** @param {object} payload @returns {number} JSON size in bytes */
  const payloadSize = (payload) => Buffer.byteLength(JSON.stringify(payload), 'utf8');

  /** @param {string} source @param {string} [key] @returns {string} */
  const hashKey = (source, key) =>
    crypto
      .createHash('sha256')
      .update(
        key
          ? `${String(source || 'service')}:${key}`
          : `random:${crypto.randomBytes(16).toString('hex')}`
      )
      .digest('hex');

  /** @param {*} to @returns {string|null} */
  const recipientHashFor = (to) => {
    try {
      const first = router().listRecipientAddresses(to)[0];
      return first ? purposeHmac('outbox-recipient', first) : null;
    } catch {
      return null;
    }
  };

  /** Start of the next clock hour plus up to 60 s jitter (capacity deferral). */
  const nextQuotaWindow = (from) =>
    Math.ceil((from + 1) / 3_600_000) * 3_600_000 + Math.floor(state.random() * 60_000);

  /**
   * Result returned to send() callers for a queued message (additive keys).
   *
   * @param {object} row
   * @param {object} [extra]
   * @returns {object}
   */
  const queuedResult = (row, extra = {}) => ({
    success: true,
    queued: true,
    status: row.status,
    outboxId: row.documentId,
    ...(row.emailId ? { emailId: row.emailId } : {}),
    accountUsed: row.status === 'sent' ? row.accountUsed || null : null,
    messageId: row.status === 'sent' ? row.providerMessageId || null : null,
    ...extra,
  });

  /**
   * Stores a prepared message.
   *
   * @param {object} data - prepared working copy from send()
   * @param {object} options
   * @returns {Promise<{row: object, duplicate: boolean}>}
   * @throws {Error} QUEUE_PAYLOAD_TOO_LARGE / MAGIC_MAIL_QUEUE_UNAVAILABLE
   */
  const insertPrepared = async (data, options) => {
    const cfg = config();
    const payload = toPayload(data);
    const bytes = payloadSize(payload);
    if (bytes > cfg.maxPayloadBytes) {
      throw queueError('QUEUE_PAYLOAD_TOO_LARGE', 'The message is too large for the send queue');
    }
    const idempotencyKeyHash = hashKey(options.source, options.idempotencyKey);
    const created = now();
    const notAfter =
      options.notAfter instanceof Date && Number.isFinite(options.notAfter.getTime())
        ? options.notAfter.getTime()
        : created + cfg.maxAgeHours * 3_600_000;
    const messageIdLocal = crypto.randomBytes(12).toString('hex');
    const encrypted = encryptPayload(
      {
        ...payload,
        messageIdLocal,
        ...(options.accountDocumentId ? { accountDocumentId: options.accountDocumentId } : {}),
      },
      idempotencyKeyHash
    );
    return store.insert(strapi, {
      status: options.status || 'pending',
      phase: 'queued',
      attempts: 0,
      maxAttempts: options.maxAttempts,
      nextAttemptAt: options.nextAttemptAt ?? created,
      notAfter,
      leaseToken: null,
      leaseUntil: null,
      claimedBy: null,
      lastErrorCode: options.lastErrorCode || null,
      lastErrorClass: options.lastErrorClass || null,
      lastErrorAt: options.lastErrorCode ? new Date(created) : null,
      errorHistory: options.errorHistory || [],
      accountUsed: null,
      lastAccountDocumentId: options.lastAccountDocumentId || null,
      providerMessageId: null,
      emailLogDocumentId: options.emailLog?.documentId || null,
      emailId: options.emailLog?.emailId || null,
      idempotencyKeyHash,
      recipientHash: recipientHashFor(data.to),
      source: String(options.source || 'service').slice(0, 32),
      createdVia: options.createdVia,
      createdByUser: Number.isInteger(options.createdByUser) ? options.createdByUser : null,
      priorityRank: PRIORITY_RANK[data.priority] ?? 1,
      messageIdLocal,
      payload: encrypted,
      payloadBytes: bytes,
      sentAt: null,
      resolvedAt: null,
      resolvedBy: null,
    });
  };

  /** Owner setting: queue max attempts (1..10, default 3). */
  const ownerMaxAttempts = async () => {
    try {
      const settings = await strapi.plugin('magic-mail').service('plugin-settings').getSettings();
      const value = Number(settings?.queueMaxAttempts);
      return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 3;
    } catch {
      return 3;
    }
  };

  const service = {
    DEFAULT_QUEUE_CONFIG,

    /** @returns {typeof DEFAULT_QUEUE_CONFIG} effective queue config */
    getConfig: config,

    /** @returns {boolean} true when the outbox table exists */
    isAvailable() {
      return store.isAvailable(strapi);
    },

    /**
     * Test hook: replace the clock and random source.
     * @param {{clock?: () => number, random?: () => number}} hooks
     */
    setTestHooks({ clock, random } = {}) {
      if (clock) state.clock = clock;
      if (random) state.random = random;
    },

    /**
     * Throws when a payload would exceed the queue limit (before a log is
     * created).
     *
     * @param {object} data
     * @throws {Error} ValidationError QUEUE_PAYLOAD_TOO_LARGE
     */
    assertQueueable(data) {
      if (payloadSize(toPayload(data)) > config().maxPayloadBytes) {
        throw router().createValidationError(
          'The message is too large for the send queue',
          'QUEUE_PAYLOAD_TOO_LARGE'
        );
      }
      if (!store.isAvailable(strapi)) {
        throw queueError('MAGIC_MAIL_QUEUE_UNAVAILABLE', 'The send queue is not available', 503);
      }
    },

    /**
     * Returns the result for an idempotency key that was already queued.
     *
     * @param {string} source
     * @param {string} key
     * @returns {Promise<object|null>}
     */
    async findDuplicate(source, key) {
      if (!key || !store.isAvailable(strapi)) return null;
      const row = await store.findByHash(strapi, hashKey(source, key));
      return row ? queuedResult(row, { duplicate: true }) : null;
    },

    /**
     * Queues a prepared message (`send(..., { queue: true })`).
     *
     * @param {object} data - prepared working copy
     * @param {{emailLog: object|null, source: string, idempotencyKey?: string, notAfter?: Date, accountDocumentId?: string, createdByUser?: number}} options
     * @returns {Promise<object>} queued result
     * @sideeffect Inserts an outbox row; updates the email log; nudges the local worker
     */
    async enqueue(data, options) {
      const maxAttempts = (await ownerMaxAttempts()) + 1;
      const { row, duplicate } = await insertPrepared(data, {
        ...options,
        createdVia: 'queue-option',
        maxAttempts,
      });
      if (duplicate) {
        // Lost the race to a concurrent enqueue with the same key: drop the log
        // this call created, nothing is queued twice.
        if (options.emailLog?.documentId) {
          try {
            await strapi
              .documents(EMAIL_LOG_UID)
              .delete({ documentId: options.emailLog.documentId });
          } catch {
            // best effort
          }
        }
        return queuedResult(row, { duplicate: true });
      }
      await updateLog(row, { deliveryStatus: 'pending' }, { status: 'pending' });
      await emit('enqueued', row);
      service.nudge();
      return queuedResult(row);
    },

    /**
     * Stores a send that failed after failover (owner setting
     * `queueFailedSends`). Returns null when it can not be captured (payload
     * too large, no table, key already used); the caller then throws the
     * original error as before.
     *
     * @param {object} data - prepared working copy
     * @param {{emailLog: object|null, source: string, errorClass: string, error: *, attempted?: string[], lastAccountDocumentId?: string, idempotencyKey?: string, notAfter?: Date}} options
     * @returns {Promise<object|null>} the stored row
     * @sideeffect Inserts an outbox row
     */
    async capture(data, options) {
      if (!store.isAvailable(strapi)) return null;
      const cfg = config();
      const at = now();
      const errorClass = options.errorClass;
      const code = sanitizeErrorCode(options.error);
      const status = errorClass === 'ambiguous' ? 'uncertain' : 'pending';
      let nextAttemptAt = at + backoffDelay(1, cfg.backoffMs, cfg.jitterRatio, state.random);
      if (errorClass === 'capacity') nextAttemptAt = nextQuotaWindow(at);
      try {
        const { row, duplicate } = await insertPrepared(data, {
          ...options,
          status,
          createdVia: 'capture-on-failure',
          maxAttempts: await ownerMaxAttempts(),
          nextAttemptAt,
          lastErrorCode: code,
          lastErrorClass: errorClass,
          errorHistory: store.appendHistory([], {
            code,
            errorClass,
            account: options.attempted?.length ? options.attempted.at(-1) : null,
            at,
          }),
        });
        if (duplicate) return null;
        await emit(status === 'uncertain' ? 'uncertain' : 'enqueued', row);
        return row;
      } catch (error) {
        strapi.log.warn(
          '[magic-mail] [QUEUE] Failed send could not be queued:',
          error?.code || error?.name || 'Error'
        );
        return null;
      }
    },

    /** Result shape for a captured row (used by send()). */
    queuedResult,

    /**
     * Wakes the local worker soon (after an enqueue).
     */
    nudge() {
      if (state.stopped || state.nudged || config().worker === false) return;
      state.nudged = true;
      setImmediate(() => {
        state.nudged = false;
        service.runOnce().catch(() => {});
      });
    },

    /**
     * One worker tick: claim due rows (within the shared dispatch budget) and
     * dispatch them with at most `concurrency` sends in flight.
     *
     * @returns {Promise<{claimed: number}>}
     */
    async runOnce() {
      if (state.stopped || state.running || !store.isAvailable(strapi)) return { claimed: 0 };
      const cfg = config();
      const free = cfg.concurrency - state.inFlight;
      if (free <= 0) return { claimed: 0 };
      state.running = true;
      let rows;
      try {
        rows = await store.claimDue(strapi, {
          limit: Math.min(cfg.batchSize, free),
          leaseMs: cfg.leaseMs,
          holder,
          now: now(),
        });
        if (rows.length === 0) return { claimed: 0 };

        // Shared budget across processes; rows over budget go back unchanged.
        const hit = await coordination.hitRateLimit(strapi, 'queue-dispatch', 60_000, rows.length);
        if (hit && hit.count > cfg.maxDispatchPerMinute) {
          const allowed = Math.max(0, rows.length - (hit.count - cfg.maxDispatchPerMinute));
          const surplus = rows.splice(allowed);
          for (const row of surplus) {
            await store.fencedUpdate(strapi, row, {
              status: 'pending',
              phase: 'queued',
              leaseToken: null,
              leaseUntil: null,
              claimedBy: null,
              nextAttemptAt: hit.resetAt + Math.floor(state.random() * 5_000),
            });
          }
        }
      } finally {
        state.running = false;
      }

      state.inFlight += rows.length;
      await Promise.allSettled(
        rows.map((row) =>
          service.processRow(row).finally(() => {
            state.inFlight -= 1;
          })
        )
      );
      return { claimed: rows.length };
    },

    /**
     * Dispatches one claimed row and records the outcome. Every write is
     * fenced by the claim.
     *
     * @param {object} row - claimed row with payload
     * @returns {Promise<string>} resulting status ('lost' when the claim was lost)
     */
    async processRow(row) {
      const cfg = config();
      const startedAt = now();

      if (row.notAfter && startedAt > row.notAfter) {
        return service.finishFailure(row, { code: 'EXPIRED', errorClass: 'expired' }, false);
      }

      let payload;
      try {
        payload = decryptPayload(row.payload, row.idempotencyKeyHash);
      } catch {
        strapi.log.error('[magic-mail] [QUEUE] Outbox payload could not be read');
        return service.finishFailure(
          row,
          { code: 'PAYLOAD_UNREADABLE', errorClass: 'permanent' },
          false
        );
      }

      const { messageIdLocal, accountDocumentId, ...message } = payload;
      const data = {
        ...message,
        __outboxId: row.documentId,
        __messageIdLocal: messageIdLocal,
      };

      let defaultFromName;
      try {
        const settings = await strapi.plugin('magic-mail').service('plugin-settings').getSettings();
        defaultFromName = settings?.defaultFromName || '';
      } catch {
        defaultFromName = '';
      }

      let dispatched = false;
      const ctx = {
        source: row.source || 'queue',
        defaultFromName,
        attempted: [],
        skipped: [],
        attemptOutcomes: [],
        trackOutcome: true,
        strictFailover: true,
        bounded: true,
        softExclude: row.lastAccountDocumentId ? [row.lastAccountDocumentId] : [],
        ...(accountDocumentId ? { accountDocumentId } : {}),
        onBeforeDispatch: async (account) => {
          const fields = {
            phase: 'dispatching',
            leaseUntil: now() + cfg.leaseMs,
            lastAccountDocumentId: account?.documentId || null,
          };
          if (!dispatched) fields.attemptsIncrement = true;
          const owned = await store.fencedUpdate(strapi, row, fields);
          if (!owned) throw new LeaseLostError();
          if (!dispatched) row.attempts = (row.attempts || 0) + 1;
          dispatched = true;
          row.lastAccountDocumentId = fields.lastAccountDocumentId;
        },
      };

      try {
        const routing = await router().routeAndDispatch(data, ctx);
        const providerMessageId = normalizeMessageId(routing.result?.messageId);
        const owned = await store.fencedUpdate(
          strapi,
          row,
          {
            status: 'sent',
            phase: 'queued',
            payload: null,
            accountUsed: routing.account?.name || null,
            providerMessageId,
            sentAt: new Date(now()),
            leaseUntil: null,
          },
          ['sending', 'uncertain']
        );
        if (!owned) {
          strapi.log.warn('[magic-mail] [QUEUE] Sent, but the claim had expired');
        }
        const sentRow = {
          ...row,
          status: 'sent',
          accountUsed: routing.account?.name || null,
          providerMessageId,
        };
        await updateLog(
          sentRow,
          {
            deliveryStatus: 'sent',
            deliveredAt: new Date(now()),
            accountId: routing.account?.documentId || null,
            accountName: routing.account?.name || null,
            providerMessageId,
          },
          { status: 'sent', attempts: row.attempts }
        );
        await emit('sent', sentRow);
        return 'sent';
      } catch (error) {
        if (error instanceof LeaseLostError || error?.code === 'MAGIC_MAIL_LEASE_LOST') {
          strapi.log.warn('[magic-mail] [QUEUE] Claim lost; another process owns the row');
          return 'lost';
        }
        const errorClass = combineOutcome(ctx.attemptOutcomes, error);
        return service.finishFailure(
          row,
          {
            code: sanitizeErrorCode(error),
            errorClass,
            account: ctx.attempted.length ? ctx.attempted.at(-1) : null,
          },
          !dispatched && errorClass !== 'capacity'
        );
      }
    },

    /**
     * Records a failed queue attempt (fenced).
     *
     * @param {object} row - claimed row
     * @param {{code: string, errorClass: string, account?: string|null}} outcome
     * @param {boolean} countAttempt - add an attempt (no provider call happened)
     * @returns {Promise<string>} resulting status
     */
    async finishFailure(row, { code, errorClass, account = null }, countAttempt) {
      const cfg = config();
      const at = now();
      const attempts = (row.attempts || 0) + (countAttempt ? 1 : 0);
      const history = store.appendHistory(row.errorHistory, { code, errorClass, account, at });
      const common = {
        lastErrorCode: code,
        lastErrorClass: errorClass,
        lastErrorAt: new Date(at),
        errorHistory: history,
        leaseUntil: null,
        ...(countAttempt ? { attemptsIncrement: true } : {}),
      };

      let status;
      let fields;
      if (errorClass === 'capacity' && (!row.notAfter || at < row.notAfter)) {
        status = 'pending';
        fields = {
          status,
          phase: 'queued',
          leaseToken: null,
          claimedBy: null,
          nextAttemptAt: nextQuotaWindow(at),
        };
      } else if (errorClass === 'transient' && attempts < (row.maxAttempts || 1)) {
        const retryNumber = row.createdVia === 'capture-on-failure' ? attempts + 1 : attempts;
        status = 'pending';
        fields = {
          status,
          phase: 'queued',
          leaseToken: null,
          claimedBy: null,
          nextAttemptAt:
            at + backoffDelay(retryNumber, cfg.backoffMs, cfg.jitterRatio, state.random),
        };
      } else if (errorClass === 'ambiguous') {
        status = 'uncertain';
        fields = { status, leaseToken: null };
      } else {
        status = 'failed';
        fields = { status, phase: 'queued', leaseToken: null };
        if (errorClass === 'capacity') {
          fields.lastErrorCode = 'EXPIRED';
          fields.lastErrorClass = 'expired';
        }
      }

      const owned = await store.fencedUpdate(strapi, row, { ...common, ...fields });
      if (!owned) return 'lost';
      const updated = {
        ...row,
        ...fields,
        attempts,
        lastErrorCode: fields.lastErrorCode || code,
        lastErrorClass: fields.lastErrorClass || errorClass,
      };
      if (status === 'pending') {
        await emit('retry-scheduled', updated);
      } else if (status === 'uncertain') {
        await updateLog(updated, {}, { status: 'uncertain', attempts });
        await emit('uncertain', updated);
      } else {
        await updateLog(updated, { deliveryStatus: 'failed' }, { status: 'failed', attempts });
        await emit('failed', updated);
      }
      return status;
    },

    /**
     * Crash recovery for expired claims (runs under a database lease).
     *
     * @returns {Promise<{requeued: number, uncertain: number}>}
     */
    async reap() {
      if (!store.isAvailable(strapi)) return { requeued: 0, uncertain: 0 };
      const result = await store.reapExpired(strapi, now());
      for (const row of result.rows) {
        await updateLog(row, {}, { status: 'uncertain', attempts: row.attempts });
        await emit('uncertain', row, {
          code: 'LEASE_EXPIRED_DURING_SEND',
          errorClass: 'ambiguous',
        });
      }
      const expired = await store.expirePending(strapi, now());
      for (const row of expired) {
        await updateLog(row, { deliveryStatus: 'failed' }, { status: 'failed' });
        await emit('failed', row, { code: 'EXPIRED', errorClass: 'expired', status: 'failed' });
      }
      if (result.requeued > 0) service.nudge();
      return { requeued: result.requeued, uncertain: result.uncertain, expired: expired.length };
    },

    /**
     * Retention: payloads and rows per `queue.retention`.
     *
     * @returns {Promise<{payloadsCleared: number, rowsDeleted: number}>}
     */
    async maintain() {
      if (!store.isAvailable(strapi)) return { payloadsCleared: 0, rowsDeleted: 0 };
      return store.purgeRetention(strapi, config().retention, now());
    },

    /**
     * Deletes every queued row of one recipient (GDPR erasure): rows whose
     * primary recipient hash matches and rows linked to that recipient's
     * email logs.
     *
     * @param {string} address
     * @returns {Promise<number>} rows deleted
     * @sideeffect Deletes outbox rows
     */
    async forgetRecipient(address) {
      if (!store.isAvailable(strapi) || typeof address !== 'string' || !address.trim()) return 0;
      const normalized = address.trim().toLowerCase();
      let deleted = await store.deleteByRecipientHash(
        strapi,
        purposeHmac('outbox-recipient', normalized)
      );
      try {
        const logs = await strapi.documents(EMAIL_LOG_UID).findMany({
          filters: { recipient: { $eqi: normalized } },
          fields: ['documentId'],
          limit: 1000,
        });
        const { table, col } = store.resolve(strapi);
        const ids = (logs || []).map((log) => log.documentId).filter(Boolean);
        if (ids.length > 0) {
          deleted += Number(
            await table()
              .whereIn(col('emailLogDocumentId'), ids)
              .whereNot(col('status'), 'sending')
              .del()
          );
        }
      } catch {
        // the hash lookup above already covered rows of this recipient
      }
      return deleted;
    },

    /**
     * Starts this process's worker timer, reaper and maintenance jobs.
     *
     * @param {(handle: object) => object} registerTimer
     */
    start(registerTimer) {
      state.stopped = false;
      const cfg = config();
      const log = strapi.log;

      const reapJob = async () => {
        try {
          await coordination.runSingleton(strapi, 'outbox-reaper', REAPER_INTERVAL_MS - 5_000, () =>
            service.reap()
          );
        } catch (error) {
          log.warn('[magic-mail] [QUEUE] Reaper failed:', error?.name || 'Error');
        }
      };
      const maintenanceJob = async () => {
        try {
          await coordination.runSingleton(
            strapi,
            'outbox-maintenance',
            MAINTENANCE_INTERVAL_MS - 5 * 60_000,
            () => service.maintain()
          );
        } catch (error) {
          log.warn('[magic-mail] [QUEUE] Maintenance failed:', error?.name || 'Error');
        }
      };
      registerTimer(setTimeout(reapJob, 15_000 + Math.floor(Math.random() * 15_000)));
      registerTimer(setInterval(reapJob, REAPER_INTERVAL_MS));
      registerTimer(setTimeout(maintenanceJob, 120_000 + Math.floor(Math.random() * 60_000)));
      registerTimer(setInterval(maintenanceJob, MAINTENANCE_INTERVAL_MS));

      if (cfg.worker === false) {
        log.info('[magic-mail] [QUEUE] Worker disabled in this process (queue.worker: false)');
        return;
      }
      const schedule = () => {
        if (state.stopped) return;
        const delay = cfg.pollIntervalMs + Math.floor(Math.random() * (cfg.pollIntervalMs / 2));
        const handle = setTimeout(async () => {
          try {
            await service.runOnce();
          } catch (error) {
            log.warn('[magic-mail] [QUEUE] Worker tick failed:', error?.name || 'Error');
          }
          schedule();
        }, delay);
        registerTimer(handle);
      };
      schedule();
    },

    /** Stops scheduling new ticks (timers are cleared by destroy). */
    stop() {
      state.stopped = true;
    },

    // ─────────────────────────── admin ───────────────────────────

    /**
     * Admin list. Recipient and subject come from the linked email log; the
     * payload is never returned.
     *
     * @param {object} query - validated `outbox.listQuery`
     * @returns {Promise<{data: object[], pagination: object}>}
     */
    async list(query) {
      const { rows, total, page, pageSize } = await store.list(strapi, query);
      const logs = await service.logSummaries(rows);
      return {
        data: rows.map((row) => service.toDto(row, logs.get(row.emailLogDocumentId))),
        pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
      };
    },

    /**
     * Admin detail (adds the sanitized error history).
     *
     * @param {string} documentId
     * @returns {Promise<object|null>}
     */
    async detail(documentId) {
      const row = await store.findByDocumentId(strapi, documentId);
      if (!row) return null;
      const logs = await service.logSummaries([row]);
      return {
        ...service.toDto(row, logs.get(row.emailLogDocumentId)),
        errorHistory: (row.errorHistory || []).map((entry) => ({
          at: entry.at,
          code: entry.code,
          class: entry.class,
          account: entry.account,
        })),
      };
    },

    /**
     * Loads recipient/subject of the linked email logs.
     *
     * @param {object[]} rows
     * @returns {Promise<Map<string, {recipient: string, subject: string}>>}
     */
    async logSummaries(rows) {
      const ids = [...new Set(rows.map((row) => row.emailLogDocumentId).filter(Boolean))];
      const map = new Map();
      if (ids.length === 0) return map;
      try {
        const logs = await strapi.documents(EMAIL_LOG_UID).findMany({
          filters: { documentId: { $in: ids } },
          fields: ['documentId', 'recipient', 'subject'],
          limit: ids.length,
        });
        for (const log of logs || []) {
          map.set(log.documentId, { recipient: log.recipient, subject: log.subject });
        }
      } catch {
        // rows render with "-"
      }
      return map;
    },

    /**
     * Admin DTO. Never contains the payload, lease token or hashes.
     *
     * @param {object} row
     * @param {{recipient?: string, subject?: string}} [log]
     * @returns {object}
     */
    toDto(row, log) {
      const iso = (value) => {
        const ms = store.toMillis(value);
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
      };
      return {
        documentId: row.documentId,
        status: row.status,
        attempts: row.attempts || 0,
        maxAttempts: row.maxAttempts || 0,
        nextAttemptAt: row.status === 'pending' ? iso(row.nextAttemptAt) : null,
        notAfter: iso(row.notAfter),
        lastErrorCode: row.lastErrorCode || null,
        lastErrorClass: row.lastErrorClass || null,
        lastErrorAt: iso(row.lastErrorAt),
        accountUsed: row.accountUsed || null,
        source: row.source || null,
        createdVia: row.createdVia || null,
        emailId: row.emailId || null,
        recipient: log?.recipient || null,
        subject: log?.subject || null,
        hasPayload: row.payload === undefined ? undefined : Boolean(row.payload),
        createdAt: iso(row.createdAt),
        sentAt: iso(row.sentAt),
        resolvedAt: iso(row.resolvedAt),
      };
    },

    /**
     * Schedules a failed, uncertain or pending row for an immediate attempt.
     *
     * @param {string} documentId
     * @param {{confirmDuplicateRisk?: boolean, adminId?: number}} options
     * @returns {Promise<object>} updated DTO
     * @throws {Error} NOT_FOUND, MAGIC_MAIL_CONFIRMATION_REQUIRED, PAYLOAD_PURGED, STATE_CHANGED
     * @sideeffect Updates the row; the worker may send the message again
     */
    async retry(documentId, { confirmDuplicateRisk = false, adminId } = {}) {
      const row = await store.findByDocumentId(strapi, documentId, { withPayload: true });
      if (!row) throw queueError('NOT_FOUND', 'Queued message not found', 404);
      if (!['failed', 'uncertain', 'pending'].includes(row.status)) {
        throw queueError('STATE_CHANGED', 'This message can not be retried now', 409);
      }
      if (!row.payload) {
        throw queueError('PAYLOAD_PURGED', 'The message content was already removed', 409);
      }
      if (row.status === 'uncertain' && confirmDuplicateRisk !== true) {
        throw queueError(
          'MAGIC_MAIL_CONFIRMATION_REQUIRED',
          'Confirm the duplicate risk to retry an uncertain message',
          409
        );
      }
      const at = now();
      const ok = await store.conditionalUpdate(strapi, documentId, [row.status], {
        status: 'pending',
        phase: 'queued',
        nextAttemptAt: at,
        maxAttempts: (row.attempts || 0) + 1,
        leaseToken: null,
        leaseUntil: null,
        claimedBy: null,
        resolvedBy: Number.isInteger(adminId) ? adminId : null,
        resolvedAt: new Date(at),
        notAfter: Math.max(row.notAfter || 0, at + config().maxAgeHours * 3_600_000),
      });
      if (!ok) throw queueError('STATE_CHANGED', 'The message was changed meanwhile', 409);
      const updated = await store.findByDocumentId(strapi, documentId);
      await updateLog(updated, { deliveryStatus: 'pending' }, { status: 'pending' });
      await emit('resolved', updated, { status: 'pending' });
      service.nudge();
      return service.detail(documentId);
    },

    /**
     * Discards a failed, uncertain or pending row (payload removed).
     *
     * @param {string} documentId
     * @param {{adminId?: number}} options
     * @returns {Promise<object>}
     * @throws {Error} NOT_FOUND, STATE_CHANGED
     * @sideeffect Deletes the stored message content
     */
    async discard(documentId, { adminId } = {}) {
      const row = await store.findByDocumentId(strapi, documentId);
      if (!row) throw queueError('NOT_FOUND', 'Queued message not found', 404);
      if (!['failed', 'uncertain', 'pending'].includes(row.status)) {
        throw queueError('STATE_CHANGED', 'This message can not be discarded now', 409);
      }
      const at = now();
      const ok = await store.conditionalUpdate(strapi, documentId, [row.status], {
        status: 'discarded',
        phase: 'queued',
        payload: null,
        leaseToken: null,
        leaseUntil: null,
        resolvedBy: Number.isInteger(adminId) ? adminId : null,
        resolvedAt: new Date(at),
      });
      if (!ok) throw queueError('STATE_CHANGED', 'The message was changed meanwhile', 409);
      const updated = { ...row, status: 'discarded' };
      await updateLog(updated, { deliveryStatus: 'failed' }, { status: 'discarded' });
      await emit('discarded', updated);
      return service.detail(documentId);
    },

    /**
     * Marks an uncertain row as sent after the owner verified delivery.
     *
     * @param {string} documentId
     * @param {{adminId?: number}} options
     * @returns {Promise<object>}
     * @throws {Error} NOT_FOUND, STATE_CHANGED
     */
    async markSent(documentId, { adminId } = {}) {
      const row = await store.findByDocumentId(strapi, documentId);
      if (!row) throw queueError('NOT_FOUND', 'Queued message not found', 404);
      if (row.status !== 'uncertain') {
        throw queueError('STATE_CHANGED', 'Only uncertain messages can be marked as sent', 409);
      }
      const at = now();
      const ok = await store.conditionalUpdate(strapi, documentId, ['uncertain'], {
        status: 'sent',
        payload: null,
        leaseToken: null,
        leaseUntil: null,
        sentAt: new Date(at),
        resolvedBy: Number.isInteger(adminId) ? adminId : null,
        resolvedAt: new Date(at),
      });
      if (!ok) throw queueError('STATE_CHANGED', 'The message was changed meanwhile', 409);
      const updated = { ...row, status: 'sent' };
      await updateLog(
        updated,
        { deliveryStatus: 'sent', deliveredAt: new Date(at) },
        { status: 'sent', markedByAdmin: true }
      );
      await emit('resolved', updated, { status: 'sent' });
      return service.detail(documentId);
    },

    /**
     * Deletes final rows (sent, failed, discarded) older than a date.
     *
     * @param {Date} olderThan
     * @returns {Promise<number>}
     */
    async deleteFinal(olderThan) {
      return store.deleteFinal(strapi, olderThan);
    },

    /** @returns {Promise<object>} queue metrics */
    async stats() {
      if (!store.isAvailable(strapi)) return null;
      return store.stats(strapi, now());
    },
  };

  return service;
};

module.exports.DEFAULT_QUEUE_CONFIG = DEFAULT_QUEUE_CONFIG;
module.exports.LeaseLostError = LeaseLostError;
module.exports.__test__ = { classifyDeliveryError };
