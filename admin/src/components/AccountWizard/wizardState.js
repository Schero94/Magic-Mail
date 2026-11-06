/**
 * Pure state helpers for the email account wizard (AddAccountModal).
 *
 * Kept free of React so the rules that decide what the wizard sends to the
 * server can be tested under node:test.
 */
import { isOptionalEmailAddressValid, isValidEmailAddress } from '../../utils/emailValidation.mjs';

export const OAUTH_PROVIDERS = Object.freeze(['gmail-oauth', 'microsoft-oauth', 'yahoo-oauth']);

/** Wizard provider value -> provider key used by the /oauth/<key>/... routes. */
export const OAUTH_API_PROVIDER = Object.freeze({
  'gmail-oauth': 'gmail',
  'microsoft-oauth': 'microsoft',
  'yahoo-oauth': 'yahoo',
});

/** Product names (not translated). */
export const PROVIDER_LABELS = Object.freeze({
  'gmail-oauth': 'Gmail OAuth',
  'microsoft-oauth': 'Microsoft OAuth',
  'yahoo-oauth': 'Yahoo Mail OAuth',
  smtp: 'SMTP',
  sendgrid: 'SendGrid',
  mailgun: 'Mailgun',
});

/** Product names of the OAuth identity providers (not translated). */
export const OAUTH_PROVIDER_NAMES = Object.freeze({
  'gmail-oauth': 'Google',
  'microsoft-oauth': 'Microsoft',
  'yahoo-oauth': 'Yahoo',
});

export const LIMIT_MAX = 1_000_000;
export const PORT_MIN = 1;
export const PORT_MAX = 65535;

/** Defaults for NEW accounts only. Existing accounts keep their stored values. */
export const NEW_ACCOUNT_DEFAULTS = Object.freeze({
  priority: 5,
  dailyLimit: 500,
  hourlyLimit: 50,
});

/** Defaults the database applies when a value was never stored (0 = unlimited). */
export const STORED_DEFAULTS = Object.freeze({
  priority: 1,
  dailyLimit: 0,
  hourlyLimit: 0,
  port: 587,
});

/** @param {string} provider */
export const isOAuthProvider = (provider) => OAUTH_PROVIDERS.includes(provider);

/** @param {unknown} value @returns {boolean} true for a server-side mask such as "****a1b2" */
export const isMaskedSecret = (value) => typeof value === 'string' && /^\*{4}/.test(value);

/** @returns {Record<string, unknown>} empty form for a new account */
export const createEmptyForm = () => ({
  name: '',
  description: '',
  fromEmail: '',
  fromName: '',
  replyTo: '',
  isActive: true,
  isPrimary: false,
  priority: NEW_ACCOUNT_DEFAULTS.priority,
  dailyLimit: NEW_ACCOUNT_DEFAULTS.dailyLimit,
  hourlyLimit: NEW_ACCOUNT_DEFAULTS.hourlyLimit,
  host: '',
  port: STORED_DEFAULTS.port,
  user: '',
  pass: '',
  secure: false,
  apiKey: '',
  mailgunDomain: '',
  microsoftTenantId: '',
  oauthClientId: '',
  oauthClientSecret: '',
});

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const numberOr = (value, fallback) => (isFiniteNumber(value) ? value : fallback);
const stringOr = (value) => (typeof value === 'string' ? value : '');

/**
 * Maps GET /accounts/:id (edit DTO with masked secrets) to form values.
 * Uses `??`-style fallbacks so 0 ("unlimited") survives an edit round trip.
 *
 * @param {Record<string, any>} account
 */
export const accountToForm = (account = {}) => {
  const config = account?.config && typeof account.config === 'object' ? account.config : {};
  return {
    name: stringOr(account.name),
    description: stringOr(account.description),
    fromEmail: stringOr(account.fromEmail),
    fromName: stringOr(account.fromName),
    replyTo: stringOr(account.replyTo),
    isActive: typeof account.isActive === 'boolean' ? account.isActive : true,
    isPrimary: account.isPrimary === true,
    priority: numberOr(account.priority, STORED_DEFAULTS.priority),
    dailyLimit: numberOr(account.dailyLimit, STORED_DEFAULTS.dailyLimit),
    hourlyLimit: numberOr(account.hourlyLimit, STORED_DEFAULTS.hourlyLimit),
    host: stringOr(config.host),
    port: numberOr(
      typeof config.port === 'string' ? Number(config.port) : config.port,
      STORED_DEFAULTS.port
    ),
    user: stringOr(config.user),
    // Secrets arrive masked ("****a1b2"). Sending the mask back keeps the
    // stored secret (server-side merge); typing a new value replaces it.
    pass: stringOr(config.pass),
    secure: config.secure === true,
    apiKey: stringOr(config.apiKey),
    mailgunDomain: stringOr(config.domain),
    microsoftTenantId: stringOr(config.tenantId),
    oauthClientId: stringOr(config.clientId),
    oauthClientSecret: stringOr(config.clientSecret),
  };
};

const filled = (value) => typeof value === 'string' && value.trim() !== '';

/** @param {unknown} value @param {number} min @param {number} max */
export const isIntegerInRange = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

/**
 * Field-level validation of the settings step.
 * @param {Record<string, any>} form
 * @returns {{dailyLimit?: string, hourlyLimit?: string, priority?: string}} error codes
 */
export const validateLimits = (form) => {
  const errors = {};
  if (!isIntegerInRange(form.dailyLimit, 0, LIMIT_MAX)) errors.dailyLimit = 'limit';
  if (!isIntegerInRange(form.hourlyLimit, 0, LIMIT_MAX)) errors.hourlyLimit = 'limit';
  if (!isIntegerInRange(form.priority, 1, 10)) errors.priority = 'priority';
  return errors;
};

/**
 * Decides whether "Continue" / "Create" is enabled for a step.
 *
 * @param {number} step - 1 provider, 2 details, 3 credentials, 4 settings
 * @param {{provider: string, form: Record<string, any>, isEditMode?: boolean,
 *   credentialsUnreadable?: boolean, oauthCode?: string|null, oauthState?: string|null}} ctx
 * @returns {boolean}
 */
export const canProceedStep = (step, ctx) => {
  const {
    provider,
    form,
    isEditMode = false,
    credentialsUnreadable = false,
    oauthCode,
    oauthState,
  } = ctx;
  if (step === 1) return Boolean(provider);

  if (step === 2) {
    if (!filled(form.name)) return false;
    if (!isOptionalEmailAddressValid(form.replyTo)) return false;
    // OAuth accounts take the sender address from the provider.
    if (isOAuthProvider(provider)) return true;
    return isValidEmailAddress(form.fromEmail);
  }

  if (step === 3) {
    if (provider === 'smtp') {
      return (
        filled(form.host) &&
        filled(form.user) &&
        filled(form.pass) &&
        isIntegerInRange(form.port, PORT_MIN, PORT_MAX)
      );
    }
    if (provider === 'sendgrid') return filled(form.apiKey);
    if (provider === 'mailgun') return filled(form.apiKey) && filled(form.mailgunDomain);
    if (isOAuthProvider(provider)) {
      const needsTenant = provider === 'microsoft-oauth';
      const appConfigured =
        filled(form.oauthClientId) &&
        filled(form.oauthClientSecret) &&
        (!needsTenant || filled(form.microsoftTenantId));
      if (isEditMode) {
        // Unreadable OAuth credentials cannot be repaired here (the tokens are
        // lost too); the account details can still be saved without config.
        return credentialsUnreadable || appConfigured;
      }
      return appConfigured && Boolean(oauthCode) && Boolean(oauthState);
    }
    return false;
  }

  if (step === 4) return Object.keys(validateLimits(form)).length === 0;
  return false;
};

/**
 * Provider config for create/update. Masked secrets are passed through on
 * purpose: the server keeps the stored value for a mask.
 * @param {string} provider
 * @param {Record<string, any>} form
 */
export const buildConfig = (provider, form) => {
  switch (provider) {
    case 'smtp':
      return {
        host: form.host.trim(),
        port: form.port,
        user: form.user.trim(),
        pass: form.pass,
        secure: form.secure === true,
      };
    case 'sendgrid':
      return { apiKey: form.apiKey.trim() };
    case 'mailgun':
      return { apiKey: form.apiKey.trim(), domain: form.mailgunDomain.trim() };
    case 'gmail-oauth':
    case 'yahoo-oauth':
      return { clientId: form.oauthClientId.trim(), clientSecret: form.oauthClientSecret };
    case 'microsoft-oauth':
      return {
        clientId: form.oauthClientId.trim(),
        clientSecret: form.oauthClientSecret,
        tenantId: form.microsoftTenantId.trim(),
      };
    default:
      return {};
  }
};

const sharedDetails = (form) => ({
  name: form.name.trim(),
  description: form.description,
  fromName: form.fromName.trim(),
  // An empty string clears Reply-To (the server must treat '' as "remove").
  replyTo: form.replyTo.trim(),
  isActive: form.isActive === true,
  isPrimary: form.isPrimary === true,
  priority: form.priority,
  dailyLimit: form.dailyLimit,
  hourlyLimit: form.hourlyLimit,
});

/**
 * Body for POST /accounts (create) or PUT /accounts/:id (update).
 * @param {string} provider
 * @param {Record<string, any>} form
 * @param {{isEditMode?: boolean, credentialsUnreadable?: boolean}} [options]
 */
export const buildAccountPayload = (
  provider,
  form,
  { isEditMode = false, credentialsUnreadable = false } = {}
) => {
  const payload = { ...sharedDetails(form), provider };
  const oauth = isOAuthProvider(provider);

  if (!oauth) payload.fromEmail = form.fromEmail.trim();

  // OAuth accounts in edit mode with unreadable credentials: leave the stored
  // config untouched instead of overwriting it with empty values.
  if (!(oauth && isEditMode && credentialsUnreadable)) {
    payload.config = buildConfig(provider, form);
  }
  return payload;
};

/**
 * Body for POST /oauth/create-account. The sender address is taken from the
 * provider, so no placeholder address is sent.
 * @param {string} provider
 * @param {Record<string, any>} form
 * @param {string} code
 * @param {string} state
 */
export const buildOAuthCreatePayload = (provider, form, code, state) => ({
  provider: OAUTH_API_PROVIDER[provider],
  code,
  state,
  accountDetails: { ...sharedDetails(form), config: buildConfig(provider, form) },
});

/**
 * Query string for GET /oauth/<provider>/auth. With `accountId` the server
 * reconnects that account with its stored app credentials, so no client id
 * or tenant is sent; otherwise the app credentials from the form are used.
 * @param {string} provider - wizard provider value, e.g. 'gmail-oauth'
 * @param {{clientId?: string, tenantId?: string, accountId?: string|number|null}} params
 * @returns {string|null} query string, or null when nothing can be started
 */
export const buildOAuthAuthQuery = (provider, { clientId, tenantId, accountId } = {}) => {
  if (!OAUTH_API_PROVIDER[provider]) return null;
  if (accountId !== undefined && accountId !== null && String(accountId) !== '') {
    return new URLSearchParams({ accountId: String(accountId) }).toString();
  }
  if (!clientId) return null;
  const query = new URLSearchParams({ clientId });
  if (provider === 'microsoft-oauth' && tenantId) query.set('tenantId', tenantId);
  return query.toString();
};

/**
 * Body for POST /oauth/reconnect/:accountId (re-authorizing an existing
 * account). Returns null without a complete authorization for the provider.
 * @param {string} provider
 * @param {{provider?: string, code?: string, state?: string}|null} authorization
 */
export const buildOAuthReconnectPayload = (provider, authorization) => {
  if (!OAUTH_API_PROVIDER[provider] || !authorization?.code || !authorization?.state) return null;
  if (authorization.provider && authorization.provider !== provider) return null;
  return {
    provider: OAUTH_API_PROVIDER[provider],
    code: authorization.code,
    state: authorization.state,
  };
};

/** Serialises everything that the user can change, for dirty checks. */
export const snapshotWizard = ({ provider, form, oauthCode }) =>
  JSON.stringify({ provider: provider || '', form, oauthCode: oauthCode || null });

const trimSlash = (value) => value.replace(/\/+$/, '');

/**
 * Absolute base URL of the Strapi server as known to the admin.
 * @param {{backendURL?: unknown, origin?: string}} env
 */
export const resolveBackendBase = ({ backendURL, origin } = {}) => {
  if (typeof backendURL === 'string' && /^https?:\/\//i.test(backendURL))
    return trimSlash(backendURL);
  return trimSlash(origin || '');
};

/**
 * Redirect URI that must be registered with the OAuth provider.
 * Prefers the value returned by the server (it is the one actually sent to
 * the provider); otherwise derives it from the admin's backend URL.
 *
 * @param {'gmail'|'microsoft'|'yahoo'} providerKey
 * @param {{serverRedirectUri?: unknown, backendURL?: unknown, origin?: string}} env
 */
export const getRedirectUri = (providerKey, { serverRedirectUri, backendURL, origin } = {}) => {
  if (typeof serverRedirectUri === 'string' && /^https?:\/\//i.test(serverRedirectUri)) {
    return serverRedirectUri;
  }
  return `${resolveBackendBase({ backendURL, origin })}/magic-mail/oauth/${providerKey}/callback`;
};

/**
 * Origins whose postMessage results are accepted (admin origin and, for split
 * deployments, the backend origin that serves the OAuth callback page).
 * @param {{backendURL?: unknown, origin?: string}} env
 * @returns {Set<string>}
 */
export const getAllowedMessageOrigins = ({ backendURL, origin } = {}) => {
  const origins = new Set();
  if (origin) origins.add(origin);
  if (typeof backendURL === 'string') {
    try {
      origins.add(new URL(backendURL).origin);
    } catch {
      // Relative or invalid backend URL: the admin origin is the backend.
    }
  }
  return origins;
};

const OAUTH_MESSAGE_PROVIDER = Object.freeze({
  'gmail-oauth-success': 'gmail-oauth',
  'microsoft-oauth-success': 'microsoft-oauth',
  'yahoo-oauth-success': 'yahoo-oauth',
});

const isToken = (value) => typeof value === 'string' && value.length > 0 && value.length < 8192;

/**
 * Validates a postMessage from the OAuth callback page.
 *
 * @param {{origin?: string, data?: unknown}} event
 * @param {{allowedOrigins: Set<string>, expectedProvider?: string}} options
 * @returns {{provider: string, code: string, state: string}|null}
 */
export const parseOAuthMessage = (event, { allowedOrigins, expectedProvider } = {}) => {
  if (!event || !allowedOrigins?.has(event.origin)) return null;
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  const provider = OAUTH_MESSAGE_PROVIDER[data.type];
  if (!provider) return null;
  if (expectedProvider && provider !== expectedProvider) return null;
  if (!isToken(data.code) || !isToken(data.state)) return null;
  return { provider, code: data.code, state: data.state };
};
