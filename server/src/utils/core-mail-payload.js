'use strict';

/**
 * Core-mail template data for provider templates (payload contract v1).
 *
 * users-permissions renders its password-reset and email-confirmation
 * templates itself and then calls the email service with finished HTML, so
 * the variables never reach the email provider. Magic Mail records them at the
 * moment users-permissions renders (see `createCoreMailCapture`) and, when a
 * core mail is set to use a provider template, sends them as template data.
 *
 * Contract v1 (keys may be added later, never removed):
 * - the familiar users-permissions names: URL, SERVER_URL, ADMIN_URL, USER,
 *   TOKEN (password reset) or CODE (email confirmation);
 * - camelCase aliases: url (fully built link), baseUrl, serverUrl, adminUrl,
 *   user, token or code;
 * - meta: { templateKey, payloadVersion: 1, coreEmailType, locale? }.
 * USER/user carry only id, email, username and, when present, firstname and
 * lastname. The full user entity is never forwarded.
 */

const crypto = require('crypto');

const CORE_EMAIL_TYPES = Object.freeze(['reset-password', 'email-confirmation']);
const CORE_PAYLOAD_VERSION = 1;
const USER_FIELDS = Object.freeze(['id', 'email', 'username', 'firstname', 'lastname']);
const CAPTURE_TTL_MS = 5 * 60 * 1000;
const CAPTURE_MAX_ENTRIES = 500;
const MAX_FIELD_LENGTH = 2048;

/**
 * Keeps the allowlisted user fields (id, email, username, firstname, lastname).
 *
 * @param {unknown} user - users-permissions user (sanitised by core)
 * @returns {Record<string, string|number>} Allowlisted copy; {} for non-objects
 */
function allowlistUser(user) {
  if (!user || typeof user !== 'object') return {};
  const out = {};
  for (const field of USER_FIELDS) {
    const value = user[field];
    if (typeof value === 'number' && Number.isFinite(value)) out[field] = value;
    else if (typeof value === 'string' && value.length > 0) {
      out[field] = value.slice(0, MAX_FIELD_LENGTH);
    }
  }
  return out;
}

const asText = (value) =>
  typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : value == null ? '' : '';

/**
 * Builds the link a user clicks: `URL` plus `?code=TOKEN` (password reset) or
 * `?confirmation=CODE` (email confirmation), like the users-permissions
 * default templates. Built with URL/searchParams, so an existing query string
 * is kept and the value is encoded.
 *
 * @param {'reset-password'|'email-confirmation'} coreEmailType
 * @param {string} baseUrl - users-permissions URL (absolute)
 * @param {string} secret - TOKEN or CODE
 * @returns {string} The link, or '' when the base URL is not an absolute http(s) URL
 */
function buildCoreLink(coreEmailType, baseUrl, secret) {
  if (!baseUrl || !secret) return '';
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  url.searchParams.set(coreEmailType === 'reset-password' ? 'code' : 'confirmation', secret);
  return url.toString();
}

/**
 * Builds the v1 template data for a core mail.
 *
 * @param {'reset-password'|'email-confirmation'} coreEmailType
 * @param {object} captured - Variables users-permissions rendered with
 *   ({ URL, SERVER_URL, ADMIN_URL, USER, TOKEN | CODE })
 * @param {{templateKey: string, locale?: string}} meta
 * @returns {object} Plain template data
 * @throws {TypeError} For an unknown core email type
 */
function buildCoreMailPayload(coreEmailType, captured = {}, meta = {}) {
  if (!CORE_EMAIL_TYPES.includes(coreEmailType)) throw new TypeError('Unknown core email type');
  const user = allowlistUser(captured.USER);
  const baseUrl = asText(captured.URL);
  const serverUrl = asText(captured.SERVER_URL);
  const adminUrl = asText(captured.ADMIN_URL);
  const isReset = coreEmailType === 'reset-password';
  const secret = asText(isReset ? captured.TOKEN : captured.CODE);
  const url = buildCoreLink(coreEmailType, baseUrl, secret);

  const payload = {
    URL: baseUrl,
    SERVER_URL: serverUrl,
    ADMIN_URL: adminUrl,
    USER: user,
    ...(isReset ? { TOKEN: secret } : { CODE: secret }),
    url,
    baseUrl,
    serverUrl,
    adminUrl,
    user: { ...user },
    ...(isReset ? { token: secret } : { code: secret }),
    meta: {
      templateKey: String(meta.templateKey || ''),
      payloadVersion: CORE_PAYLOAD_VERSION,
      coreEmailType,
      ...(typeof meta.locale === 'string' && meta.locale ? { locale: meta.locale } : {}),
    },
  };
  return payload;
}

/**
 * Variable names Magic Mail sends for a core mail (for the admin screen).
 *
 * @param {'reset-password'|'email-confirmation'} coreEmailType
 * @returns {string[]}
 */
function coreMailVariableNames(coreEmailType) {
  const isReset = coreEmailType === 'reset-password';
  return [
    'URL',
    'SERVER_URL',
    'ADMIN_URL',
    'USER',
    ...USER_FIELDS.map((field) => `USER.${field}`),
    isReset ? 'TOKEN' : 'CODE',
    'url',
    'baseUrl',
    'serverUrl',
    'adminUrl',
    'user',
    ...USER_FIELDS.map((field) => `user.${field}`),
    isReset ? 'token' : 'code',
    'meta',
    'meta.templateKey',
    'meta.payloadVersion',
    'meta.coreEmailType',
    'meta.locale',
  ];
}

/**
 * Detects which core mail a users-permissions `template(layout, data)` call
 * renders: TOKEN means password reset, CODE means email confirmation.
 *
 * @param {unknown} data
 * @returns {'reset-password'|'email-confirmation'|null}
 */
function coreEmailTypeFromData(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.TOKEN === 'string' && data.TOKEN) return 'reset-password';
  if (typeof data.CODE === 'string' && data.CODE) return 'email-confirmation';
  return null;
}

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Short-lived, bounded memory of the core-mail variables users-permissions
 * rendered, keyed by a hash of the rendered body. The email provider wrapper
 * looks a body up to learn which core mail it is and with which variables.
 * Only allowlisted values are kept; entries expire after 5 minutes and are
 * removed when used.
 *
 * @param {{now?: () => number}} [options]
 * @returns {{remember: Function, take: Function, size: Function, clear: Function}}
 */
function createCoreMailCapture({ now = () => Date.now() } = {}) {
  const entries = new Map();

  const prune = () => {
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key);
    }
    while (entries.size > CAPTURE_MAX_ENTRIES) {
      entries.delete(entries.keys().next().value);
    }
  };

  return {
    /**
     * Records the variables of one rendered core-mail body.
     *
     * @param {string} rendered - Body returned by users-permissions template()
     * @param {object} data - Variables passed to template()
     * @returns {boolean} true when recorded
     */
    remember(rendered, data) {
      const coreEmailType = coreEmailTypeFromData(data);
      if (!coreEmailType || typeof rendered !== 'string' || rendered.length === 0) return false;
      entries.set(digest(rendered), {
        coreEmailType,
        expiresAt: now() + CAPTURE_TTL_MS,
        data: {
          URL: asText(data.URL),
          SERVER_URL: asText(data.SERVER_URL),
          ADMIN_URL: asText(data.ADMIN_URL),
          USER: allowlistUser(data.USER),
          ...(coreEmailType === 'reset-password'
            ? { TOKEN: asText(data.TOKEN) }
            : { CODE: asText(data.CODE) }),
        },
      });
      prune();
      return true;
    },
    /**
     * Returns and forgets the variables recorded for a body.
     *
     * @param {unknown} body - html (or text) of the outgoing mail
     * @returns {{coreEmailType: string, data: object}|null}
     */
    take(body) {
      if (typeof body !== 'string' || body.length === 0 || entries.size === 0) return null;
      prune();
      const key = digest(body);
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      return { coreEmailType: entry.coreEmailType, data: entry.data };
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  };
}

module.exports = {
  CORE_EMAIL_TYPES,
  CORE_PAYLOAD_VERSION,
  USER_FIELDS,
  allowlistUser,
  buildCoreLink,
  buildCoreMailPayload,
  coreEmailTypeFromData,
  coreMailVariableNames,
  createCoreMailCapture,
};
