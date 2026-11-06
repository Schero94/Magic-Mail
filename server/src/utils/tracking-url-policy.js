'use strict';

/**
 * Tracking URL policy.
 *
 * Click tracking rewrites `<a href>` targets to a MagicMail redirect endpoint
 * and PERSISTS the original URL in the database. That is fine for ordinary
 * marketing links, but catastrophic for authentication URLs: password-reset,
 * email-confirmation, magic-link, OAuth and other one-time token links would
 * be stored in plaintext, enabling account takeover for anyone who can read
 * the tracking table.
 *
 * This module classifies such URLs so the caller can skip rewriting/storing
 * them. It errs on the side of NOT tracking: a false positive merely loses a
 * click metric, while a false negative leaks a credential.
 */

// Path segments that indicate an authentication / one-time-token flow.
const SENSITIVE_PATH_PATTERNS = [
  /reset[-_]?password/i,
  /forgot[-_]?password/i,
  /change[-_]?password/i,
  /email[-_]?confirmation/i,
  /confirm(ation)?/i,
  /verif(y|ication)/i,
  /magic[-_]?link/i,
  /passwordless/i,
  /activate|activation/i,
  /\binvite\b|invitation/i,
  /unsubscribe/i,
  /\boauth\b|\bsso\b/i,
  /\bauth\b/i,
  /one[-_]?time|\botp\b/i,
  /login|signin|sign-in/i,
  /\btoken\b/i,
];

// Parameter names (normalised: lower case, without `-`, `_`, `.`) that are
// always sensitive.
const SENSITIVE_PARAM_EXACT = new Set([
  'code', 'key', 'sig', 'otp', 'auth', 'state', 'hash', 'pin', 'sid', 'jwt',
  'reset', 'confirmation', 'activation', 'invite', 'invitation', 'ticket',
  'nonce', 'signature', 'secret', 'password', 'pwd', 'passwd', 'token',
  'apikey', 'credential', 'credentials', 'session', 'magic', 'k', 'oobcode',
]);

// Any parameter name CONTAINING one of these is sensitive
// (loginToken, accessToken, resetPasswordToken, x-amz-signature, ...).
const SENSITIVE_PARAM_SUBSTRINGS = [
  'token', 'secret', 'passw', 'pwd', 'session', 'jwt', 'magic', 'apikey',
  'accesskey', 'privatekey', 'credential', 'nonce', 'ticket', 'signature',
  'invit', 'reset', 'confirm', 'verif', 'activat', 'oauth', 'bearer',
];

// Any parameter name ENDING with one of these is sensitive
// (authcode, logincode, hmacsig, emailotp, ...).
const SENSITIVE_PARAM_SUFFIXES = ['code', 'key', 'sig', 'otp', 'auth', 'state', 'hash', 'pin'];

// Individual words of a camelCase / separated name that are sensitive
// (e.g. `auth_user`, `keyId`).
const SENSITIVE_PARAM_WORDS = new Set(['auth', 'key', 'code', 'otp', 'sig', 'token', 'secret', 'session']);

// A JWT-looking triple of base64url segments.
const JWT_LIKE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;

const MAX_INSPECTED_PARAMS = 200;

/**
 * Splits a parameter name into lower-case words (camelCase and separators).
 * @param {string} name
 * @returns {string[]}
 */
function paramWords(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true when a query/fragment parameter NAME likely carries a secret.
 * @param {string} name
 * @returns {boolean}
 */
function isSensitiveParamName(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  const normalized = name.toLowerCase().replace(/[-_.\s[\]]/g, '');
  if (!normalized) return false;
  if (SENSITIVE_PARAM_EXACT.has(normalized)) return true;
  if (SENSITIVE_PARAM_SUBSTRINGS.some((part) => normalized.includes(part))) return true;
  if (SENSITIVE_PARAM_SUFFIXES.some((suffix) => normalized.length > suffix.length && normalized.endsWith(suffix))) {
    return true;
  }
  return paramWords(name).some((word) => SENSITIVE_PARAM_WORDS.has(word));
}

/**
 * Returns true when a VALUE looks like a random credential: long and
 * high-entropy (mixed character classes, long hex, or long base64url).
 * Readable values such as `spring_sale_2026` or Strapi document ids stay
 * trackable.
 *
 * @param {string} value
 * @param {number} [minLength=20]
 * @returns {boolean}
 */
function looksLikeSecretValue(value, minLength = 20) {
  if (typeof value !== 'string' || value.length < minLength) return false;
  if (value.length > 4096) return true;
  if (/^[A-Fa-f0-9]{32,}$/.test(value)) return true;
  if (!/^[A-Za-z0-9_\-.~+/=%]+$/.test(value)) return false;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  if (hasUpper && hasLower && hasDigit) return true;
  // Long unbroken base64url run with digits and letters (no word separators).
  return value.length >= 40 && /^[A-Za-z0-9]+$/.test(value) && hasDigit && (hasUpper || hasLower);
}

/**
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
function hasSensitiveParams(params) {
  let inspected = 0;
  for (const [name, value] of params) {
    inspected += 1;
    if (inspected > MAX_INSPECTED_PARAMS) return true;
    if (isSensitiveParamName(name)) return true;
    // A bare token used as the parameter name (`?<token>` or `#<token>`).
    if (looksLikeSecretValue(name)) return true;
    if (looksLikeSecretValue(value)) return true;
    if (JWT_LIKE.test(value)) return true;
  }
  return false;
}

/**
 * Returns true when a URL must NOT be click-tracked because it likely carries
 * authentication material or a one-time token.
 *
 * @param {string} rawUrl - Absolute URL taken from an email body
 * @returns {boolean}
 */
function isSensitiveTrackingUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return true;
  if (rawUrl.length > 8192) return true;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    // Unparseable → treat as sensitive (never rewrite/store something we can't reason about).
    return true;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  // Basic-auth credentials embedded in the URL.
  if (url.username || url.password) return true;

  const path = url.pathname || '';
  if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path))) return true;

  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    // keep the raw path
  }
  // Percent-encoded keywords (`/reset%2Dpassword`, `/%6Dagic-link`) are not
  // decoded by the URL parser; check the decoded form too.
  if (decodedPath !== path && SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(decodedPath))) return true;
  if (decodedPath.split('/').some((segment) => looksLikeSecretValue(segment, 32))) return true;

  if (hasSensitiveParams(url.searchParams)) return true;

  const fragment = url.hash ? url.hash.slice(1) : '';
  if (fragment) {
    if (JWT_LIKE.test(fragment)) return true;
    const queryPart = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment;
    try {
      if (hasSensitiveParams(new URLSearchParams(queryPart))) return true;
    } catch {
      return true;
    }
  }

  if (JWT_LIKE.test(url.search) || JWT_LIKE.test(path)) return true;

  return false;
}

/**
 * Produces a log-safe representation of a URL: scheme + host + path only,
 * never query string or fragment (which may hold tokens).
 *
 * @param {string} rawUrl
 * @returns {string}
 */
function redactUrlForLog(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.length > 64 ? `${url.pathname.slice(0, 64)}…` : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search ? '?…' : ''}`;
  } catch {
    return '[unparseable-url]';
  }
}

/**
 * Returns true when `hostname` equals one of the allowed hosts or is a
 * subdomain of one. Entries may be written as `example.com` or `.example.com`.
 *
 * @param {string} hostname
 * @param {string[]} allowedHosts
 * @returns {boolean}
 */
function isHostAllowed(hostname, allowedHosts) {
  if (typeof hostname !== 'string' || !hostname) return false;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return (allowedHosts || []).some((entry) => {
    if (typeof entry !== 'string') return false;
    const allowed = entry.trim().toLowerCase().replace(/^\*?\./, '').replace(/\.$/, '');
    if (!allowed) return false;
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

module.exports = {
  isSensitiveTrackingUrl,
  isSensitiveParamName,
  looksLikeSecretValue,
  isHostAllowed,
  redactUrlForLog,
};
