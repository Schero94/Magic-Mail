'use strict';

/**
 * Account output DTOs.
 *
 * Email-account rows hold two private JSON columns: `config` (encrypted
 * provider credentials) and `oauth` (encrypted OAuth tokens). Neither
 * ciphertext must ever reach an API response. Spreading the raw Document
 * Service record leaked both, so every controller response goes through one of
 * these DTOs which allowlist non-secret fields only.
 */

const SAFE_FIELDS = [
  'id',
  'documentId',
  'name',
  'description',
  'provider',
  'fromEmail',
  'fromName',
  'replyTo',
  'isActive',
  'isPrimary',
  'priority',
  'dailyLimit',
  'hourlyLimit',
  'emailsSentToday',
  'emailsSentThisHour',
  'totalEmailsSent',
  'lastUsed',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'locale',
];

/**
 * Picks the allowlisted, non-secret account fields.
 *
 * @param {object} account - Raw email-account record
 * @returns {object} Safe field subset
 */
function pickSafeAccountFields(account) {
  const dto = {};
  if (!account || typeof account !== 'object') return dto;
  for (const field of SAFE_FIELDS) {
    if (account[field] !== undefined) dto[field] = account[field];
  }
  return dto;
}

/**
 * Account shape for list responses. Exposes whether credentials exist but
 * never the credentials themselves.
 *
 * @param {object} account
 * @returns {object}
 */
function toAccountListDTO(account) {
  return {
    ...pickSafeAccountFields(account),
    hasCredentials: !!(account && account.config),
    hasOAuth: !!(account && account.oauth),
  };
}

/**
 * Account shape for the edit form. Includes the masked (never plaintext, never
 * ciphertext) config produced by the account manager plus a
 * `credentialsUnreadable` flag, but never the raw `config`/`oauth` blobs.
 *
 * @param {object} account - Raw record
 * @param {object} maskedConfig - Masked secret map (e.g. `{ pass: '****1a2b' }`)
 * @param {object} [extra] - Extra flags such as `credentialsUnreadable`
 * @returns {object}
 */
function toAccountEditDTO(account, maskedConfig, extra = {}) {
  return {
    ...pickSafeAccountFields(account),
    config: maskedConfig && typeof maskedConfig === 'object' ? maskedConfig : {},
    hasOAuth: !!(account && account.oauth),
    ...extra,
  };
}

module.exports = {
  pickSafeAccountFields,
  toAccountListDTO,
  toAccountEditDTO,
  SAFE_FIELDS,
};
