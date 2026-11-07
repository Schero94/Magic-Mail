'use strict';

const { validate, handleControllerError } = require('../validation');
const { isContentApiToken } = require('../utils/auth-strategy');

const USER_UID = 'plugin::users-permissions.user';

/**
 * Loads a Strapi error class, with a plain Error fallback for unit tests.
 * @param {string} name - e.g. 'ForbiddenError'
 * @param {string} message
 * @returns {Error}
 */
function strapiError(name, message) {
  try {
    const { errors } = require('@strapi/utils');
    return new errors[name](message);
  } catch {
    const error = new Error(message);
    error.name = name;
    return error;
  }
}

/**
 * Returns true when users-permissions roles may call the send routes. By
 * default only API tokens may send (`contentApi.allowUserRoles: false`).
 * @returns {boolean}
 */
function userRolesAllowed() {
  try {
    return strapi.config.get('plugin::magic-mail.contentApi.allowUserRoles', false) === true;
  } catch {
    return false;
  }
}

/**
 * Enforces the send-route authentication policy and resolves the user the
 * email log is attributed to.
 *
 * - API token: allowed. A `userId` in the body must reference an existing
 *   users-permissions user.
 * - users-permissions user: rejected unless `contentApi.allowUserRoles` is
 *   true; then the log is always attributed to the authenticated user and a
 *   body `userId` is ignored.
 * - Anything else: rejected.
 *
 * @param {import('koa').Context} ctx
 * @param {object} body - Validated payload (mutated: userId)
 * @returns {Promise<void>}
 * @throws {Error} ForbiddenError / ValidationError
 */
async function authorizeSender(ctx, body) {
  const strategy = ctx.state?.auth?.strategy?.name;

  if (isContentApiToken(ctx)) {
    if (body.userId !== undefined) {
      body.userId = await resolveExistingUserId(body.userId);
    }
    return;
  }

  if (strategy === 'users-permissions' && userRolesAllowed()) {
    const ownId = ctx.state?.user?.id;
    if (ownId) body.userId = ownId;
    else delete body.userId;
    return;
  }

  throw strapiError(
    'ForbiddenError',
    'MagicMail send routes accept API tokens only. Set contentApi.allowUserRoles to allow user roles.'
  );
}

/**
 * Verifies that a users-permissions user exists and returns its numeric id.
 * @param {string|number} userId - Numeric id or documentId
 * @returns {Promise<number>}
 * @throws {Error} ValidationError when the user does not exist
 */
async function resolveExistingUserId(userId) {
  const raw = String(userId);
  const where = /^\d+$/.test(raw) ? { id: Number(raw) } : { documentId: raw };
  let user;
  try {
    user = await strapi.db.query(USER_UID).findOne({ where, select: ['id'] });
  } catch {
    user = null;
  }
  if (!user) throw strapiError('ValidationError', 'userId does not reference an existing user');
  return user.id;
}

/**
 * Send queue options from a validated body (additive, optional fields).
 * @param {boolean|undefined} queue
 * @param {string|undefined} idempotencyKey
 * @param {import('koa').Context} ctx - Authenticated request (scopes the key)
 * @returns {{queue?: boolean, idempotencyKey?: string, idempotencyScope?: string}}
 */
function queueOptions(queue, idempotencyKey, ctx) {
  const scope = idempotencyKey ? callerScope(ctx) : null;
  return {
    ...(typeof queue === 'boolean' ? { queue } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(scope ? { idempotencyScope: scope } : {}),
  };
}

/**
 * Stable identity of the authenticated Content-API caller, used to scope
 * idempotency keys so two callers never share one key space. Strapi stores
 * the strategy result in `ctx.state.auth.credentials` (the API token entity
 * for `content-api-token`, the user for `users-permissions`).
 *
 * @param {import('koa').Context} ctx
 * @returns {string|null} e.g. `token:12` or `user:7`
 */
function callerScope(ctx) {
  if (isContentApiToken(ctx)) {
    const id = ctx.state?.auth?.credentials?.id;
    return id !== undefined && id !== null ? `token:${id}` : null;
  }
  const userId = ctx.state?.user?.id;
  return userId !== undefined && userId !== null ? `user:${userId}` : null;
}

/**
 * Main Controller - Content-API send routes.
 *
 * Every endpoint validates its payload with Zod BEFORE any service call.
 * Attachments are bounded in count (20) and size (25 MB each); file-path and
 * URL attachments are rejected by the strict schema.
 */
module.exports = {
  async send(ctx) {
    try {
      const body = validate('content.send', { ...ctx.request.body });
      await authorizeSender(ctx, body);

      const { queue, idempotencyKey, ...message } = body;
      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.send(message, {
        source: 'content-api',
        ...queueOptions(queue, idempotencyKey, ctx),
      });

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error sending email', 'Failed to send email');
    }
  },

  async sendMessage(ctx) {
    try {
      const body = validate('content.sendMessage', { ...ctx.request.body });
      await authorizeSender(ctx, body);
      delete body.userId;

      const { queue, idempotencyKey, ...message } = body;
      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.sendMessage(message, {
        source: 'content-api',
        ...queueOptions(queue, idempotencyKey, ctx),
      });

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error sending message',
        'Failed to send message'
      );
    }
  },
};
