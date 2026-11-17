'use strict';

/**
 * Mailgun sending domain: normalisation and host-name validation.
 *
 * Mailgun takes the domain as a URL path segment (`/v3/{domain_name}/messages`),
 * so only a bare host name works. Admins often paste the dashboard URL form
 * (`https://mg.example.com/`); that is normalised on save instead of failing at
 * send time (ACC-MG-01). The admin wizard mirrors these rules in
 * admin/src/utils/mailgunDomain.mjs (keep both in sync; a test compares them).
 */

/**
 * Host name with at least two labels, each 1-63 characters of [a-z0-9-] that
 * neither start nor end with a hyphen, 253 characters at most. Same rule as the
 * send-time check in sendViaMailgun (email-router.js).
 */
const MAILGUN_DOMAIN_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Mailgun sandbox domains (`sandbox<hex>.mailgun.org`). */
const MAILGUN_SANDBOX_PATTERN = /^sandbox[0-9a-f]+\.mailgun\.org$/i;

/**
 * Trims, strips a leading `http://` or `https://` and trailing slashes, and
 * lowercases. Anything else (a path, spaces inside) is kept so validation can
 * reject it instead of silently cutting it off.
 *
 * @param {unknown} value - Domain as entered or stored
 * @returns {string} Normalised domain; '' for a non-string or empty value
 */
function normalizeMailgunDomain(value) {
  if (typeof value !== 'string') return '';
  let domain = value.trim().replace(/^https?:\/\//i, '');
  // A loop instead of /\/+$/: that regex is quadratic on long runs of slashes.
  let end = domain.length;
  while (end > 0 && domain[end - 1] === '/') end -= 1;
  domain = domain.slice(0, end);
  return domain.toLowerCase();
}

/**
 * @param {unknown} value - Domain as entered or stored
 * @returns {boolean} true when the normalised value is a valid host name
 */
function isValidMailgunDomain(value) {
  return MAILGUN_DOMAIN_PATTERN.test(normalizeMailgunDomain(value));
}

/**
 * @param {unknown} value - Domain as entered or stored
 * @returns {boolean} true for a Mailgun sandbox domain
 */
function isMailgunSandboxDomain(value) {
  return MAILGUN_SANDBOX_PATTERN.test(normalizeMailgunDomain(value));
}

module.exports = {
  MAILGUN_DOMAIN_PATTERN,
  normalizeMailgunDomain,
  isValidMailgunDomain,
  isMailgunSandboxDomain,
};
