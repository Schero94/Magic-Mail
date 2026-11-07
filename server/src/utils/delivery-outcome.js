'use strict';

/**
 * Delivery outcome classification for the send queue (outbox).
 *
 * The queue may only re-send a message automatically when an error proves
 * that no provider accepted it. Everything else either fails for good
 * (permanent), waits for capacity, or goes to a person (ambiguous ->
 * `uncertain`). This module is deliberately stricter than the immediate
 * failover in email-router.js (`isSafeToRetry`), which is left unchanged.
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

/** Errors raised before any network contact or by a refused connection. */
const NOT_CONNECTED_CODES = new Set([
  'EAUTH',
  'ENOAUTH',
  'EOAUTH2',
  'ETLS',
  'EDNS',
  'EENVELOPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'MAGIC_MAIL_ACCOUNT_CONFIG',
  'MAGIC_MAIL_ACCOUNT_UNAVAILABLE',
  'MAGIC_MAIL_ACCOUNT_QUOTA',
]);

/** Socket-level SMTP errors: safe only before the server answered DATA with 354. */
const SMTP_SOCKET_CODES = new Set(['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNRESET']);

const CAPACITY_CODES = new Set(['MAGIC_MAIL_NO_ACCOUNT', 'MAGIC_MAIL_QUOTA_EXHAUSTED']);

const PERMANENT_CODES = new Set(['MAGIC_MAIL_VALIDATION', 'PAYLOAD_UNREADABLE']);

/** HTTP statuses that prove the request was refused before processing. */
const TRANSIENT_HTTP = new Set([401, 403, 408, 429]);

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
  const causeCode = error.cause && typeof error.cause === 'object' ? error.cause.code : undefined;

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

  if (NOT_CONNECTED_CODES.has(code) || NOT_CONNECTED_CODES.has(error.originalCode)) {
    return 'transient';
  }
  if (NOT_CONNECTED_CODES.has(causeCode)) return 'transient';

  if (SMTP_SOCKET_CODES.has(code)) {
    return error.magicMailSmtpStage === 'before-data' ? 'transient' : 'ambiguous';
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

module.exports = {
  PROVIDER_CAPABILITIES,
  classifyDeliveryError,
  combineOutcome,
  sanitizeErrorCode,
  backoffDelay,
  createSmtpProbe,
  tagSmtpStage,
  tagPreDispatch,
};
