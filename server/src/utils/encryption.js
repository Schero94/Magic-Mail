'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

let warnedMissingKey = false;

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Returns the 32-byte AES-256 key used for account-credential encryption.
 *
 * In production, MAGIC_MAIL_ENCRYPTION_KEY is MANDATORY. We intentionally
 * do NOT fall back to APP_KEYS: Strapi documents APP_KEYS as rotatable,
 * and a rotation would make every previously-encrypted credential blob
 * undecryptable. The encryption key is a separate long-lived secret.
 *
 * In non-production we permit a derived fallback so local dev setups
 * keep working without requiring the env var — but we warn loudly so
 * nobody ships the derived key to production by accident.
 *
 * @returns {Buffer} 32 bytes
 * @throws {Error} In production when MAGIC_MAIL_ENCRYPTION_KEY is missing
 */
function getEncryptionKey() {
  const primary = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  if (primary && primary.length > 0) {
    return crypto.createHash('sha256').update(primary).digest();
  }

  if (isProduction()) {
    throw new Error(
      '[magic-mail] FATAL: MAGIC_MAIL_ENCRYPTION_KEY is required in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (!warnedMissingKey) {
    warnedMissingKey = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[magic-mail] MAGIC_MAIL_ENCRYPTION_KEY not set — using dev fallback derived from ' +
      'ADMIN_JWT_SECRET/APP_KEYS. Set this env var before deploying (it is NOT rotatable).'
    );
  }

  const fallback =
    process.env.ADMIN_JWT_SECRET ||
    (Array.isArray(process.env.APP_KEYS) ? process.env.APP_KEYS[0] : process.env.APP_KEYS) ||
    'magic-mail-dev-fallback-DO-NOT-USE-IN-PRODUCTION';
  return crypto.createHash('sha256').update(fallback).digest();
}

/**
 * Encrypt credentials and return as JSON-compatible object
 * @param {object} data - The credentials object to encrypt
 * @returns {object|null} Object with encrypted string, or null if no data
 */
function encryptCredentials(data) {
  if (!data) return null;
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return as object for JSON field compatibility (PostgreSQL requires valid JSON)
    return { encrypted: `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}` };
  } catch (err) {
    throw new Error(`Failed to encrypt credentials: ${err.message}`);
  }
}

/**
 * Decrypts an encrypted credentials blob.
 *
 * SECURITY: This function is strict. On malformed ciphertext, corrupt auth
 * tag, or wrong key it throws an Error. We deliberately do NOT return null
 * on failure — an attacker with DB write access could otherwise silently
 * corrupt a stored blob, force a null result, and make downstream code take
 * an unsafe `if (!config) ...` branch. Callers must handle this error and
 * fail the operation instead of continuing with partial data.
 *
 * Accepts both the new `{ encrypted: "iv:tag:ct" }` object form (for JSON
 * column compatibility) and the legacy raw "iv:tag:ct" string form.
 *
 * @param {string|{encrypted: string}|null|undefined} encryptedData
 * @returns {object|null} Decrypted credentials object, or null if input was null/empty
 * @throws {Error} When ciphertext is malformed or decryption/auth-tag fails
 */
function decryptCredentials(encryptedData) {
  if (!encryptedData) return null;

  const key = getEncryptionKey();

  const encryptedString =
    typeof encryptedData === 'object' && encryptedData.encrypted
      ? encryptedData.encrypted
      : encryptedData;

  if (typeof encryptedString !== 'string') {
    throw new Error('[magic-mail] decrypt: expected string or {encrypted: string}');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('[magic-mail] decrypt: malformed ciphertext (expected iv:tag:ct)');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('[magic-mail] decrypt: missing ciphertext components');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  try {
    return JSON.parse(decrypted);
  } catch (err) {
    throw new Error(`[magic-mail] decrypt: decrypted payload is not valid JSON: ${err.message}`);
  }
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
};

