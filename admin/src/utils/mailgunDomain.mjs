/**
 * Mailgun sending domain rules for the account wizard. Mirrors
 * server/src/utils/mailgun-domain.js (the server is authoritative; a test
 * compares both on the same vectors).
 */

const MAILGUN_DOMAIN_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Trims, strips a leading `http://` or `https://` and trailing slashes, and
 * lowercases.
 *
 * @param {unknown} value - Domain as typed
 * @returns {string} Normalised domain; '' for a non-string value
 */
export const normalizeMailgunDomain = (value) => {
  if (typeof value !== 'string') return '';
  const domain = value.trim().replace(/^https?:\/\//i, '');
  let end = domain.length;
  while (end > 0 && domain[end - 1] === '/') end -= 1;
  return domain.slice(0, end).toLowerCase();
};

/**
 * @param {unknown} value - Domain as typed
 * @returns {boolean} true when the normalised value is a valid host name
 */
export const isValidMailgunDomain = (value) =>
  MAILGUN_DOMAIN_PATTERN.test(normalizeMailgunDomain(value));
