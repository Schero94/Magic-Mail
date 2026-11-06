'use strict';

/**
 * Maps send/connect errors to fixed client messages.
 *
 * Raw transport errors (nodemailer, fetch) carry internal host names, IPs,
 * ports and SMTP response lines with recipient addresses. Echoing them to the
 * admin UI turned the account test into an internal port scanner (SEC-12) and
 * leaked server internals (SEC-13). Only messages the plugin authored itself
 * (validation and account-configuration errors, provider HTTP status lines)
 * are passed through; everything else becomes one of a few fixed texts.
 */

const CONNECTION_CODES = new Set([
  'ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND',
  'EAI_AGAIN', 'EDNS', 'EHOSTUNREACH', 'ENETUNREACH', 'EPROTOCOL', 'ETLS', 'EGREETING',
]);

const SAFE_PASSTHROUGH_CODES = new Set(['MAGIC_MAIL_VALIDATION', 'MAGIC_MAIL_ACCOUNT_CONFIG']);

/** Plugin-authored messages that are safe to show as-is. */
const SAFE_MESSAGE_PATTERNS = [
  /^No email account available$/,
  /^(SendGrid|Mailgun|Gmail|Microsoft Graph|Microsoft|Yahoo)[\w ]* API request failed: \d{3}$/,
];

/**
 * Returns a client-safe message for a send failure.
 *
 * @param {unknown} error
 * @returns {string}
 */
function toClientSendMessage(error) {
  const err = error && typeof error === 'object' ? error : {};
  const message = typeof err.message === 'string' ? err.message : '';

  if (SAFE_PASSTHROUGH_CODES.has(err.code) || err.name === 'ValidationError') {
    return message || 'The email could not be sent.';
  }
  if (SAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return message;
  }
  if (err.code === 'EAUTH') {
    return 'The mail server rejected the credentials. Check the user name and password.';
  }
  if (err.code === 'EENVELOPE') {
    return 'The mail server rejected the sender or a recipient address.';
  }
  if (CONNECTION_CODES.has(err.code) || CONNECTION_CODES.has(err.cause?.code)) {
    return 'Could not connect to the mail server. Check host, port and TLS settings.';
  }
  return 'The email could not be sent. See the server log for details.';
}

/**
 * Short, non-sensitive description of an error for server logs: class name
 * and code only (no message, which may contain recipients or hosts).
 *
 * @param {unknown} error
 * @returns {string}
 */
function describeErrorForLog(error) {
  const err = error && typeof error === 'object' ? error : {};
  const name = typeof err.name === 'string' ? err.name : 'Error';
  const code = typeof err.code === 'string' || typeof err.code === 'number' ? ` (${err.code})` : '';
  return `${name}${code}`;
}

module.exports = { toClientSendMessage, describeErrorForLog };
