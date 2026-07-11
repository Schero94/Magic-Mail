'use strict';

const { createState, verifyAndConsumeState } = require('../utils/oauth-state');
const { renderOAuthCallback } = require('../utils/oauth-callback-response');
const { toAccountListDTO } = require('../utils/account-dto');

/**
 * OAuth Controller
 * Handles OAuth authentication flows for Gmail, Microsoft and Yahoo.
 *
 * SECURITY: The three public OAuth callback routes never interpolate the
 * request-supplied code, state, or provider error into their HTML. They
 * delegate to renderOAuthCallback, which serves a static, nonce-CSP page that
 * reads those values client-side from window.location.search.
 */

module.exports = {
  /**
   * Initiates the Gmail OAuth flow. Generates a signed, one-time state and a
   * PKCE challenge, then returns the upstream authorize URL.
   *
   * @route GET /magic-mail/oauth/gmail/auth
   */
  async gmailAuth(ctx) {
    try {
      const { clientId } = ctx.query;

      if (!clientId) {
        return ctx.badRequest('Client ID is required');
      }

      const oauthService = strapi.plugin('magic-mail').service('oauth');
      const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
        clientId,
        provider: 'gmail',
        usePKCE: true,
      });

      const authUrl = oauthService.getGmailAuthUrl(clientId, state, { codeChallenge, codeChallengeMethod });

      ctx.body = {
        authUrl,
        message: 'Redirect user to this URL to authorize',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Gmail OAuth init error:', err);
      ctx.throw(500, err.message);
    }
  },

  /**
   * Handles the Gmail OAuth callback. The response is a small HTML page that
   * forwards the code + state back to the parent admin tab via postMessage.
   * State/PKCE are verified later during token exchange.
   *
   * @route GET /magic-mail/oauth/gmail/callback
   */
  async gmailCallback(ctx) {
    renderOAuthCallback(ctx, 'gmail');
  },

  /**
   * Initiate Microsoft OAuth flow
   */
  async microsoftAuth(ctx) {
    try {
      const { clientId, tenantId } = ctx.query;
      
      if (!clientId) {
        return ctx.badRequest('Client ID is required');
      }
      
      if (!tenantId) {
        return ctx.badRequest('Tenant ID is required');
      }

      const oauthService = strapi.plugin('magic-mail').service('oauth');
      const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
        clientId,
        provider: 'microsoft',
        usePKCE: true,
      });

      const authUrl = oauthService.getMicrosoftAuthUrl(clientId, tenantId, state, { codeChallenge, codeChallengeMethod });

      ctx.body = {
        authUrl,
        message: 'Redirect user to this URL to authorize',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Microsoft OAuth init error:', err);
      ctx.throw(500, err.message);
    }
  },

  /**
   * Handles the Microsoft OAuth callback.
   * @route GET /magic-mail/oauth/microsoft/callback
   */
  async microsoftCallback(ctx) {
    renderOAuthCallback(ctx, 'microsoft');
  },

  /**
   * Initiate Yahoo OAuth flow
   */
  async yahooAuth(ctx) {
    try {
      const { clientId } = ctx.query;
      
      if (!clientId) {
        return ctx.badRequest('Client ID is required');
      }

      const oauthService = strapi.plugin('magic-mail').service('oauth');
      const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
        clientId,
        provider: 'yahoo',
        usePKCE: true,
      });

      const authUrl = oauthService.getYahooAuthUrl(clientId, state, { codeChallenge, codeChallengeMethod });

      ctx.body = {
        authUrl,
        message: 'Redirect user to this URL to authorize',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Yahoo OAuth init error:', err);
      ctx.throw(500, err.message);
    }
  },

  /**
   * Handles the Yahoo OAuth callback.
   * @route GET /magic-mail/oauth/yahoo/callback
   */
  async yahooCallback(ctx) {
    renderOAuthCallback(ctx, 'yahoo');
  },

  /**
   * Creates an email account from a completed OAuth flow.
   *
   * Verifies the signed state parameter (CSRF + TTL + one-time-use), retrieves
   * the PKCE verifier, then exchanges the code for tokens.
   *
   * @route POST /magic-mail/oauth/account
   * @throws {ValidationError} When state verification fails or inputs are missing
   */
  async createOAuthAccount(ctx) {
    try {
      const { validate } = require('../validation');
      const { provider, code, state, accountDetails } = validate('oauth.createOAuthAccount', ctx.request.body);

      strapi.log.info('[magic-mail] Creating OAuth account...');
      strapi.log.info('[magic-mail] Provider:', provider);

      if (!code) {
        return ctx.badRequest('OAuth code is required');
      }

      if (!accountDetails.config?.clientId || !accountDetails.config?.clientSecret) {
        return ctx.badRequest('Client ID and Secret are required');
      }

      let stateVerification;
      try {
        stateVerification = await verifyAndConsumeState(strapi, state, accountDetails.config.clientId);
      } catch (stateErr) {
        strapi.log.warn('[magic-mail] OAuth state verification failed:', stateErr.message);
        return ctx.badRequest('Invalid or expired OAuth state. Please restart the authorization flow.');
      }

      if (stateVerification.payload.provider && stateVerification.payload.provider !== provider) {
        strapi.log.warn('[magic-mail] OAuth state/provider mismatch');
        return ctx.badRequest('OAuth state provider mismatch');
      }

      const codeVerifier = stateVerification.codeVerifier;

      const oauthService = strapi.plugin('magic-mail').service('oauth');

      let tokenData;
      if (provider === 'gmail') {
        strapi.log.info('[magic-mail] Calling exchangeGoogleCode...');
        tokenData = await oauthService.exchangeGoogleCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret,
          { codeVerifier }
        );
      } else if (provider === 'microsoft') {
        strapi.log.info('[magic-mail] Calling exchangeMicrosoftCode...');

        if (!accountDetails.config.tenantId) {
          throw new Error('Tenant ID is required for Microsoft OAuth');
        }

        tokenData = await oauthService.exchangeMicrosoftCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret,
          accountDetails.config.tenantId,
          { codeVerifier }
        );
      } else if (provider === 'yahoo') {
        strapi.log.info('[magic-mail] Calling exchangeYahooCode...');
        tokenData = await oauthService.exchangeYahooCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret,
          { codeVerifier }
        );
      }
      
      strapi.log.info('[magic-mail] Token data received:', {
        email: tokenData.email,
        hasAccessToken: !!tokenData.accessToken,
        hasRefreshToken: !!tokenData.refreshToken,
      });

      if (!tokenData.email) {
        strapi.log.error('[magic-mail] No email in tokenData!');
        throw new Error(`Failed to get email from ${provider} OAuth`);
      }
      
      // Store account
      strapi.log.info('[magic-mail] Calling storeOAuthAccount...');
      const account = await oauthService.storeOAuthAccount(
        provider, 
        tokenData, 
        accountDetails,
        accountDetails.config // contains clientId and clientSecret
      );

      strapi.log.info('[magic-mail] [SUCCESS] OAuth account created successfully');

      ctx.body = {
        success: true,
        data: toAccountListDTO(account),
        message: 'OAuth account created successfully',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Create OAuth account error:', err);
      strapi.log.error('[magic-mail] Error stack:', err.stack);
      ctx.throw(500, err.message);
    }
  },
};

