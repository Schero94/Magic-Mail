'use strict';

/**
 * Tracking URL policy.
 *
 * Click tracking rewrites `<a href>` targets to a MagicMail redirect endpoint
 * and PERSISTS the original URL in the database. That is fine for ordinary
 * marketing links, but catastrophic for authentication URLs: password-reset,
 * email-confirmation, magic-link, OAuth and other one-time token links would
 * be stored in plaintext (and historically logged), enabling account takeover
 * for anyone who can read the logs or the tracking table.
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
];

// Query/fragment parameter names that carry secrets or one-time tokens.
const SENSITIVE_PARAM_NAMES = [
  'token', 'code', 'jwt', 'access_token', 'refresh_token', 'id_token',
  'reset', 'reset_token', 'resettoken', 'confirmation', 'confirmationtoken',
  'confirmation_token', 'key', 'secret', 'signature', 'sig', 'otp', 'auth',
  'apikey', 'api_key', 'password', 'pwd', 'hash', 'nonce', 'state', 'ticket',
  'activation', 'activationtoken', 'invite', 'invitation',
];

// A JWT-looking triple of base64url segments.
const JWT_LIKE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;

/**
 * Returns true when a URL must NOT be click-tracked because it likely carries
 * authentication material or a one-time token.
 *
 * @param {string} rawUrl - Absolute URL taken from an email body
 * @returns {boolean}
 */
function isSensitiveTrackingUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return true;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    // Unparseable → treat as sensitive (never rewrite/store something we can't reason about).
    return true;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  const path = url.pathname || '';
  if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path))) return true;

  for (const [name] of url.searchParams) {
    if (SENSITIVE_PARAM_NAMES.includes(name.toLowerCase())) return true;
  }

  const fragment = url.hash ? url.hash.slice(1) : '';
  if (fragment) {
    try {
      const fragParams = new URLSearchParams(fragment);
      for (const [name] of fragParams) {
        if (SENSITIVE_PARAM_NAMES.includes(name.toLowerCase())) return true;
      }
    } catch {
      // ignore malformed fragment parsing
    }
    if (JWT_LIKE.test(fragment)) return true;
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

module.exports = { isSensitiveTrackingUrl, redactUrlForLog };
