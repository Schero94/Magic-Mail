'use strict';

const { isMailgunSandboxDomain } = require('./mailgun-domain');

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
  'ECONNECTION',
  'ESOCKET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EDNS',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPROTOCOL',
  'ETLS',
  'EGREETING',
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
 * Fixed, actionable hints for SendGrid/Mailgun HTTP failures (ACC-ERR-01),
 * keyed by a stable code. The admin translates the code; the English text is
 * the fallback for API clients. These texts never include anything from the
 * provider response, so no recipient address or provider wording can leak.
 * Sources: twilio.com/docs/sendgrid/api-reference/how-to-use-the-sendgrid-v3-api/responses
 * (401, 403 Verified Sender Identity, 429), .../mail-send/mail-send (413),
 * documentation.mailgun.com .../domains/domains-sandbox (authorized recipients).
 * Keep equal to the `accounts.test.hint.*` values in admin/src/translations/en.json.
 */
const PROVIDER_HINTS = Object.freeze({
  SENDGRID_UNAUTHORIZED:
    'SendGrid rejected the API key. Check that the key was copied completely and has not been deleted.',
  SENDGRID_FORBIDDEN:
    'SendGrid refused the request. Check that the API key has the Mail Send permission and that the From address is a verified Sender Identity.',
  SENDGRID_PAYLOAD_TOO_LARGE:
    'SendGrid rejected the message as too large. Reduce the size of the content and attachments.',
  MAILGUN_UNAUTHORIZED:
    'Mailgun rejected the API key. Check the key and the region: a domain created in the EU region needs the EU region.',
  MAILGUN_DOMAIN_NOT_FOUND:
    'Mailgun does not know this domain in the selected region. Check the domain name and the region.',
  MAILGUN_SANDBOX_RECIPIENT:
    'Sandbox domains only deliver to authorized recipients. Add the recipient in Mailgun first.',
  PROVIDER_RATE_LIMITED: 'The provider is rate limiting requests. Wait a moment and try again.',
});

const PROVIDER_STATUS_MESSAGE = /^(SendGrid|Mailgun) API request failed: (\d{3})$/;

/**
 * Provider of an API send failure: `error.provider` ('sendgrid' | 'mailgun',
 * set by the send path) wins; otherwise it is parsed from the fixed
 * "<Provider> API request failed: <status>" message.
 *
 * @param {unknown} error
 * @returns {'sendgrid'|'mailgun'|null}
 */
function providerFromError(error) {
  const err = error && typeof error === 'object' ? error : {};
  if (typeof err.provider === 'string') {
    const tagged = err.provider.toLowerCase();
    return tagged === 'sendgrid' || tagged === 'mailgun' ? tagged : null;
  }
  const match = typeof err.message === 'string' ? PROVIDER_STATUS_MESSAGE.exec(err.message) : null;
  return match ? /** @type {'sendgrid'|'mailgun'} */ (match[1].toLowerCase()) : null;
}

/**
 * HTTP status of an API send failure (`error.status`, else from the message).
 *
 * @param {unknown} error
 * @returns {number|null}
 */
function providerStatusFromError(error) {
  const err = error && typeof error === 'object' ? error : {};
  if (Number.isInteger(err.status) && err.status >= 100 && err.status <= 599) return err.status;
  const match = typeof err.message === 'string' ? PROVIDER_STATUS_MESSAGE.exec(err.message) : null;
  return match ? Number(match[2]) : null;
}

/**
 * Maps a SendGrid/Mailgun HTTP failure to a fixed hint.
 *
 * Mailgun 400/403 map to the sandbox hint only when the account's domain is
 * known to be a sandbox domain; otherwise no cause is guessed.
 *
 * @param {unknown} error - Error thrown by the provider adapter
 * @param {{mailgunDomain?: unknown}} [context] - Mailgun domain of the account, when known
 * @returns {{code: keyof typeof PROVIDER_HINTS, message: string}|null}
 */
function providerErrorHint(error, { mailgunDomain } = {}) {
  const provider = providerFromError(error);
  const status = providerStatusFromError(error);
  if (!provider || !status) return null;
  let code = null;
  if (status === 429) code = 'PROVIDER_RATE_LIMITED';
  else if (provider === 'sendgrid') {
    code =
      {
        401: 'SENDGRID_UNAUTHORIZED',
        403: 'SENDGRID_FORBIDDEN',
        413: 'SENDGRID_PAYLOAD_TOO_LARGE',
      }[status] || null;
  } else if (status === 401) code = 'MAILGUN_UNAUTHORIZED';
  else if (status === 404) code = 'MAILGUN_DOMAIN_NOT_FOUND';
  else if ((status === 400 || status === 403) && isMailgunSandboxDomain(mailgunDomain)) {
    code = 'MAILGUN_SANDBOX_RECIPIENT';
  }
  return code ? { code, message: PROVIDER_HINTS[code] } : null;
}

/**
 * Client-safe result of a failed send: the message of toClientSendMessage
 * plus, for known provider failures, `hintCode` and the English `hint`.
 * The extra fields are additive; clients that read only `message` keep working.
 *
 * @param {unknown} error
 * @param {{mailgunDomain?: unknown}} [context]
 * @returns {{message: string, hintCode?: string, hint?: string}}
 */
function toClientSendResult(error, context) {
  const result = { message: toClientSendMessage(error) };
  const hint = providerErrorHint(error, context);
  if (hint) {
    result.hintCode = hint.code;
    result.hint = hint.message;
  }
  return result;
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

module.exports = {
  PROVIDER_HINTS,
  toClientSendMessage,
  toClientSendResult,
  providerErrorHint,
  providerFromError,
  providerStatusFromError,
  describeErrorForLog,
};
