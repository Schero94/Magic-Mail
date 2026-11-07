'use strict';

const { validate, handleControllerError } = require('../validation');

/** Codes of queue service errors that map to an HTTP status. */
const STATUS_BY_CODE = Object.freeze({
  NOT_FOUND: 404,
  STATE_CHANGED: 409,
  PAYLOAD_PURGED: 409,
  MAGIC_MAIL_CONFIRMATION_REQUIRED: 409,
});

/**
 * Sends a queue service error in Strapi's error envelope (409 has no Strapi
 * error class). Other errors go through handleControllerError.
 *
 * @param {import('koa').Context} ctx
 * @param {*} error
 * @param {string} logPrefix
 * @returns {boolean} true when the error was answered here
 */
function answerQueueError(ctx, error, logPrefix) {
  const status = STATUS_BY_CODE[error?.code];
  if (!status) return false;
  strapi.log.warn(`${logPrefix}: ${error.code}`);
  ctx.status = status;
  ctx.body = {
    data: null,
    error: {
      status,
      name: status === 404 ? 'NotFoundError' : 'ConflictError',
      message: error.message,
      details: { code: error.code },
    },
  };
  return true;
}

/** @returns {object} queue service */
const queue = () => strapi.plugin('magic-mail').service('queue');

/** @returns {number|undefined} acting admin user id */
const adminId = (ctx) => (Number.isInteger(ctx.state?.user?.id) ? ctx.state.user.id : undefined);

/**
 * Outbox (send queue) admin controller. Responses are DTOs: no payload,
 * lease token, hashes or provider error text.
 */
module.exports = {
  /**
   * @route GET /magic-mail/outbox
   * @access admin, plugin::magic-mail.queue.read
   * @param {import('koa').Context} ctx - query: status, lastErrorClass, source, from, to, page, pageSize
   * @returns {Promise<void>} `{ data: OutboxDto[], pagination, counts }`
   */
  async list(ctx) {
    try {
      const query = validate('outbox.listQuery', ctx.query);
      const result = await queue().list(query);
      const counts = await require('../utils/outbox-store').countByStatus(strapi);
      ctx.body = { ...result, counts };
    } catch (error) {
      handleControllerError(ctx, error, '[magic-mail] Error listing the outbox', 'Failed to load');
    }
  },

  /**
   * @route GET /magic-mail/outbox/:documentId
   * @access admin, plugin::magic-mail.queue.read
   * @returns {Promise<void>} `{ data: OutboxDto & { errorHistory } }` or 404
   */
  async findOne(ctx) {
    try {
      const { outboxId: documentId } = validate('outbox.documentId', {
        outboxId: ctx.params?.documentId,
      });
      const data = await queue().detail(documentId);
      if (!data) {
        answerQueueError(ctx, { code: 'NOT_FOUND', message: 'Queued message not found' }, 'outbox');
        return;
      }
      ctx.body = { data };
    } catch (error) {
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error loading an outbox row',
        'Failed to load'
      );
    }
  },

  /**
   * @route POST /magic-mail/outbox/:documentId/retry
   * @access admin, plugin::magic-mail.queue.manage
   * @param {import('koa').Context} ctx - body: { confirmDuplicateRisk?: boolean } (required for uncertain)
   * @returns {Promise<void>} `{ data }`; 404, or 409 with details.code
   * @sideeffect The worker sends the message again
   */
  async retry(ctx) {
    try {
      const { outboxId: documentId } = validate('outbox.documentId', {
        outboxId: ctx.params?.documentId,
      });
      const body = validate('outbox.retryBody', ctx.request.body || {});
      const data = await queue().retry(documentId, {
        confirmDuplicateRisk: body.confirmDuplicateRisk === true,
        adminId: adminId(ctx),
      });
      ctx.body = { data };
    } catch (error) {
      if (answerQueueError(ctx, error, '[magic-mail] Outbox retry refused')) return;
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error retrying an outbox row',
        'Retry failed'
      );
    }
  },

  /**
   * @route POST /magic-mail/outbox/:documentId/discard
   * @access admin, plugin::magic-mail.queue.manage
   * @returns {Promise<void>} `{ data }`; 404 or 409
   * @sideeffect Deletes the stored message content
   */
  async discard(ctx) {
    try {
      const { outboxId: documentId } = validate('outbox.documentId', {
        outboxId: ctx.params?.documentId,
      });
      const data = await queue().discard(documentId, { adminId: adminId(ctx) });
      ctx.body = { data };
    } catch (error) {
      if (answerQueueError(ctx, error, '[magic-mail] Outbox discard refused')) return;
      handleControllerError(ctx, error, '[magic-mail] Error discarding an outbox row', 'Failed');
    }
  },

  /**
   * @route POST /magic-mail/outbox/:documentId/mark-sent
   * @access admin, plugin::magic-mail.queue.manage
   * @returns {Promise<void>} `{ data }`; 404 or 409 (only uncertain rows)
   */
  async markSent(ctx) {
    try {
      const { outboxId: documentId } = validate('outbox.documentId', {
        outboxId: ctx.params?.documentId,
      });
      const data = await queue().markSent(documentId, { adminId: adminId(ctx) });
      ctx.body = { data };
    } catch (error) {
      if (answerQueueError(ctx, error, '[magic-mail] Outbox mark-sent refused')) return;
      handleControllerError(ctx, error, '[magic-mail] Error resolving an outbox row', 'Failed');
    }
  },

  /**
   * @route DELETE /magic-mail/outbox?olderThan=ISO
   * @access admin, plugin::magic-mail.queue.manage
   * @returns {Promise<void>} `{ deletedCount }` (sent, failed and discarded rows only)
   * @sideeffect Deletes outbox rows
   */
  async deleteFinal(ctx) {
    try {
      const { olderThan } = validate('outbox.deleteQuery', ctx.query);
      const deletedCount = await queue().deleteFinal(new Date(olderThan));
      ctx.body = { deletedCount };
    } catch (error) {
      handleControllerError(ctx, error, '[magic-mail] Error deleting outbox rows', 'Failed');
    }
  },

  /**
   * @route GET /magic-mail/analytics/queue-stats
   * @access admin, plugin::magic-mail.queue.read
   * @returns {Promise<void>} `{ data: QueueStats | null }` (counts and codes only)
   */
  async stats(ctx) {
    try {
      ctx.body = { data: await queue().stats() };
    } catch (error) {
      handleControllerError(ctx, error, '[magic-mail] Error loading queue stats', 'Failed');
    }
  },
};
