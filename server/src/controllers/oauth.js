'use strict';

/**
 * OAuth Controller
 * Handles OAuth authentication flows
 */

module.exports = {
  /**
   * Initiate Gmail OAuth flow
   */
  async gmailAuth(ctx) {
    try {
      const { clientId } = ctx.query;
      
      if (!clientId) {
        return ctx.badRequest('Client ID is required');
      }

      const oauthService = strapi.plugin('magic-mail').service('oauth');
      const state = Buffer.from(JSON.stringify({ 
        timestamp: Date.now(),
        clientId, 
      })).toString('base64');
      
      const authUrl = oauthService.getGmailAuthUrl(clientId, state);

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
   * Handle Gmail OAuth callback
   */
  async gmailCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;

      if (error) {
        // OAuth was denied or failed
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
            <div class="error">❌ OAuth Authorization Failed</div>
            <p>Error: ${error}</p>
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
          <div class="success">✅</div>
          <div class="message">Gmail OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'gmail-oauth-success',
                code: '${code}',
                state: '${state}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=${code}&oauth_state=${state}';
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
      const state = Buffer.from(JSON.stringify({ 
        timestamp: Date.now(),
        clientId,
        tenantId,
      })).toString('base64');
      
      const authUrl = oauthService.getMicrosoftAuthUrl(clientId, tenantId, state);

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
   * Handle Microsoft OAuth callback
   */
  async microsoftCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;

      if (error) {
        // OAuth was denied or failed
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
            <div class="error">❌ OAuth Authorization Failed</div>
            <p>Error: ${error}</p>
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
          <div class="success">✅</div>
          <div class="message">Microsoft OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'microsoft-oauth-success',
                code: '${code}',
                state: '${state}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=${code}&oauth_state=${state}';
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
      const state = Buffer.from(JSON.stringify({ 
        timestamp: Date.now(),
        clientId, 
      })).toString('base64');
      
      const authUrl = oauthService.getYahooAuthUrl(clientId, state);

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
   * Handle Yahoo OAuth callback
   */
  async yahooCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;

      if (error) {
        // OAuth was denied or failed
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
            <div class="error">❌ OAuth Authorization Failed</div>
            <p>Error: ${error}</p>
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
          <div class="success">✅</div>
          <div class="message">Yahoo Mail OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'yahoo-oauth-success',
                code: '${code}',
                state: '${state}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=${code}&oauth_state=${state}';
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
   * Create account from OAuth tokens
   */
  async createOAuthAccount(ctx) {
    try {
      const { provider, code, state, accountDetails } = ctx.request.body;

      strapi.log.info('[magic-mail] Creating OAuth account...');
      strapi.log.info('[magic-mail] Provider:', provider);
      strapi.log.info('[magic-mail] Account name:', accountDetails?.name);

      if (provider !== 'gmail' && provider !== 'microsoft' && provider !== 'yahoo') {
        return ctx.badRequest('Only Gmail, Microsoft and Yahoo OAuth supported');
      }

      if (!code) {
        return ctx.badRequest('OAuth code is required');
      }

      // License check for OAuth provider
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      const providerKey = `${provider}-oauth`;
      const providerAllowed = await licenseGuard.isProviderAllowed(providerKey);
      
      if (!providerAllowed) {
        ctx.throw(403, `OAuth provider "${provider}" requires a Premium license or higher. Please upgrade your license.`);
        return;
      }

      // Check account limit
      const currentAccounts = await strapi.entityService.count('plugin::magic-mail.email-account');
      const maxAccounts = await licenseGuard.getMaxAccounts();
      
      if (maxAccounts !== -1 && currentAccounts >= maxAccounts) {
        ctx.throw(403, `Account limit reached (${maxAccounts}). Upgrade your license to add more accounts.`);
        return;
      }

      // Decode state to get clientId
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      
      if (!accountDetails.config?.clientId || !accountDetails.config?.clientSecret) {
        return ctx.badRequest('Client ID and Secret are required');
      }

      const oauthService = strapi.plugin('magic-mail').service('oauth');
      
      // Exchange code for tokens
      let tokenData;
      if (provider === 'gmail') {
        strapi.log.info('[magic-mail] Calling exchangeGoogleCode...');
        tokenData = await oauthService.exchangeGoogleCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret
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
          accountDetails.config.tenantId
        );
      } else if (provider === 'yahoo') {
        strapi.log.info('[magic-mail] Calling exchangeYahooCode...');
        tokenData = await oauthService.exchangeYahooCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret
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

      strapi.log.info('[magic-mail] ✅ OAuth account created successfully');

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

