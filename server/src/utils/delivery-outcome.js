'use strict';

/**
 * Delivery outcome classification for failover and the send queue (outbox).
 *
 * A message may only be handed to another account, or re-sent by the queue,
 * when an error proves that no provider accepted it. Everything else either
 * fails for good (permanent), waits for capacity, or goes to a person
 * (ambiguous -> `uncertain`). Inline sends and queue sends use the same rule
 * (`failoverAllowed`), so neither can deliver a message twice on its own.
 *
 * Sources (checked 2026-11-07):
 * - nodemailer 10.3.1 (installed): socket failures are reported as
 *   ECONNECTION / ESOCKET / ETIMEDOUT with command 'CONN' whatever the SMTP
 *   stage (dist/cjs/smtp-connection/index.js `_onClose`, `_onTimeout`);
 *   `err.responseCode` / `err.permanent` come from `_formatError` and
 *   `isPermanentResponseCode` (5xx except 503) in dist/cjs/errors.js.
 * - RFC 5321 4.2 / 4.3.2: a 4yz/5yz reply means the command was not accepted.
 * - SendGrid v3 Mail Send, Mailgun messages, Microsoft Graph sendMail and Gmail
 *   users.messages.send document no idempotency key, so an ambiguous outcome is
 *   never retried automatically (PROVIDER_CAPABILITIES).
 */

/** @typedef {'transient'|'permanent'|'ambiguous'|'capacity'|'expired'} DeliveryClass */

/** Errors raised before any network contact (credentials, config, envelope). */
const PRE_NETWORK_CODES = new Set([
  'EAUTH',
  'ENOAUTH',
  'EOAUTH2',
  'ETLS',
  'EDNS',
  'EENVELOPE',
  'MAGIC_MAIL_ACCOUNT_CONFIG',
  'MAGIC_MAIL_ACCOUNT_UNAVAILABLE',
  'MAGIC_MAIL_ACCOUNT_QUOTA',
]);

/**
 * System codes that can only come from name resolution or from opening a
 * connection: a refused connect (ECONNREFUSED), a failed lookup
 * (getaddrinfo ENOTFOUND / EAI_AGAIN) or undici's connect timeout.
 */
const CONNECT_ONLY_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * Routing errors. They are raised on connect, but also on an established
 * socket (for example a retransmission timeout after an ICMP unreachable
 * on Linux), so they prove nothing without `syscall: 'connect'`.
 */
const ROUTE_CODES = new Set(['EHOSTUNREACH', 'ENETUNREACH']);

/**
 * True when a system error was raised by connect() or getaddrinfo(). Node
 * sets `error.syscall` on system errors (nodejs.org/api/errors.html
 * "error.syscall"); with autoSelectFamily a refused connect is an
 * AggregateError whose `errors` each carry the syscall.
 *
 * @param {*} error
 * @returns {boolean}
 */
function raisedOnConnect(error) {
  if (!error || typeof error !== 'object') return false;
  const phase = (value) => value === 'connect' || value === 'getaddrinfo';
  if (phase(error.syscall)) return true;
  return (
    Array.isArray(error.errors) &&
    error.errors.length > 0 &&
    error.errors.every((inner) => inner && typeof inner === 'object' && phase(inner.syscall))
  );
}

/**
 * True when a system code (top level or fetch cause) proves that no
 * connection to the provider existed.
 *
 * @param {*} error - error or cause carrying `code`
 * @returns {boolean}
 */
function provesNotConnected(error) {
  if (!error || typeof error !== 'object') return false;
  if (CONNECT_ONLY_CODES.has(error.code)) return true;
  return ROUTE_CODES.has(error.code) && raisedOnConnect(error);
}

/** Socket-level SMTP errors: safe only before the server answered DATA with 354. */
const SMTP_SOCKET_CODES = new Set(['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNRESET']);

const CAPACITY_CODES = new Set(['MAGIC_MAIL_NO_ACCOUNT', 'MAGIC_MAIL_QUOTA_EXHAUSTED']);

const PERMANENT_CODES = new Set(['MAGIC_MAIL_VALIDATION', 'PAYLOAD_UNREADABLE']);

/**
 * HTTP statuses that prove the request was refused before processing. 503
 * means the server "is currently unable to handle the request" (RFC 9110
 * 15.6.4); Microsoft Graph documents it as "temporarily unavailable ... You
 * can repeat the request after a delay" (learn.microsoft.com/graph/errors).
 * 500, 502 and 504 stay ambiguous: the request may have been processed.
 */
const TRANSIENT_HTTP = new Set([401, 403, 408, 429, 503]);

/**
 * Idempotency support per provider. No current provider documents an
 * idempotency key (see module header), so `uncertain` rows are never
 * re-sent automatically.
 */
const PROVIDER_CAPABILITIES = Object.freeze({
  smtp: { idempotencyKey: false },
  nodemailer: { idempotencyKey: false },
  'gmail-oauth': { idempotencyKey: false },
  'microsoft-oauth': { idempotencyKey: false },
  'yahoo-oauth': { idempotencyKey: false },
  sendgrid: { idempotencyKey: false },
  mailgun: { idempotencyKey: false },
});

/** @param {*} value @returns {boolean} */
const isCode = (value) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value);

/**
 * Classifies one send error.
 *
 * @param {*} error - Error thrown by a provider adapter or by routing
 * @returns {DeliveryClass}
 */
function classifyDeliveryError(error) {
  if (!error || typeof error !== 'object') return 'ambiguous';
  const code = error.code;

  if (PERMANENT_CODES.has(code) || error.name === 'ValidationError') return 'permanent';
  if (CAPACITY_CODES.has(code)) return 'capacity';
  if (code === 'EXPIRED') return 'expired';
  // Failed before a provider got the message (token refresh, credentials).
  if (error.magicMailPreDispatch === true) return 'transient';

  // An explicit SMTP reply: the server refused the command.
  const responseCode = Number(error.responseCode);
  if (Number.isInteger(responseCode) && responseCode >= 400 && responseCode < 600) {
    return responseCode >= 500 && responseCode !== 503 ? 'permanent' : 'transient';
  }

  if (PRE_NETWORK_CODES.has(code)) return 'transient';

  // nodemailer reports every socket problem as ECONNECTION / ESOCKET /
  // ETIMEDOUT and keeps the system code in `originalCode`. The SMTP stage the
  // probe saw decides: a drop after 354 may follow an accepted message,
  // whatever the system code says.
  if (SMTP_SOCKET_CODES.has(code)) {
    if (error.magicMailSmtpStage === 'before-data') return 'transient';
    if (error.magicMailSmtpStage === 'after-data') return 'ambiguous';
    // No probe: only proof of the connect phase counts.
    return CONNECT_ONLY_CODES.has(error.originalCode) || raisedOnConnect(error)
      ? 'transient'
      : 'ambiguous';
  }

  if (provesNotConnected(error)) return 'transient';
  // fetch() wraps network errors as TypeError('fetch failed', { cause }).
  if (error.cause && typeof error.cause === 'object' && provesNotConnected(error.cause)) {
    return 'transient';
  }

  const status = Number(error.status);
  if (Number.isInteger(status) && status >= 400 && status < 600) {
    if (TRANSIENT_HTTP.has(status)) return 'transient';
    // Any other 4xx: the provider rejected the request (RFC 9110 15.5).
    if (status < 500) return 'permanent';
    // 5xx after the body was sent: the provider may have queued the message.
    return 'ambiguous';
  }

  // fetch errors after connecting, timeouts and everything unknown.
  return 'ambiguous';
}

/**
 * Combines the per-attempt classes of one failover chain. Any ambiguous
 * attempt makes the whole send ambiguous (that account may have delivered).
 *
 * @param {DeliveryClass[]} attemptClasses - Classes of earlier failed attempts
 * @param {*} finalError - The error that ended the chain
 * @returns {DeliveryClass}
 */
function combineOutcome(attemptClasses, finalError) {
  const finalClass = classifyDeliveryError(finalError);
  if (Array.isArray(attemptClasses) && attemptClasses.includes('ambiguous')) return 'ambiguous';
  return finalClass;
}

/**
 * Code-only description of an error for storage and the admin UI. Never the
 * message or the SMTP response text (both may contain addresses).
 *
 * @param {*} error
 * @returns {string} `^[A-Z0-9_]{1,64}$`
 */
function sanitizeErrorCode(error) {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  const status = Number(error.status);
  if (Number.isInteger(status) && status >= 100 && status < 600) return `HTTP_${status}`;
  const responseCode = Number(error.responseCode);
  if (Number.isInteger(responseCode) && responseCode >= 200 && responseCode < 600) {
    return `SMTP_${responseCode}`;
  }
  if (isCode(error.code)) return error.code;
  if (error.cause && isCode(error.cause.code)) return error.cause.code;
  if (error.name === 'TimeoutError') return 'TIMEOUT';
  if (error.name === 'AbortError') return 'ABORTED';
  return 'UNKNOWN';
}

/**
 * Delay before retry number `retryNumber` (1-based) with symmetric jitter.
 *
 * @param {number} retryNumber
 * @param {number[]} backoffMs
 * @param {number} [jitterRatio=0.2]
 * @param {() => number} [random=Math.random]
 * @returns {number} milliseconds
 */
function backoffDelay(retryNumber, backoffMs, jitterRatio = 0.2, random = Math.random) {
  const steps = Array.isArray(backoffMs) && backoffMs.length > 0 ? backoffMs : [60_000];
  const index = Math.min(Math.max(1, Math.floor(retryNumber)) - 1, steps.length - 1);
  const base = steps[index];
  const ratio = Math.min(Math.max(Number(jitterRatio) || 0, 0), 0.9);
  const factor = 1 - ratio + 2 * ratio * random();
  return Math.max(1_000, Math.round(base * factor));
}

/**
 * Private nodemailer logger that records how far an SMTP session got. It
 * stores booleans only and never forwards or keeps the log text, which
 * contains addresses. nodemailer logs every server reply with
 * `{tnx: 'server'}` when `transactionLog` is set
 * (smtp-connection/index.js `_processResponse`).
 *
 * @returns {{probe: {dataAccepted: boolean, finalReply: boolean}, logger: object}}
 */
function createSmtpProbe() {
  const probe = { dataAccepted: false, finalReply: false };
  const observe = (entry, message) => {
    if (!entry || entry.tnx !== 'server' || typeof message !== 'string') return;
    if (probe.dataAccepted) {
      probe.finalReply = true;
      return;
    }
    if (/^354[ -]?/.test(message)) probe.dataAccepted = true;
  };
  const noop = () => {};
  const logger = {
    trace: noop,
    debug: observe,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  };
  return { probe, logger };
}

/**
 * Marks an SMTP error with the stage the probe saw (non-enumerable, so it
 * never reaches JSON or logs).
 *
 * @param {*} error
 * @param {{dataAccepted: boolean}} probe
 * @returns {*} the same error
 */
function tagSmtpStage(error, probe) {
  if (error && typeof error === 'object' && probe) {
    try {
      Object.defineProperty(error, 'magicMailSmtpStage', {
        value: probe.dataAccepted ? 'after-data' : 'before-data',
        enumerable: false,
        configurable: true,
      });
    } catch {
      // frozen error: classification falls back to ambiguous
    }
  }
  return error;
}

/**
 * Marks an error raised before the provider received anything.
 * @param {*} error
 * @returns {*}
 */
function tagPreDispatch(error) {
  if (error && typeof error === 'object') {
    try {
      Object.defineProperty(error, 'magicMailPreDispatch', {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // ignore
    }
  }
  return error;
}

/**
 * Marks an error that came out of the provider adapter (sendViaAccount), as
 * opposed to a database or bookkeeping error around it.
 * @param {*} error
 * @returns {*}
 */
function tagProviderError(error) {
  if (error && typeof error === 'object') {
    try {
      Object.defineProperty(error, 'magicMailFromProvider', {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // frozen error: the queue treats it as ambiguous
    }
  }
  return error;
}

/**
 * Account-level SMTP refusals (authentication, TLS, envelope). The server
 * answered with a 5xx reply, so nothing was accepted, but another account
 * (other server, other credentials, other sender) may still deliver.
 */
const ACCOUNT_REFUSAL_CODES = new Set(['EAUTH', 'ENOAUTH', 'EOAUTH2', 'ETLS', 'EENVELOPE']);

/**
 * True when the next account may be tried after this error: the error
 * proves that the provider did not accept the message. Used by the inline
 * failover and by the queue worker alike.
 *
 * - `transient` errors (refused connection, SMTP 4xx, HTTP 401/403/408/429/503,
 *   a socket drop before the server answered DATA with 354) fail over.
 * - A permanent SMTP reply to authentication, TLS or the envelope fails
 *   over: the reply proves the refusal and it is specific to the account.
 * - Ambiguous errors (socket drop or timeout after 354, HTTP 500/502/504,
 *   fetch errors after connecting, unknown errors) never fail over: that
 *   provider may have accepted the message.
 * - Other permanent errors (validation, 5xx to the message, HTTP 4xx) stop:
 *   another account would be refused for the same reason.
 *
 * @param {*} error - Error thrown by a provider adapter
 * @returns {boolean}
 */
function failoverAllowed(error) {
  const errorClass = classifyDeliveryError(error);
  if (errorClass === 'transient') return true;
  if (errorClass !== 'permanent' || !ACCOUNT_REFUSAL_CODES.has(error.code)) return false;
  const responseCode = Number(error.responseCode);
  return Number.isInteger(responseCode) && responseCode >= 500 && responseCode < 600;
}

module.exports = {
  PROVIDER_CAPABILITIES,
  classifyDeliveryError,
  failoverAllowed,
  combineOutcome,
  sanitizeErrorCode,
  backoffDelay,
  createSmtpProbe,
  tagSmtpStage,
  tagPreDispatch,
  tagProviderError,
};
