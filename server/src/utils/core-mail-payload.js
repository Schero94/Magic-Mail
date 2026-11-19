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
 * The admin panel's forgot-password mail is rendered by
 * `sendTemplatedEmail(options, template, { url, user })`; Magic Mail
 * recognises that call (see bootstrap.js) and builds its payload directly.
 *
 * Contract v1 (keys may be added later, never removed):
 * - users-permissions mails (reset-password, email-confirmation):
 *   - the familiar users-permissions names: URL, SERVER_URL, ADMIN_URL, USER,
 *     TOKEN (password reset) or CODE (email confirmation);
 *   - camelCase aliases: url (fully built link), baseUrl, serverUrl, adminUrl,
 *     user, token or code;
 * - admin forgot password (admin-forgot-password): user, url (the finished
 *   reset link Strapi built), token, adminUrl, serverUrl;
 * - meta: { templateKey, payloadVersion: 1, coreEmailType, locale?,
 *   strapiVersion? }.
 * USER/user carry only id, email, username and, when present, firstname and
 * lastname. The full user entity is never forwarded.
 */

const crypto = require('crypto');

const CORE_EMAIL_TYPES = Object.freeze([
  'reset-password',
  'email-confirmation',
  'admin-forgot-password',
]);
/** Core mails rendered by users-permissions (captured through template()). */
const UP_CORE_EMAIL_TYPES = Object.freeze(['reset-password', 'email-confirmation']);
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
 * Returns the value when it is an absolute http(s) URL, else ''.
 *
 * @param {unknown} value
 * @returns {string}
 */
function absoluteHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FIELD_LENGTH) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/**
 * The reset token of an admin forgot-password link (`?code=`), else ''.
 *
 * @param {string} url - Absolute link built by @strapi/admin
 * @returns {string}
 */
function adminResetToken(url) {
  if (!url) return '';
  try {
    return asText(new URL(url).searchParams.get('code') || '');
  } catch {
    return '';
  }
}

/**
 * The common `meta` envelope of payload v1. `locale` and `strapiVersion` are
 * only present when known.
 *
 * @param {string} coreEmailType
 * @param {{templateKey?: string, locale?: string, strapiVersion?: string}} meta
 * @returns {object}
 */
function buildMeta(coreEmailType, meta) {
  return {
    templateKey: String(meta.templateKey || ''),
    payloadVersion: CORE_PAYLOAD_VERSION,
    coreEmailType,
    ...(typeof meta.locale === 'string' && meta.locale ? { locale: meta.locale } : {}),
    ...(typeof meta.strapiVersion === 'string' && meta.strapiVersion
      ? { strapiVersion: meta.strapiVersion.slice(0, 64) }
      : {}),
  };
}

/**
 * Builds the v1 template data for a core mail.
 *
 * @param {'reset-password'|'email-confirmation'|'admin-forgot-password'} coreEmailType
 * @param {object} captured - Variables users-permissions rendered with
 *   ({ URL, SERVER_URL, ADMIN_URL, USER, TOKEN | CODE }); for
 *   admin-forgot-password `{ url, user, adminUrl, serverUrl }` (the data
 *   @strapi/admin passes to sendTemplatedEmail plus the configured URLs)
 * @param {{templateKey: string, locale?: string, strapiVersion?: string}} meta
 * @returns {object} Plain template data; `url` is '' when no absolute
 *   http(s) link can be built
 * @throws {TypeError} For an unknown core email type
 */
function buildCoreMailPayload(coreEmailType, captured = {}, meta = {}) {
  if (!CORE_EMAIL_TYPES.includes(coreEmailType)) throw new TypeError('Unknown core email type');
  if (coreEmailType === 'admin-forgot-password') {
    const url = absoluteHttpUrl(captured.url);
    return {
      user: allowlistUser(captured.user),
      url,
      token: adminResetToken(url),
      adminUrl: asText(captured.adminUrl),
      serverUrl: asText(captured.serverUrl),
      meta: buildMeta(coreEmailType, meta),
    };
  }
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
    meta: buildMeta(coreEmailType, meta),
  };
  return payload;
}

const META_VARIABLES = Object.freeze([
  'meta',
  'meta.templateKey',
  'meta.payloadVersion',
  'meta.coreEmailType',
  'meta.locale',
  'meta.strapiVersion',
]);

/**
 * Variable names Magic Mail sends for a core mail (for the admin screen).
 *
 * @param {'reset-password'|'email-confirmation'|'admin-forgot-password'} coreEmailType
 * @returns {string[]}
 */
function coreMailVariableNames(coreEmailType) {
  if (coreEmailType === 'admin-forgot-password') {
    return [
      'user',
      ...USER_FIELDS.map((field) => `user.${field}`),
      'url',
      'token',
      'adminUrl',
      'serverUrl',
      ...META_VARIABLES,
    ];
  }
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
    ...META_VARIABLES,
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
  UP_CORE_EMAIL_TYPES,
  CORE_PAYLOAD_VERSION,
  USER_FIELDS,
  absoluteHttpUrl,
  allowlistUser,
  buildCoreLink,
  buildCoreMailPayload,
  coreEmailTypeFromData,
  coreMailVariableNames,
  createCoreMailCapture,
};
