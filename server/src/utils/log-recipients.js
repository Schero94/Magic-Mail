'use strict';

/**
 * Recipient binding of email logs (MM-SA-04).
 *
 * An email log keeps its first address in `recipient` and every `to` address
 * in `metadata.recipients`. CC and BCC addresses are not stored in clear text;
 * the log keeps a keyed hash of every to/cc/bcc address in
 * `metadata.recipientHashes` instead. Bounce processing uses it to check that
 * an address named in a delivery report really was a recipient of the mail
 * the report refers to, so a forged report can not put arbitrary addresses on
 * the suppression list.
 */

const { purposeHmac } = require('./encryption');

/** Hashes stored per log (to + cc + bcc are each capped at 100 by the router). */
const MAX_RECIPIENT_HASHES = 300;
const HASH_PURPOSE = 'email-log-recipient';

/** @param {unknown} address @returns {string} lower-cased, trimmed address */
const normalizeAddress = (address) =>
  String(address || '')
    .trim()
    .toLowerCase();

/**
 * Keyed hash of one recipient address (HKDF purpose key of the plugin key).
 *
 * @param {string} address
 * @returns {string|null} hex digest, or null when no key is available
 */
function recipientHash(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  try {
    return purposeHmac(HASH_PURPOSE, normalized);
  } catch {
    return null;
  }
}

/**
 * Hashes for `metadata.recipientHashes` (unique, bounded).
 *
 * @param {unknown} addresses - bare addresses of to, cc and bcc
 * @returns {string[]}
 */
function recipientHashes(addresses) {
  if (!Array.isArray(addresses)) return [];
  const out = new Set();
  for (const address of addresses) {
    if (out.size >= MAX_RECIPIENT_HASHES) break;
    if (typeof address !== 'string') continue;
    const hash = recipientHash(address);
    if (hash) out.add(hash);
  }
  return [...out];
}

/**
 * Extracts the bare address of a stored `metadata.recipients` entry
 * ("user@example.com" or "Name <user@example.com>").
 *
 * @param {unknown} entry
 * @returns {string}
 */
function bareAddress(entry) {
  const text = normalizeAddress(entry);
  const open = text.lastIndexOf('<');
  const close = text.lastIndexOf('>');
  return open !== -1 && close > open ? text.slice(open + 1, close).trim() : text;
}

/**
 * True when `address` was a recipient (to, cc or bcc) of the logged mail.
 *
 * @param {{recipient?: string, metadata?: object}|null} log
 * @param {string} address
 * @returns {boolean}
 */
function isLogRecipient(log, address) {
  const normalized = normalizeAddress(address);
  if (!log || !normalized) return false;
  if (normalizeAddress(log.recipient) === normalized) return true;
  const metadata = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
  if (
    Array.isArray(metadata.recipients) &&
    metadata.recipients.some((entry) => bareAddress(entry) === normalized)
  ) {
    return true;
  }
  if (Array.isArray(metadata.recipientHashes) && metadata.recipientHashes.length > 0) {
    const hash = recipientHash(normalized);
    return Boolean(hash) && metadata.recipientHashes.includes(hash);
  }
  return false;
}

module.exports = { recipientHash, recipientHashes, isLogRecipient, MAX_RECIPIENT_HASHES };
