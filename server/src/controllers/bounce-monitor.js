'use strict';

/**
 * Admin endpoints for mailbox bounce monitoring and the suppression list.
 * Responses carry status codes only, never message content, credentials or
 * full recipient addresses.
 */

const { errors } = require('@strapi/utils');
const { validate } = require('../validation');
const { decryptCredentials } = require('../utils/encryption');

const ACCOUNT_UID = 'plugin::magic-mail.email-account';
const ACCOUNT_ID = /^[A-Za-z0-9]{1,64}$/;

const service = () => strapi.plugin('magic-mail').service('bounce-monitor');

/**
 * Loads the raw account row (with encrypted blobs) by documentId.
 *
 * @param {string} accountId
 * @returns {Promise<object>}
 * @throws {errors.NotFoundError}
 */
async function loadAccount(accountId) {
  if (!ACCOUNT_ID.test(String(accountId || ''))) throw accountNotFound();
  const account = await strapi.db.query(ACCOUNT_UID).findOne({ where: { documentId: accountId } });
  if (!account) throw accountNotFound();
  return account;
}

/**
 * NotFoundError with an explicit status, so it renders as 404 even when the
 * host resolves a different @strapi/utils copy than @strapi/core.
 *
 * @returns {errors.NotFoundError}
 */
function accountNotFound() {
  const error = new errors.NotFoundError('Email account not found');
  Object.defineProperty(error, 'status', { value: 404, configurable: true, writable: true });
  return error;
}

/** Status payload shown in the account wizard. */
function statusPayload(account) {
  const monitor = service();
  const readConfig = () => {
    try {
      return decryptCredentials(account.config) || {};
    } catch {
      return {};
    }
  };
  const suggestedImapHost = monitor.suggestImapHost(readConfig().host);
  const status = monitor.statusFor(account);
  const oauth = account.provider === 'gmail-oauth' || account.provider === 'microsoft-oauth';
  return {
    ...status,
    readAccess: oauth ? monitor.hasReadScope(account) : null,
    suggestedImapHost,
  };
}

/**
 * Maps a monitor error to a 4xx with a stable code; anything else rethrows.
 *
 * @param {import('koa').Context} ctx
 * @param {*} error
 */
function sendMonitorError(ctx, error) {
  if (error?.name === 'BounceMonitorError') {
    ctx.status = error.code === 'UNSUPPORTED' ? 400 : 422;
    ctx.body = {
      error: {
        status: ctx.status,
        name: 'BounceMonitorError',
        message: 'Bounce monitoring failed',
        details: { code: error.code },
      },
    };
    return;
  }
  throw error;
}

module.exports = {
  /** @route GET /magic-mail/accounts/:accountId/bounce-monitor */
  async status(ctx) {
    const account = await loadAccount(ctx.params.accountId);
    ctx.body = { data: statusPayload(account) };
  },

  /** @route POST /magic-mail/accounts/:accountId/bounce-monitor/test */
  async test(ctx) {
    const account = await loadAccount(ctx.params.accountId);
    try {
      const result = await service().pollAccount(account, { testOnly: true });
      ctx.body = { data: { ok: true, messages: result.exists || 0 } };
    } catch (error) {
      sendMonitorError(ctx, error);
    }
  },

  /** @route POST /magic-mail/accounts/:accountId/bounce-monitor/check */
  async check(ctx) {
    const account = await loadAccount(ctx.params.accountId);
    if (!service().settingsFor(account).enabled) {
      return ctx.badRequest('Bounce monitoring is turned off for this account');
    }
    try {
      const { ran, result } = await require('../utils/coordination').runSingleton(
        strapi,
        `bounce-poll:${account.documentId}`,
        30_000,
        () => service().pollAccount(account)
      );
      const fresh = await loadAccount(account.documentId);
      ctx.body = {
        data: {
          ran,
          scanned: result?.scanned ?? 0,
          found: result?.found ?? 0,
          status: statusPayload(fresh),
        },
      };
    } catch (error) {
      sendMonitorError(ctx, error);
    }
  },

  /** @route GET /magic-mail/suppressions */
  async listSuppressed(ctx) {
    const { page, pageSize } = validate('suppressions.list', ctx.query || {});
    ctx.body = await service().listSuppressed({ page, pageSize });
  },

  /** @route DELETE /magic-mail/suppressions/:documentId */
  async removeSuppressed(ctx) {
    const { documentId } = ctx.params;
    if (!ACCOUNT_ID.test(String(documentId || ''))) return ctx.notFound('Entry not found');
    const removed = await service().removeSuppressed(documentId);
    if (!removed) return ctx.notFound('Entry not found');
    ctx.body = { data: { removed: true } };
  },

  /** @route POST /magic-mail/suppressions/remove-address */
  async removeSuppressedAddress(ctx) {
    const { email } = validate('suppressions.removeAddress', ctx.request.body || {});
    const removed = await service().removeSuppressedAddress(email);
    ctx.body = { data: { removed } };
  },
};
