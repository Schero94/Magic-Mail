'use strict';

const { errors } = require('@strapi/utils');
const { createState, verifyAndConsumeState } = require('../utils/oauth-state');
const { renderOAuthCallback } = require('../utils/oauth-callback-response');
const { toAccountListDTO } = require('../utils/account-dto');
const { decryptCredentials } = require('../utils/encryption');
const { validate, handleControllerError } = require('../validation');

/**
 * OAuth Controller
 * Handles OAuth flows for Gmail, Microsoft and Yahoo.
 *
 * SECURITY:
 * - The three public callback routes never interpolate the request-supplied
 *   code, state or provider error into their HTML (renderOAuthCallback).
 * - The signed state is bound to the client id, the initiating admin user
 *   and, for a reconnect, the account. The PKCE verifier stays server-side.
 * - Provider error details never reach the client; the admin gets a fixed
 *   message and the server log only the error class.
 */

const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';

/**
 * Returns the authenticated admin user id (bound into the OAuth state).
 *
 * @param {import('koa').Context} ctx
 * @returns {string|number|null}
 */
const adminUserId = (ctx) => ctx.state?.user?.id ?? null;

/**
 * Loads an OAuth account and its decrypted app credentials.
 *
 * @param {string} accountId - documentId
 * @param {string} provider - 'gmail' | 'microsoft' | 'yahoo'
 * @returns {Promise<{account: object, config: object}>}
 * @throws {errors.NotFoundError|errors.ValidationError}
 */
async function loadOAuthAccount(accountId, provider) {
  const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({ documentId: String(accountId) });
  if (!account) {
    throw new errors.NotFoundError('Email account not found');
  }
  if (account.provider !== `${provider}-oauth`) {
    throw new errors.ValidationError('This account does not use this OAuth provider');
  }
  let config;
  try {
    config = decryptCredentials(account.config) || {};
  } catch {
    throw new errors.ValidationError(
      'The stored OAuth app credentials can not be decrypted. Re-enter the client secret in the account settings first.'
    );
  }
  if (!config.clientId || !config.clientSecret) {
    throw new errors.ValidationError('The account has no OAuth client ID and secret');
  }
  return { account, config };
}

/**
 * Starts an OAuth flow: signs a one-time state with PKCE and returns the
 * provider authorize URL plus the redirect URI to register with the
 * provider (the UI shows exactly this value).
 *
 * Query: `clientId` (and `tenantId` for Microsoft) for a new account, or
 * `accountId` to reconnect an existing account with its stored app
 * credentials.
 *
 * @param {import('koa').Context} ctx
 * @param {'gmail'|'microsoft'|'yahoo'} provider
 * @returns {Promise<void>}
 */
async function startFlow(ctx, provider) {
  try {
    const query = validate('oauth.auth', ctx.query || {});
    let { clientId, tenantId } = query;
    let accountId = null;

    if (query.accountId) {
      const { account, config } = await loadOAuthAccount(query.accountId, provider);
      accountId = account.documentId;
      clientId = config.clientId;
      tenantId = config.tenantId;
    }

    if (!clientId) {
      return ctx.badRequest('Client ID is required');
    }
    if (provider === 'microsoft' && !tenantId) {
      return ctx.badRequest('Tenant ID is required');
    }

    const oauthService = strapi.plugin('magic-mail').service('oauth');
    const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
      clientId,
      provider,
      userId: adminUserId(ctx),
      accountId,
      usePKCE: true,
    });

    const pkce = { codeChallenge, codeChallengeMethod };
    let authUrl;
    if (provider === 'gmail') authUrl = oauthService.getGmailAuthUrl(clientId, state, pkce);
    else if (provider === 'microsoft') authUrl = oauthService.getMicrosoftAuthUrl(clientId, tenantId, state, pkce);
    else authUrl = oauthService.getYahooAuthUrl(clientId, state, pkce);

    ctx.body = {
      authUrl,
      redirectUri: oauthService.getRedirectUri(provider),
      message: 'Redirect user to this URL to authorize',
    };
  } catch (err) {
    // Configuration problems the admin can fix (fixed, server-authored texts).
    if (err?.message === 'Invalid Microsoft tenant ID' || /^OAuth needs a public https URL/.test(err?.message || '')) {
      return ctx.badRequest(err.message);
    }
    handleControllerError(ctx, err, `[magic-mail] ${provider} OAuth init failed`, 'Could not start the OAuth flow');
  }
}

/**
 * Verifies and consumes the state for a token exchange.
 *
 * @param {import('koa').Context} ctx
 * @param {object} params
 * @returns {Promise<{payload: object, codeVerifier: string|null}>}
 * @throws {errors.ValidationError} On any verification failure
 */
async function consumeState(ctx, { state, provider, clientId, accountId }) {
  let verification;
  try {
    verification = await verifyAndConsumeState(strapi, state, {
      clientId,
      userId: adminUserId(ctx),
      accountId: accountId || null,
    });
  } catch {
    strapi.log.warn('[magic-mail] OAuth state verification failed');
    throw new errors.ValidationError('Invalid or expired OAuth state. Please restart the authorization flow.');
  }
  if (verification.payload.provider !== provider) {
    strapi.log.warn('[magic-mail] OAuth state/provider mismatch');
    throw new errors.ValidationError('OAuth state provider mismatch');
  }
  return verification;
}

/**
 * Exchanges the code; maps every upstream failure to one fixed message.
 *
 * @returns {Promise<object>} token data with email
 * @throws {errors.ApplicationError}
 */
async function exchange(provider, code, config, codeVerifier) {
  let tokenData;
  try {
    tokenData = await strapi.plugin('magic-mail').service('oauth').exchangeCode(provider, code, config, codeVerifier);
  } catch (err) {
    strapi.log.error(`[magic-mail] ${provider} OAuth token exchange failed: ${err?.name || 'Error'}`);
    throw new errors.ApplicationError(
      'The OAuth provider rejected the authorization. Check the client ID, client secret and redirect URI, then try again.'
    );
  }
  if (!tokenData?.email) {
    throw new errors.ApplicationError(`The ${provider} account did not provide an email address`);
  }
  return tokenData;
}

module.exports = {
  /** @route GET /magic-mail/oauth/gmail/auth */
  async gmailAuth(ctx) {
    return startFlow(ctx, 'gmail');
  },

  /** @route GET /magic-mail/oauth/gmail/callback (public, state-protected) */
  async gmailCallback(ctx) {
    renderOAuthCallback(ctx, 'gmail');
  },

  /** @route GET /magic-mail/oauth/microsoft/auth */
  async microsoftAuth(ctx) {
    return startFlow(ctx, 'microsoft');
  },

  /** @route GET /magic-mail/oauth/microsoft/callback (public, state-protected) */
  async microsoftCallback(ctx) {
    renderOAuthCallback(ctx, 'microsoft');
  },

  /** @route GET /magic-mail/oauth/yahoo/auth */
  async yahooAuth(ctx) {
    return startFlow(ctx, 'yahoo');
  },

  /** @route GET /magic-mail/oauth/yahoo/callback (public, state-protected) */
  async yahooCallback(ctx) {
    renderOAuthCallback(ctx, 'yahoo');
  },

  /**
   * Creates an email account from a completed OAuth flow. The state must
   * have been issued to the same admin user for the same client id.
   *
   * @route POST /magic-mail/oauth/create-account
   */
  async createOAuthAccount(ctx) {
    try {
      const { provider, code, state, accountDetails } = validate('oauth.createOAuthAccount', ctx.request.body);
      const config = accountDetails.config;

      if (provider === 'microsoft' && !config.tenantId) {
        throw new errors.ValidationError('Tenant ID is required for Microsoft OAuth');
      }

      const { codeVerifier } = await consumeState(ctx, { state, provider, clientId: config.clientId, accountId: null });
      const tokenData = await exchange(provider, code, config, codeVerifier);

      const account = await strapi.plugin('magic-mail').service('oauth').storeOAuthAccount(
        provider,
        tokenData,
        accountDetails,
        config
      );

      ctx.body = {
        success: true,
        data: toAccountListDTO(account),
        message: 'OAuth account created successfully',
      };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Create OAuth account failed', 'Could not create the OAuth account');
    }
  },

  /**
   * Re-authorizes an existing OAuth account (revoked consent, expired or
   * rotated-away refresh token). Uses the stored app credentials; the flow
   * must have been started with `?accountId=<documentId>` by the same admin,
   * and the provider must return the account's own mailbox.
   *
   * @route POST /magic-mail/oauth/reconnect/:accountId
   */
  async reconnectOAuthAccount(ctx) {
    try {
      const { accountId } = ctx.params;
      const { provider, code, state } = validate('oauth.reconnect', ctx.request.body);
      const { account, config } = await loadOAuthAccount(accountId, provider);

      const { codeVerifier } = await consumeState(ctx, {
        state,
        provider,
        clientId: config.clientId,
        accountId: account.documentId,
      });
      const tokenData = await exchange(provider, code, config, codeVerifier);

      let updated;
      try {
        updated = await strapi.plugin('magic-mail').service('oauth').updateOAuthTokens(account, tokenData);
      } catch (err) {
        if (err?.code === 'MAILBOX_MISMATCH') {
          throw new errors.ValidationError(
            'You authorized a different mailbox. Sign in with the address this account sends from.'
          );
        }
        throw err;
      }

      ctx.body = {
        success: true,
        data: toAccountListDTO(updated),
        message: 'OAuth account reconnected',
      };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Reconnect OAuth account failed', 'Could not reconnect the OAuth account');
    }
  },
};
