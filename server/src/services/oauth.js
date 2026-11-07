'use strict';

const { encryptCredentials } = require('../utils/encryption');
const coordination = require('../utils/coordination');

/**
 * OAuth Service
 * Handles OAuth flows for Gmail, Microsoft and Yahoo.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
/**
 * Microsoft tenant: GUID, verified domain, or common/organizations/consumers.
 * Only host-label characters are allowed, so the value can not change the
 * path or query of the login.microsoftonline.com URL.
 */
const TENANT_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

/**
 * Validates and URL-encodes a Microsoft tenant id.
 *
 * @param {unknown} tenant
 * @returns {string} encoded tenant path segment
 * @throws {Error} When the tenant id is missing or malformed
 */
function tenantSegment(tenant) {
  if (typeof tenant !== 'string' || !TENANT_PATTERN.test(tenant)) {
    throw new Error('Invalid Microsoft tenant ID');
  }
  return encodeURIComponent(tenant);
}

/**
 * Builds the public base URL for OAuth redirect URIs.
 *
 * Order: the legacy `URL` env var (kept so existing app registrations keep
 * working), then Strapi's `server.absoluteUrl` (derived from `server.url`).
 * In production the URL must be https and must not point at a loopback host;
 * there is no `http://localhost:1337` fallback there.
 *
 * @param {object} strapi
 * @returns {string} Base URL without trailing slash
 * @throws {Error} When no usable public URL is configured in production
 */
function getPublicBaseUrl(strapi) {
  const candidates = [process.env.URL, strapi?.config?.get?.('server.absoluteUrl')].filter(
    (value) => typeof value === 'string' && value.trim()
  );

  const production = process.env.NODE_ENV === 'production';
  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = new URL(candidate.trim());
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    if (
      production &&
      (parsed.protocol !== 'https:' || LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()))
    )
      continue;
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  }

  if (production) {
    throw new Error(
      'OAuth needs a public https URL: set server.url (or URL) to the public address of this Strapi server.'
    );
  }
  return 'http://localhost:1337';
}

/**
 * Computes the token expiry date from an OAuth token response.
 *
 * @param {object} tokens
 * @returns {Date}
 */
const expiryFrom = (tokens) => new Date(Date.now() + (Number(tokens?.expires_in) || 3600) * 1000);

module.exports = ({ strapi }) => ({
  /**
   * Returns the redirect URI registered with the OAuth provider. The admin
   * UI shows this exact value (it is returned by the /oauth/<provider>/auth
   * endpoints), so the UI and the token exchange always agree.
   *
   * @param {'gmail'|'microsoft'|'yahoo'} provider
   * @returns {string}
   */
  getRedirectUri(provider) {
    if (!['gmail', 'microsoft', 'yahoo'].includes(provider)) {
      throw new Error('Unknown OAuth provider');
    }
    return `${getPublicBaseUrl(strapi)}/magic-mail/oauth/${provider}/callback`;
  },

  /**
   * Builds the Gmail OAuth2 authorize URL.
   *
   * @param {string} clientId - OAuth Client ID (from UI, not .env!)
   * @param {string} state - State parameter for CSRF protection
   * @param {object} [options]
   * @param {string} [options.codeChallenge] - PKCE S256 challenge
   * @param {string} [options.codeChallengeMethod] - 'S256'
   * @returns {string}
   */
  getGmailAuthUrl(clientId, state, options = {}) {
    const redirectUri = this.getRedirectUri('gmail');

    if (!clientId) {
      throw new Error('Client ID is required for OAuth');
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ].join(' ');

    let authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${encodeURIComponent(state)}`;

    if (options.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(options.codeChallenge)}`;
      authUrl += `&code_challenge_method=${encodeURIComponent(options.codeChallengeMethod || 'S256')}`;
    }

    return authUrl;
  },

  /**
   * Exchanges a Gmail OAuth authorization code for tokens.
   *
   * @param {string} code
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {object} [options]
   * @param {string} [options.codeVerifier] - PKCE code_verifier (required when PKCE was used)
   * @returns {Promise<{email: string, accessToken: string, refreshToken?: string, expiresAt: Date}>}
   * @throws {Error} When the token exchange fails or userinfo is missing
   */
  async exchangeGoogleCode(code, clientId, clientSecret, options = {}) {
    const redirectUri = this.getRedirectUri('gmail');

    strapi.log.info('[magic-mail] Exchanging OAuth code for tokens...');

    const bodyParams = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };
    if (options.codeVerifier) {
      bodyParams.code_verifier = options.codeVerifier;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      strapi.log.error('[magic-mail] Google token exchange failed:', response.status);
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
      strapi.log.error('[magic-mail] Google user-info request failed:', userInfoResponse.status);
      throw new Error('Failed to get user email from Google');
    }

    const userInfo = await userInfoResponse.json();
    strapi.log.info(
      `[magic-mail] [SUCCESS] Google profile returned an email: ${Boolean(userInfo.email)}`
    );

    if (!userInfo.email) {
      strapi.log.error('[magic-mail] Google profile did not contain an email address');
      throw new Error('Google did not provide email address');
    }

    return {
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiryFrom(tokens),
    };
  },

  /**
   * Refresh Gmail OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - OAuth Client ID (from DB!)
   * @param {string} clientSecret - OAuth Client Secret (from DB!)
   * @param {{signal?: AbortSignal}} [options] - abort signal (bounded queue sends)
   */
  async refreshGmailTokens(refreshToken, clientId, clientSecret, options = {}) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      ...(options.signal ? { signal: options.signal } : {}),
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
      throw new Error(`Failed to refresh Gmail tokens: ${response.status}`);
    }

    return this._refreshResult(await response.json(), 'Google');
  },

  /**
   * Get Microsoft OAuth URL
   * @param {string} clientId - Application (Client) ID
   * @param {string} tenantId - Tenant (Directory) ID
   * @param {string} state - State parameter for security
   */
  /**
   * Builds the Microsoft Identity Platform authorize URL.
   *
   * @param {string} clientId
   * @param {string} tenantId
   * @param {string} state
   * @param {object} [options]
   * @param {string} [options.codeChallenge]
   * @param {string} [options.codeChallengeMethod]
   * @returns {string}
   */
  getMicrosoftAuthUrl(clientId, tenantId, state, options = {}) {
    const redirectUri = this.getRedirectUri('microsoft');

    if (!clientId) {
      throw new Error('Client ID is required for Microsoft OAuth');
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required for Microsoft OAuth');
    }

    const scopes = [
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
      'openid',
      'email',
    ].join(' ');

    let authUrl =
      `https://login.microsoftonline.com/${tenantSegment(tenantId)}/oauth2/v2.0/authorize?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_mode=query&` +
      `prompt=consent&` +
      `state=${encodeURIComponent(state)}`;

    if (options.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(options.codeChallenge)}`;
      authUrl += `&code_challenge_method=${encodeURIComponent(options.codeChallengeMethod || 'S256')}`;
    }

    strapi.log.info('[magic-mail] Microsoft OAuth URL created');

    return authUrl;
  },

  /**
   * Exchanges a Microsoft OAuth authorization code for tokens.
   *
   * @param {string} code
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {string} tenantId
   * @param {object} [options]
   * @param {string} [options.codeVerifier] - PKCE verifier (required when PKCE was used)
   * @returns {Promise<object>}
   */
  async exchangeMicrosoftCode(code, clientId, clientSecret, tenantId, options = {}) {
    const redirectUri = this.getRedirectUri('microsoft');

    if (!tenantId) {
      throw new Error('Tenant ID is required for Microsoft OAuth token exchange');
    }

    strapi.log.info('[magic-mail] Exchanging Microsoft OAuth code for tokens...');

    const tokenEndpoint = `https://login.microsoftonline.com/${tenantSegment(tenantId)}/oauth2/v2.0/token`;

    const bodyParams = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope:
        'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
    };
    if (options.codeVerifier) {
      bodyParams.code_verifier = options.codeVerifier;
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      strapi.log.error('[magic-mail] Microsoft token exchange failed:', response.status);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
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
        strapi.log.info(
          `[magic-mail] [SUCCESS] Microsoft ID token included an email: ${Boolean(email)}`
        );
      } catch {
        strapi.log.warn('[magic-mail] Could not decode Microsoft ID token');
      }
    }

    // Fallback: Get email from Microsoft Graph API /me endpoint
    if (!email) {
      strapi.log.info('[magic-mail] Fetching user info from Microsoft Graph API /me endpoint...');
      const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!userInfoResponse.ok) {
        strapi.log.error(
          '[magic-mail] Microsoft Graph user-info request failed:',
          userInfoResponse.status
        );
        throw new Error(
          `Failed to get user email from Microsoft Graph: ${userInfoResponse.status}`
        );
      }

      const userInfo = await userInfoResponse.json();
      email = userInfo.mail || userInfo.userPrincipalName;
      strapi.log.info(
        `[magic-mail] [SUCCESS] Microsoft Graph profile returned an email: ${Boolean(email)}`
      );
    }

    if (!email) {
      strapi.log.error(
        '[magic-mail] Microsoft did not provide email - ID token and Graph API both failed'
      );
      throw new Error('Microsoft did not provide email address');
    }

    return {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiryFrom(tokens),
    };
  },

  /**
   * Refresh Microsoft OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - Application (Client) ID
   * @param {string} clientSecret - Client Secret Value
   * @param {string} tenantId - Tenant (Directory) ID
   * @param {{signal?: AbortSignal}} [options] - abort signal (bounded queue sends)
   */
  async refreshMicrosoftTokens(refreshToken, clientId, clientSecret, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for Microsoft OAuth token refresh');
    }

    strapi.log.info('[magic-mail] Refreshing Microsoft OAuth tokens...');

    // Tenant-specific token endpoint
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantSegment(tenantId)}/oauth2/v2.0/token`;

    const response = await fetch(tokenEndpoint, {
      ...(options.signal ? { signal: options.signal } : {}),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        scope:
          'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
      }),
    });

    if (!response.ok) {
      strapi.log.error('[magic-mail] Microsoft token refresh failed:', response.status);
      throw new Error(`Failed to refresh Microsoft tokens: ${response.status}`);
    }

    const result = this._refreshResult(await response.json(), 'Microsoft');
    strapi.log.info('[magic-mail] [SUCCESS] Microsoft tokens refreshed successfully');
    return result;
  },

  /**
   * Builds the Yahoo OAuth2 authorize URL.
   *
   * @param {string} clientId
   * @param {string} state
   * @param {object} [options]
   * @param {string} [options.codeChallenge]
   * @param {string} [options.codeChallengeMethod]
   * @returns {string}
   */
  getYahooAuthUrl(clientId, state, options = {}) {
    const redirectUri = this.getRedirectUri('yahoo');

    if (!clientId) {
      throw new Error('Client ID is required for Yahoo OAuth');
    }

    // `openid` + `email` are required for the /openid/v1/userinfo lookup that
    // resolves the account address; `mail-w` grants mail send access. The old
    // `sdps-r` (social directory) scope is not valid for Mail apps and caused
    // `invalid_scope` / missing-email failures.
    const scopes = ['openid', 'email', 'mail-w'].join(' ');

    let authUrl =
      'https://api.login.yahoo.com/oauth2/request_auth?' +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${encodeURIComponent(state)}`;

    if (options.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(options.codeChallenge)}`;
      authUrl += `&code_challenge_method=${encodeURIComponent(options.codeChallengeMethod || 'S256')}`;
    }

    return authUrl;
  },

  /**
   * Exchanges a Yahoo OAuth authorization code for tokens.
   *
   * @param {string} code
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {object} [options]
   * @param {string} [options.codeVerifier] - PKCE verifier (optional)
   * @returns {Promise<object>}
   */
  async exchangeYahooCode(code, clientId, clientSecret, options = {}) {
    const redirectUri = this.getRedirectUri('yahoo');

    strapi.log.info('[magic-mail] Exchanging Yahoo OAuth code for tokens...');

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const bodyParams = {
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };
    if (options.codeVerifier) {
      bodyParams.code_verifier = options.codeVerifier;
    }

    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      strapi.log.error('[magic-mail] Yahoo token exchange failed:', response.status);
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
      strapi.log.error('[magic-mail] Yahoo user-info request failed:', userInfoResponse.status);
      throw new Error('Failed to get user email from Yahoo');
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    strapi.log.info(`[magic-mail] [SUCCESS] Yahoo profile returned an email: ${Boolean(email)}`);

    if (!email) {
      throw new Error('Yahoo did not provide email address');
    }

    return {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiryFrom(tokens),
    };
  },

  /**
   * Refresh Yahoo OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - Yahoo Client ID
   * @param {string} clientSecret - Yahoo Client Secret
   * @param {{signal?: AbortSignal}} [options] - abort signal (bounded queue sends)
   */
  async refreshYahooTokens(refreshToken, clientId, clientSecret, options = {}) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      ...(options.signal ? { signal: options.signal } : {}),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh Yahoo tokens: ${response.status}`);
    }

    return this._refreshResult(await response.json(), 'Yahoo');
  },

  /**
   * Normalises a refresh_token grant response. Microsoft and Yahoo rotate
   * refresh tokens: a new one is returned as `refreshToken` and callers must
   * persist it (keeping the old one when none is returned).
   *
   * @param {object} tokens - Provider token response
   * @param {string} label - Provider name for the error message
   * @returns {{accessToken: string, refreshToken?: string, expiresAt: Date}}
   * @throws {Error} When no access token was returned
   */
  _refreshResult(tokens, label) {
    if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token) {
      throw new Error(`No access token received from ${label}`);
    }
    const result = { accessToken: tokens.access_token, expiresAt: expiryFrom(tokens) };
    if (typeof tokens.refresh_token === 'string' && tokens.refresh_token) {
      result.refreshToken = tokens.refresh_token;
    }
    return result;
  },

  /**
   * Builds the encrypted `oauth` column value. A missing new refresh token
   * keeps the previous one.
   *
   * @param {object|null} previous - Decrypted previous oauth blob
   * @param {{email?: string, accessToken: string, refreshToken?: string, expiresAt: Date|string}} tokens
   * @returns {{encrypted: string}}
   */
  buildOAuthBlob(previous, tokens) {
    return encryptCredentials({
      ...(previous || {}),
      ...(tokens.email ? { email: tokens.email } : {}),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || previous?.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  },

  /**
   * Exchanges an authorization code with the provider of the flow.
   *
   * @param {'gmail'|'microsoft'|'yahoo'} provider
   * @param {string} code
   * @param {{clientId: string, clientSecret: string, tenantId?: string}} config
   * @param {string|null} codeVerifier - PKCE verifier
   * @returns {Promise<{email: string, accessToken: string, refreshToken?: string, expiresAt: Date}>}
   */
  async exchangeCode(provider, code, config, codeVerifier) {
    const options = { codeVerifier: codeVerifier || undefined };
    if (provider === 'gmail') {
      return this.exchangeGoogleCode(code, config.clientId, config.clientSecret, options);
    }
    if (provider === 'microsoft') {
      return this.exchangeMicrosoftCode(
        code,
        config.clientId,
        config.clientSecret,
        config.tenantId,
        options
      );
    }
    if (provider === 'yahoo') {
      return this.exchangeYahooCode(code, config.clientId, config.clientSecret, options);
    }
    throw new Error('Unknown OAuth provider');
  },

  /**
   * Stores a new OAuth account (app credentials in `config`, tokens in
   * `oauth`, both encrypted).
   *
   * @param {'gmail'|'microsoft'|'yahoo'} provider
   * @param {{email: string, accessToken: string, refreshToken?: string, expiresAt: Date}} tokenData
   * @param {object} accountDetails - Validated account form values
   * @param {{clientId: string, clientSecret: string, tenantId?: string}} oauthCredentials
   * @returns {Promise<object>} Created account record
   */
  async storeOAuthAccount(provider, tokenData, accountDetails, oauthCredentials) {
    const configToStore = {
      clientId: oauthCredentials.clientId,
      clientSecret: oauthCredentials.clientSecret,
    };
    if (oauthCredentials.tenantId) {
      configToStore.tenantId = oauthCredentials.tenantId;
    }

    const email = String(tokenData.email || '')
      .trim()
      .toLowerCase();
    const isPrimary = accountDetails.isPrimary || false;
    // Same database lease as account-manager create/update: the primary
    // switch and the name check can not interleave across processes.
    const account = await coordination.withLease(strapi, 'email-accounts', async () => {
      // Keep the single-primary invariant.
      if (isPrimary) {
        await strapi.plugin('magic-mail').service('account-manager').unsetAllPrimary();
      }
      return strapi.documents('plugin::magic-mail.email-account').create({
        data: {
          name: accountDetails.name || email,
          description: accountDetails.description ?? null,
          provider: `${provider}-oauth`,
          config: encryptCredentials(configToStore),
          oauth: this.buildOAuthBlob(null, { ...tokenData, email }),
          fromEmail: email,
          fromName: accountDetails.fromName || email.split('@')[0],
          replyTo: (accountDetails.replyTo || email).trim().toLowerCase(),
          isActive: accountDetails.isActive !== undefined ? accountDetails.isActive : true,
          isPrimary,
          priority: accountDetails.priority ?? 1,
          dailyLimit: accountDetails.dailyLimit ?? 0,
          hourlyLimit: accountDetails.hourlyLimit ?? 0,
          emailsSentToday: 0,
          emailsSentThisHour: 0,
          totalEmailsSent: 0,
        },
      });
    });

    strapi.log.info('[magic-mail] [SUCCESS] OAuth email account created');

    return account;
  },

  /**
   * Replaces the OAuth tokens of an existing account after a new consent
   * (revoked consent, expired refresh token). Only the mailbox the account
   * was created for may be re-authorized, so a reconnect can not silently
   * switch the sending address.
   *
   * @param {object} account - Raw email-account record
   * @param {{email: string, accessToken: string, refreshToken?: string, expiresAt: Date}} tokenData
   * @returns {Promise<object>} Updated record
   * @throws {Error & {code: string}} MAILBOX_MISMATCH when another mailbox authorized
   */
  async updateOAuthTokens(account, tokenData) {
    const email = String(tokenData.email || '')
      .trim()
      .toLowerCase();
    if (
      !email ||
      email !==
        String(account.fromEmail || '')
          .trim()
          .toLowerCase()
    ) {
      const error = new Error('The authorized mailbox does not match this account');
      error.code = 'MAILBOX_MISMATCH';
      throw error;
    }

    // Same lease as the token refresh in email-router: a refresh that is
    // running on another process finishes first, and the next refresh reads
    // these new tokens instead of overwriting them.
    const updated = await coordination.withLease(
      strapi,
      `oauth-refresh:${account.documentId}`,
      () =>
        strapi.documents('plugin::magic-mail.email-account').update({
          documentId: account.documentId,
          data: {
            // A reconnect starts from a fresh token set; old tokens are dropped.
            oauth: this.buildOAuthBlob(null, { ...tokenData, email }),
          },
        }),
      { ttlMs: 60_000, waitMs: 30_000 }
    );

    strapi.log.info('[magic-mail] [SUCCESS] OAuth account reconnected');
    return updated;
  },
});
