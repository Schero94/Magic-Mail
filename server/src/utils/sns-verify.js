'use strict';

/**
 * Verification of Amazon SNS HTTP(S) messages (used by the Amazon SES
 * delivery webhook: SES event destination -> SNS topic -> HTTPS subscription).
 *
 * Docs (checked 2026-11-18):
 * - "Verifying the signature of an Amazon SNS message when using HTTP
 *   query-based requests":
 *   https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html
 *   String to sign: "Name\nValue\n" pairs in byte order of the names, ending
 *   with one newline. Notification: Message, MessageId, Subject (only if
 *   present), Timestamp, TopicArn, Type. SubscriptionConfirmation and
 *   UnsubscribeConfirmation: Message, MessageId, SubscribeURL, Timestamp,
 *   Token, TopicArn, Type. SignatureVersion 1 = SHA1withRSA, 2 = SHA256withRSA.
 * - "Verifying the signatures of Amazon SNS messages" (best practices):
 *   https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 *   fetch the certificate over HTTPS from an SNS URL, reject unexpected
 *   TopicArns.
 * - JSON formats: .../sns/latest/dg/http-notification-json.html,
 *   .../http-subscription-confirmation-json.html,
 *   .../http-unsubscribe-confirmation-json.html; confirmation by GET of
 *   SubscribeURL: .../sns/latest/dg/SendMessageToHttp.prepare.html
 *
 * Trust model: the certificate is only fetched from
 * `https://sns.<region>.amazonaws.com/SimpleNotificationService-<id>.pem`
 * (no user info, no port, no redirects), so TLS to the fixed AWS host
 * authenticates it. The certificate must be inside its validity period and
 * hold an RSA key. SNS serves the leaf certificate only, so no further chain
 * is built. The docs do not ask for a timestamp window; replays are handled
 * by the caller (SNS MessageId as replay key, per-event ids).
 */

const crypto = require('node:crypto');

const SNS_HOST = /^sns\.[a-z]{2}(?:-[a-z]+)+-\d{1,2}\.amazonaws\.com$/;
const CERT_PATH = /^\/SimpleNotificationService-[A-Za-z0-9]{1,64}\.pem$/;
const MESSAGE_TYPES = new Set([
  'Notification',
  'SubscriptionConfirmation',
  'UnsubscribeConfirmation',
]);
const MAX_CERT_BYTES = 16 * 1024;
const CERT_TIMEOUT_MS = 5_000;
const CONFIRM_TIMEOUT_MS = 10_000;
const CERT_CACHE_TTL_MS = 60 * 60 * 1000;
const CERT_CACHE_MAX = 16;
const MAX_FIELD_LENGTH = 300_000;

/** @type {Map<string, {key: crypto.KeyObject, expiresAt: number}>} */
const certCache = new Map();

/**
 * Parses the JSON envelope SNS posts (`Content-Type: text/plain`). Every
 * field the signature covers must be a string.
 *
 * @param {Buffer|string} rawBody
 * @returns {Record<string, string>|null} The message, or null when malformed
 */
function parseSnsMessage(rawBody) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!MESSAGE_TYPES.has(parsed.Type)) return null;
  const required = ['Type', 'MessageId', 'TopicArn', 'Message', 'Timestamp', 'SignatureVersion'];
  required.push('Signature', 'SigningCertURL');
  if (parsed.Type !== 'Notification') required.push('SubscribeURL', 'Token');
  for (const field of required) {
    if (typeof parsed[field] !== 'string' || parsed[field].length > MAX_FIELD_LENGTH) return null;
  }
  if (parsed.Subject !== undefined && typeof parsed.Subject !== 'string') return null;
  if (!/^[\x21-\x7e]{1,128}$/.test(parsed.MessageId)) return null;
  if (Number.isNaN(Date.parse(parsed.Timestamp))) return null;
  return parsed;
}

/**
 * The exact string SNS signs for a message (see module docs).
 *
 * @param {Record<string, string>} message - Result of parseSnsMessage
 * @returns {string}
 */
function snsStringToSign(message) {
  const fields =
    message.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  let out = '';
  for (const field of fields) {
    if (field === 'Subject' && typeof message.Subject !== 'string') continue;
    out += `${field}\n${message[field]}\n`;
  }
  return out;
}

/**
 * Parses an SNS URL and checks scheme, host, user info and port.
 *
 * @param {unknown} value
 * @returns {URL|null}
 */
function snsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!SNS_HOST.test(url.hostname)) return null;
  return url;
}

/**
 * Certificate URL check: SNS host and the `SimpleNotificationService-*.pem`
 * path, no query or fragment.
 *
 * @param {unknown} value
 * @returns {URL|null}
 */
function signingCertUrl(value) {
  const url = snsUrl(value);
  if (!url || url.search || url.hash || !CERT_PATH.test(url.pathname)) return null;
  return url;
}

/**
 * SubscribeURL check: SNS host, `Action=ConfirmSubscription`, the expected
 * topic and a token.
 *
 * @param {unknown} value
 * @param {string} topicArn
 * @returns {URL|null}
 */
function subscribeUrl(value, topicArn) {
  const url = snsUrl(value);
  if (!url || url.pathname !== '/' || url.hash) return null;
  if (url.searchParams.get('Action') !== 'ConfirmSubscription') return null;
  if (url.searchParams.get('TopicArn') !== topicArn) return null;
  if (!url.searchParams.get('Token')) return null;
  return url;
}

/**
 * Reads at most `max` bytes of a response body.
 *
 * @param {Response} response
 * @param {number} max
 * @returns {Promise<Buffer|null>} null when larger
 */
async function readCapped(response, max) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > max ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Public key of the signing certificate, from the cache or fetched once.
 *
 * @param {URL} url - Checked certificate URL
 * @param {{fetchImpl: Function, now: number}} options
 * @returns {Promise<crypto.KeyObject|null>}
 * @sideeffect One HTTPS GET to the SNS host on a cache miss.
 */
async function signingKey(url, { fetchImpl, now }) {
  const cacheKey = url.href;
  const cached = certCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.key;
  certCache.delete(cacheKey);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(CERT_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response || response.status !== 200) {
    await response?.body?.cancel?.().catch?.(() => {});
    return null;
  }
  let certificate;
  try {
    const pem = await readCapped(response, MAX_CERT_BYTES);
    if (!pem) return null;
    certificate = new crypto.X509Certificate(pem);
  } catch {
    return null;
  }
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  if (!(validFrom <= now && now <= validTo)) return null;
  const key = certificate.publicKey;
  if (key.asymmetricKeyType !== 'rsa') return null;
  if (certCache.size >= CERT_CACHE_MAX) certCache.delete(certCache.keys().next().value);
  certCache.set(cacheKey, { key, expiresAt: Math.min(now + CERT_CACHE_TTL_MS, validTo) });
  return key;
}

/**
 * Verifies the signature of a parsed SNS message.
 *
 * @param {Record<string, string>} message - Result of parseSnsMessage
 * @param {{fetchImpl?: Function, now?: number}} [options] - `fetchImpl` defaults to global fetch
 * @returns {Promise<boolean>}
 * @sideeffect May fetch the signing certificate (see signingKey).
 */
async function verifySnsMessage(message, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const algorithm =
    message.SignatureVersion === '1' ? 'sha1' : message.SignatureVersion === '2' ? 'sha256' : null;
  if (!algorithm) return false;
  const url = signingCertUrl(message.SigningCertURL);
  if (!url) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(message.Signature) || message.Signature.length > 2048) {
    return false;
  }
  const key = await signingKey(url, { fetchImpl, now });
  if (!key) return false;
  try {
    return crypto.verify(
      algorithm,
      Buffer.from(snsStringToSign(message), 'utf8'),
      key,
      Buffer.from(message.Signature, 'base64')
    );
  } catch {
    return false;
  }
}

/**
 * Confirms a verified subscription by visiting its SubscribeURL (GET), only
 * when the URL is an SNS URL for `topicArn`.
 *
 * @param {Record<string, string>} message - Verified SubscriptionConfirmation
 * @param {string} topicArn - Configured topic
 * @param {{fetchImpl?: Function}} [options]
 * @returns {Promise<boolean>} true when SNS answered 200
 * @sideeffect One HTTPS GET to the SNS host (confirms the subscription).
 */
async function confirmSubscription(message, topicArn, { fetchImpl = globalThis.fetch } = {}) {
  const url = subscribeUrl(message.SubscribeURL, topicArn);
  if (!url) return false;
  try {
    const response = await fetchImpl(url.href, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(CONFIRM_TIMEOUT_MS),
    });
    await response?.body?.cancel?.().catch?.(() => {});
    return response?.status === 200;
  } catch {
    return false;
  }
}

/** Empties the certificate cache (tests). */
function clearCertificateCache() {
  certCache.clear();
}

module.exports = {
  SNS_HOST,
  clearCertificateCache,
  confirmSubscription,
  parseSnsMessage,
  signingCertUrl,
  snsStringToSign,
  subscribeUrl,
  verifySnsMessage,
};
