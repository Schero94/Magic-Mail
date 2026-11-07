'use strict';

const crypto = require('crypto');

/**
 * Signature checks for provider delivery webhooks.
 *
 * SendGrid Signed Event Webhook: ECDSA (P-256) over SHA-256 of
 * `timestamp + rawBody`; the signature header is base64 of an ASN.1 DER
 * (r, s) pair; the verification key is shown base64 (SPKI DER) in the
 * SendGrid UI. Source: twilio.com/docs/sendgrid/for-developers/tracking-events/
 * getting-started-event-webhook-security-features and the official
 * sendgrid-nodejs eventwebhook helper.
 *
 * Mailgun: hex HMAC-SHA256 of `timestamp + token` keyed with the webhook
 * signing key; tokens must not be reused. Source:
 * documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks
 */

/** Accepted clock skew / delivery delay for signed timestamps (seconds). */
const MAX_WEBHOOK_AGE_SECONDS = 60 * 60;

/**
 * @param {unknown} timestamp - Unix seconds as string or number
 * @param {number} [nowMs]
 * @returns {boolean} true when inside the accepted window
 */
function isFreshTimestamp(timestamp, nowMs = Date.now()) {
  const text = String(timestamp ?? '');
  if (!/^\d{9,11}$/.test(text)) return false;
  const ageSeconds = Math.abs(nowMs / 1000 - Number(text));
  return ageSeconds <= MAX_WEBHOOK_AGE_SECONDS;
}

/**
 * Builds a KeyObject from the SendGrid verification key (base64 SPKI DER or a
 * PEM block). Returns null for anything that is not an EC public key.
 *
 * @param {unknown} key
 * @returns {crypto.KeyObject|null}
 */
function toSendGridPublicKey(key) {
  if (typeof key !== 'string' || !key.trim()) return null;
  const text = key.trim();
  try {
    const keyObject = text.includes('BEGIN PUBLIC KEY')
      ? crypto.createPublicKey(text)
      : crypto.createPublicKey({
          key: Buffer.from(text.replace(/\s+/g, ''), 'base64'),
          format: 'der',
          type: 'spki',
        });
    return keyObject.asymmetricKeyType === 'ec' ? keyObject : null;
  } catch {
    return null;
  }
}

/**
 * @param {{publicKey: unknown, rawBody: Buffer, signature: unknown, timestamp: unknown, nowMs?: number}} input
 * @returns {boolean}
 */
function verifySendGridSignature({ publicKey, rawBody, signature, timestamp, nowMs }) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !signature) return false;
  if (!isFreshTimestamp(timestamp, nowMs)) return false;
  const key = toSendGridPublicKey(publicKey);
  if (!key) return false;
  try {
    return crypto.verify(
      'sha256',
      Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBody]),
      { key, dsaEncoding: 'der' },
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

/**
 * @param {{signingKey: unknown, timestamp: unknown, token: unknown, signature: unknown, nowMs?: number}} input
 * @returns {boolean}
 */
function verifyMailgunSignature({ signingKey, timestamp, token, signature, nowMs }) {
  if (typeof signingKey !== 'string' || !signingKey) return false;
  if (typeof token !== 'string' || !/^[A-Za-z0-9]{10,200}$/.test(token)) return false;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (!isFreshTimestamp(timestamp, nowMs)) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

module.exports = {
  MAX_WEBHOOK_AGE_SECONDS,
  isFreshTimestamp,
  toSendGridPublicKey,
  verifySendGridSignature,
  verifyMailgunSignature,
};
