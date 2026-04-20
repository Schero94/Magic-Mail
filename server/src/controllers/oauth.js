'use strict';

const { createState, verifyAndConsumeState } = require('../utils/oauth-state');

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escapes a string for safe interpolation inside a single-quoted JS literal.
 *
 * Beyond the obvious CR/LF/quote escaping, we also escape the two Unicode
 * line separators U+2028 and U+2029. Both are treated as line terminators
 * by JavaScript's tokenizer (ECMA-262 §11.3) but are NOT matched by `\n` or
 * `\r` replacements. Without explicit escaping, a payload containing
 * U+2028 can break out of the surrounding string literal and inject code.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeJs(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Adds a Content-Security-Policy header to OAuth callback HTML responses.
 * @param {object} ctx - Koa context
 */
function setOAuthCallbackCsp(ctx) {
  ctx.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  ctx.set('X-Frame-Options', 'SAMEORIGIN');
  ctx.set('Referrer-Policy', 'no-referrer');
}

/**
 * OAuth Controller
 * Handles OAuth authentication flows for Gmail, Microsoft and Yahoo.
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
    try {
      const { code, state, error } = ctx.query;
      setOAuthCallbackCsp(ctx);

      if (error) {
        ctx.type = 'html';
        ctx.body = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth Failed</title>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 24px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="error">[ERROR] OAuth Authorization Failed</div>
            <p>Error: ${escapeHtml(error)}</p>
            <p>You can close this window and try again.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
        `;
        return;
      }

      if (!code) {
        return ctx.badRequest('No authorization code received');
      }

      // Success - send code to parent window and close popup
      ctx.type = 'html';
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { 
              font-family: system-ui; 
              text-align: center; 
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .success { font-size: 72px; margin: 20px 0; }
            .message { font-size: 24px; font-weight: 600; }
            .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">[SUCCESS]</div>
          <div class="message">Gmail OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'gmail-oauth-success',
                code: '${escapeJs(code)}',
                state: '${escapeJs(state)}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=' + encodeURIComponent('${escapeJs(code)}') + '&oauth_state=' + encodeURIComponent('${escapeJs(state)}');
              }, 2000);
            }
          </script>
        </body>
        </html>
      `;
    } catch (err) {
      strapi.log.error('[magic-mail] Gmail OAuth callback error:', err);
      ctx.throw(500, err.message);
    }
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
    try {
      const { code, state, error } = ctx.query;
      setOAuthCallbackCsp(ctx);

      if (error) {
        ctx.type = 'html';
        ctx.body = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth Failed</title>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 24px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="error">[ERROR] OAuth Authorization Failed</div>
            <p>Error: ${escapeHtml(error)}</p>
            <p>You can close this window and try again.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
        `;
        return;
      }

      if (!code) {
        return ctx.badRequest('No authorization code received');
      }

      // Success - send code to parent window and close popup
      ctx.type = 'html';
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { 
              font-family: system-ui; 
              text-align: center; 
              padding: 50px;
              background: linear-gradient(135deg, #00A4EF 0%, #0078D4 100%);
              color: white;
            }
            .success { font-size: 72px; margin: 20px 0; }
            .message { font-size: 24px; font-weight: 600; }
            .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">[SUCCESS]</div>
          <div class="message">Microsoft OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'microsoft-oauth-success',
                code: '${escapeJs(code)}',
                state: '${escapeJs(state)}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=' + encodeURIComponent('${escapeJs(code)}') + '&oauth_state=' + encodeURIComponent('${escapeJs(state)}');
              }, 2000);
            }
          </script>
        </body>
        </html>
      `;
    } catch (err) {
      strapi.log.error('[magic-mail] Microsoft OAuth callback error:', err);
      ctx.throw(500, err.message);
    }
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
    try {
      const { code, state, error } = ctx.query;
      setOAuthCallbackCsp(ctx);

      if (error) {
        ctx.type = 'html';
        ctx.body = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth Failed</title>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 24px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="error">[ERROR] OAuth Authorization Failed</div>
            <p>Error: ${escapeHtml(error)}</p>
            <p>You can close this window and try again.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
        `;
        return;
      }

      if (!code) {
        return ctx.badRequest('No authorization code received');
      }

      // Success - send code to parent window and close popup
      ctx.type = 'html';
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { 
              font-family: system-ui; 
              text-align: center; 
              padding: 50px;
              background: linear-gradient(135deg, #6001D2 0%, #410096 100%);
              color: white;
            }
            .success { font-size: 72px; margin: 20px 0; }
            .message { font-size: 24px; font-weight: 600; }
            .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">[SUCCESS]</div>
          <div class="message">Yahoo Mail OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'yahoo-oauth-success',
                code: '${escapeJs(code)}',
                state: '${escapeJs(state)}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=' + encodeURIComponent('${escapeJs(code)}') + '&oauth_state=' + encodeURIComponent('${escapeJs(state)}');
              }, 2000);
            }
          </script>
        </body>
        </html>
      `;
    } catch (err) {
      strapi.log.error('[magic-mail] Yahoo OAuth callback error:', err);
      ctx.throw(500, err.message);
    }
  },

  /**
   * Creates an email account from a completed OAuth flow.
   *
   * Verifies the signed state parameter (CSRF + TTL + one-time-use), retrieves
   * the PKCE verifier, then exchanges the code for tokens.
   *
   * @route POST /magic-mail/oauth/account
   * @throws {ForbiddenError} When the license does not permit the provider or
   *   account limit is reached
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

      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      const providerKey = `${provider}-oauth`;
      const providerAllowed = await licenseGuard.isProviderAllowed(providerKey);

      if (!providerAllowed) {
        ctx.throw(403, `OAuth provider "${provider}" requires a Premium license or higher. Please upgrade your license.`);
        return;
      }

      const currentAccounts = await strapi.documents('plugin::magic-mail.email-account').count();
      const maxAccounts = await licenseGuard.getMaxAccounts();

      if (maxAccounts !== -1 && currentAccounts >= maxAccounts) {
        ctx.throw(403, `Account limit reached (${maxAccounts}). Upgrade your license to add more accounts.`);
        return;
      }

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
        data: account,
        message: 'OAuth account created successfully',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Create OAuth account error:', err);
      strapi.log.error('[magic-mail] Error stack:', err.stack);
      ctx.throw(500, err.message);
    }
  },
};

