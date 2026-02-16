'use strict';

const { encryptCredentials } = require('../utils/encryption');

/**
 * OAuth Service
 * Handles OAuth flows for Gmail, Microsoft, etc.
 */

module.exports = ({ strapi }) => ({
  /**
   * Get Gmail OAuth URL
   * @param {string} clientId - OAuth Client ID (from UI, not .env!)
   * @param {string} state - State parameter for security
   */
  getGmailAuthUrl(clientId, state) {
    const redirectUri = `${process.env.URL || 'http://localhost:1337'}/magic-mail/oauth/gmail/callback`;
    
    if (!clientId) {
      throw new Error('Client ID is required for OAuth');
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${encodeURIComponent(state)}`;

    return authUrl;
  },

  /**
   * Exchange Google OAuth code for tokens
   * @param {string} code - OAuth authorization code
   * @param {string} clientId - OAuth Client ID (from UI!)
   * @param {string} clientSecret - OAuth Client Secret (from UI!)
   */
  async exchangeGoogleCode(code, clientId, clientSecret) {
    const redirectUri = `${process.env.URL || 'http://localhost:1337'}/magic-mail/oauth/gmail/callback`;

    strapi.log.info('[magic-mail] Exchanging OAuth code for tokens...');
    strapi.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      strapi.log.error('[magic-mail] Token exchange failed:', errorData);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
    }

    const tokens = await response.json();
    strapi.log.info('[magic-mail] [SUCCESS] Tokens received from Google');

    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // Get user email from Google
    strapi.log.info('[magic-mail] Fetching user info from Google...');
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.text();
      strapi.log.error('[magic-mail] User info fetch failed:', errorData);
      throw new Error('Failed to get user email from Google');
    }

    const userInfo = await userInfoResponse.json();
    strapi.log.info(`[magic-mail] [SUCCESS] Got user email from Google: ${userInfo.email}`);

    if (!userInfo.email) {
      strapi.log.error('[magic-mail] userInfo:', userInfo);
      throw new Error('Google did not provide email address');
    }

    return {
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    };
  },

  /**
   * Refresh Gmail OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - OAuth Client ID (from DB!)
   * @param {string} clientSecret - OAuth Client Secret (from DB!)
   */
  async refreshGmailTokens(refreshToken, clientId, clientSecret) {

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh Gmail tokens');
    }

    const tokens = await response.json();

    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    };
  },

  /**
   * Get Microsoft OAuth URL
   * @param {string} clientId - Application (Client) ID
   * @param {string} tenantId - Tenant (Directory) ID
   * @param {string} state - State parameter for security
   */
  getMicrosoftAuthUrl(clientId, tenantId, state) {
    const redirectUri = `${process.env.URL || 'http://localhost:1337'}/magic-mail/oauth/microsoft/callback`;
    
    if (!clientId) {
      throw new Error('Client ID is required for Microsoft OAuth');
    }
    
    if (!tenantId) {
      throw new Error('Tenant ID is required for Microsoft OAuth');
    }

    // Microsoft Graph API Scopes (official format)
    const scopes = [
      'https://graph.microsoft.com/Mail.Send',      // Send emails
      'https://graph.microsoft.com/User.Read',       // Read user profile
      'offline_access',                              // Refresh tokens
      'openid',                                       // OpenID Connect
      'email',                                        // Email address
    ].join(' ');

    // Microsoft Identity Platform v2.0 endpoint with tenant-specific URL
    // Using tenantId instead of /common to support single-tenant apps
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_mode=query&` +
      `prompt=consent&` +
      `state=${encodeURIComponent(state)}`;

    strapi.log.info(`[magic-mail] Microsoft OAuth URL: Using tenant ${tenantId}`);

    return authUrl;
  },

  /**
   * Exchange Microsoft OAuth code for tokens
   * @param {string} code - OAuth authorization code
   * @param {string} clientId - Application (Client) ID
   * @param {string} clientSecret - Client Secret Value
   * @param {string} tenantId - Tenant (Directory) ID
   */
  async exchangeMicrosoftCode(code, clientId, clientSecret, tenantId) {
    const redirectUri = `${process.env.URL || 'http://localhost:1337'}/magic-mail/oauth/microsoft/callback`;

    if (!tenantId) {
      throw new Error('Tenant ID is required for Microsoft OAuth token exchange');
    }

    strapi.log.info('[magic-mail] Exchanging Microsoft OAuth code for tokens...');
    strapi.log.info(`[magic-mail] Tenant ID: ${tenantId.substring(0, 20)}...`);
    strapi.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);

    // Microsoft Identity Platform v2.0 token endpoint (tenant-specific!)
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    strapi.log.info(`[magic-mail] Token endpoint: ${tokenEndpoint}`);

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      strapi.log.error('[magic-mail] Microsoft token exchange failed:', errorData);
      throw new Error(`Failed to exchange code for tokens: ${response.status} - ${errorData}`);
    }

    const tokens = await response.json();
    strapi.log.info('[magic-mail] [SUCCESS] Tokens received from Microsoft');
    strapi.log.info('[magic-mail] Has access_token:', !!tokens.access_token);
    strapi.log.info('[magic-mail] Has refresh_token:', !!tokens.refresh_token);
    strapi.log.info('[magic-mail] Has id_token:', !!tokens.id_token);

    if (!tokens.access_token) {
      throw new Error('No access token received from Microsoft');
    }

    // Try to get email from ID token first
    let email = null;
    if (tokens.id_token) {
      try {
        // JWT format: header.payload.signature
        const payloadBase64 = tokens.id_token.split('.')[1];
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
        email = payload.email || payload.preferred_username || payload.upn;
        strapi.log.info(`[magic-mail] [SUCCESS] Got email from Microsoft ID token: ${email}`);
      } catch (jwtErr) {
        strapi.log.warn('[magic-mail] Could not decode ID token:', jwtErr.message);
      }
    }

    // Fallback: Get email from Microsoft Graph API /me endpoint
    if (!email) {
      strapi.log.info('[magic-mail] Fetching user info from Microsoft Graph API /me endpoint...');
      const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { 
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!userInfoResponse.ok) {
        const errorData = await userInfoResponse.text();
        strapi.log.error('[magic-mail] User info fetch failed:', errorData);
        strapi.log.error('[magic-mail] Status:', userInfoResponse.status);
        throw new Error(`Failed to get user email from Microsoft Graph: ${userInfoResponse.status}`);
      }

      const userInfo = await userInfoResponse.json();
      strapi.log.info('[magic-mail] User info from Graph:', JSON.stringify(userInfo, null, 2));
      
      email = userInfo.mail || userInfo.userPrincipalName;
      strapi.log.info(`[magic-mail] [SUCCESS] Got email from Microsoft Graph: ${email}`);
    }

    if (!email) {
      strapi.log.error('[magic-mail] Microsoft did not provide email - ID token and Graph API both failed');
      throw new Error('Microsoft did not provide email address');
    }

    return {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    };
  },

  /**
   * Refresh Microsoft OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - Application (Client) ID
   * @param {string} clientSecret - Client Secret Value
   * @param {string} tenantId - Tenant (Directory) ID
   */
  async refreshMicrosoftTokens(refreshToken, clientId, clientSecret, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for Microsoft OAuth token refresh');
    }

    strapi.log.info('[magic-mail] Refreshing Microsoft OAuth tokens...');
    strapi.log.info(`[magic-mail] Tenant ID: ${tenantId.substring(0, 20)}...`);

    // Tenant-specific token endpoint
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      strapi.log.error('[magic-mail] Microsoft token refresh failed:', errorData);
      throw new Error(`Failed to refresh Microsoft tokens: ${response.status}`);
    }

    const tokens = await response.json();
    strapi.log.info('[magic-mail] [SUCCESS] Microsoft tokens refreshed successfully');

    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    };
  },

  /**
   * Get Yahoo OAuth URL
   * @param {string} clientId - Yahoo Client ID
   * @param {string} state - State parameter for security
   */
  getYahooAuthUrl(clientId, state) {
    const redirectUri = `${process.env.URL || 'http://localhost:1337'}/magic-mail/oauth/yahoo/callback`;
    
    if (!clientId) {
      throw new Error('Client ID is required for Yahoo OAuth');
    }

    const scopes = [
      'mail-w', // Write/send emails
      'sdps-r', // Read profile
    ].join(' ');

    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${encodeURIComponent(state)}`;

    return authUrl;
  },

  /**
   * Exchange Yahoo OAuth code for tokens
   * @param {string} code - OAuth authorization code
   * @param {string} clientId - Yahoo Client ID
   * @param {string} clientSecret - Yahoo Client Secret
   */
  async exchangeYahooCode(code, clientId, clientSecret) {
    const redirectUri = `${process.env.URL || 'http://localhost:1337'}/magic-mail/oauth/yahoo/callback`;

    strapi.log.info('[magic-mail] Exchanging Yahoo OAuth code for tokens...');
    strapi.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);

    // Create Basic Auth header
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      strapi.log.error('[magic-mail] Yahoo token exchange failed:', errorData);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
    }

    const tokens = await response.json();
    strapi.log.info('[magic-mail] [SUCCESS] Tokens received from Yahoo');

    if (!tokens.access_token) {
      throw new Error('No access token received from Yahoo');
    }

    // Get user email from Yahoo profile API
    strapi.log.info('[magic-mail] Fetching user info from Yahoo API...');
    const userInfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.text();
      strapi.log.error('[magic-mail] User info fetch failed:', errorData);
      throw new Error('Failed to get user email from Yahoo');
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    strapi.log.info(`[magic-mail] [SUCCESS] Got email from Yahoo: ${email}`);

    if (!email) {
      throw new Error('Yahoo did not provide email address');
    }

    return {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    };
  },

  /**
   * Refresh Yahoo OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - Yahoo Client ID
   * @param {string} clientSecret - Yahoo Client Secret
   */
  async refreshYahooTokens(refreshToken, clientId, clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh Yahoo tokens');
    }

    const tokens = await response.json();

    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    };
  },

  /**
   * Store OAuth account
   */
  async storeOAuthAccount(provider, tokenData, accountDetails, oauthCredentials) {
    // Separate config (OAuth app credentials) and oauth (tokens)
    // Store ALL config fields (including tenantId for Microsoft)
    const configToStore = {
      clientId: oauthCredentials.clientId,
      clientSecret: oauthCredentials.clientSecret,
    };
    
    // Add tenantId for Microsoft OAuth
    if (oauthCredentials.tenantId) {
      configToStore.tenantId = oauthCredentials.tenantId;
      strapi.log.info(`[magic-mail] Storing tenantId: ${oauthCredentials.tenantId.substring(0, 20)}...`);
    }
    
    // Add domain for Mailgun
    if (oauthCredentials.domain) {
      configToStore.domain = oauthCredentials.domain;
    }
    
    const encryptedConfig = encryptCredentials(configToStore);

    const encryptedOAuth = encryptCredentials({
      email: tokenData.email,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
    });

    const account = await strapi.documents('plugin::magic-mail.email-account').create({
      data: {
        name: accountDetails.name,
        description: accountDetails.description || '',
        provider: `${provider}-oauth`,
        config: encryptedConfig,      // OAuth app credentials
        oauth: encryptedOAuth,         // OAuth tokens
        fromEmail: tokenData.email ? tokenData.email.trim().toLowerCase() : tokenData.email,
        fromName: accountDetails.fromName || tokenData.email.split('@')[0],
        replyTo: (accountDetails.replyTo || tokenData.email || '').trim().toLowerCase(),
        isActive: true,
        isPrimary: accountDetails.isPrimary || false,
        priority: accountDetails.priority || 1,
        dailyLimit: accountDetails.dailyLimit || 0,
        hourlyLimit: accountDetails.hourlyLimit || 0,
        emailsSentToday: 0,
        emailsSentThisHour: 0,
        totalEmailsSent: 0,
      },
    });

    strapi.log.info(`[magic-mail] [SUCCESS] OAuth account created: ${accountDetails.name} (${tokenData.email})`);

    return account;
  },
});

