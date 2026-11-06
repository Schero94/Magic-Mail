'use strict';

const crypto = require('crypto');

/**
 * Credential encryption for email-account `config` and `oauth` blobs.
 *
 * Format (4.0+): `v1:<iv 12 bytes hex>:<tag 16 bytes hex>:<ciphertext hex>`,
 * AES-256-GCM with a purpose-bound subkey derived by HKDF-SHA256 from the key
 * material (`info = magic-mail:credentials:v1`). The key material is never
 * used directly, so the same secret can not be confused with other purposes
 * (OAuth state signing derives its own subkey).
 *
 * Legacy format (pre-4.0): `<iv 16 bytes hex>:<tag hex>:<ciphertext hex>` with
 * `sha256(keyMaterial)` as key. It is still decrypted; the next save of the
 * account re-encrypts it in the v1 format.
 *
 * Rotation: set the new key in MAGIC_MAIL_ENCRYPTION_KEY and the old one in
 * MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS (decrypt-only). Saving an account (or
 * an OAuth token refresh) re-encrypts it with the new key.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const LEGACY_IV_LENGTH = 16;
const VERSION_PREFIX = 'v1';
const HKDF_SALT = 'strapi-plugin-magic-mail';
const CREDENTIALS_INFO = 'magic-mail:credentials:v1';

/** NODE_ENV values in which a key derived from Strapi's own secrets may be used. */
const DEV_ENVIRONMENTS = new Set(['', 'development', 'test']);

let warnedMissingKey = false;

/** @returns {string} NODE_ENV in lower case, '' when unset */
const currentEnv = () => String(process.env.NODE_ENV || '').trim().toLowerCase();

/**
 * Validates an explicitly configured key.
 *
 * @param {string} value
 * @param {string} name - Env var name for the error message
 * @returns {string}
 */
function assertKeyLength(value, name) {
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`[magic-mail] ${name} must contain at least 32 bytes`);
  }
  return value;
}

/**
 * Returns the current key material.
 *
 * MAGIC_MAIL_ENCRYPTION_KEY is mandatory outside development/test. Only
 * there (NODE_ENV unset, `development` or `test`) a key derived from
 * ADMIN_JWT_SECRET/APP_KEYS is used, with a one-time warning. A staging
 * server with any other NODE_ENV fails instead of silently reusing a Strapi
 * secret. There is no constant fallback.
 *
 * @returns {string}
 * @throws {Error} When no usable key material exists
 */
function getKeyMaterial() {
  const primary = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  if (primary && primary.length > 0) {
    return assertKeyLength(primary, 'MAGIC_MAIL_ENCRYPTION_KEY');
  }

  if (!DEV_ENVIRONMENTS.has(currentEnv())) {
    throw new Error(
      `[magic-mail] FATAL: MAGIC_MAIL_ENCRYPTION_KEY is required (NODE_ENV=${currentEnv()}). ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const fallback = process.env.ADMIN_JWT_SECRET
    || String(process.env.APP_KEYS || '').split(',').map((key) => key.trim()).find(Boolean);
  if (!fallback) {
    throw new Error(
      '[magic-mail] MAGIC_MAIL_ENCRYPTION_KEY is not set and no ADMIN_JWT_SECRET/APP_KEYS is available to derive a development key.'
    );
  }

  if (!warnedMissingKey) {
    warnedMissingKey = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[magic-mail] MAGIC_MAIL_ENCRYPTION_KEY not set - using a development key derived from ' +
      'ADMIN_JWT_SECRET/APP_KEYS. Set MAGIC_MAIL_ENCRYPTION_KEY before deploying.'
    );
  }
  return fallback;
}

/**
 * Previous key material for decrypt-only rotation (optional).
 *
 * @returns {string|null}
 */
function getPreviousKeyMaterial() {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS;
  if (!previous) return null;
  return assertKeyLength(previous, 'MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS');
}

/**
 * Derives a 32-byte purpose-bound subkey with HKDF-SHA256.
 *
 * @param {string} material - Key material
 * @param {string} info - Purpose label
 * @returns {Buffer}
 */
function deriveKey(material, info) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(material, 'utf8'), HKDF_SALT, info, 32));
}

/**
 * Derives a purpose-bound subkey from arbitrary key material, e.g. for the
 * OAuth state signature. `purpose` becomes part of the HKDF info string.
 *
 * @param {string} material - Key material
 * @param {string} purpose - Short label such as 'oauth-state'
 * @returns {Buffer}
 */
function derivePurposeKey(material, purpose) {
  return deriveKey(String(material), `magic-mail:${purpose}:v1`);
}

/**
 * Encrypts credentials.
 *
 * @param {object} data - The credentials object to encrypt
 * @returns {{encrypted: string}|null} JSON-column compatible object, or null for no data
 * @throws {Error} When no key is available
 */
function encryptCredentials(data) {
  if (!data) return null;

  try {
    const key = deriveKey(getKeyMaterial(), CREDENTIALS_INFO);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Object form keeps PostgreSQL JSON columns valid.
    return {
      encrypted: `${VERSION_PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`,
    };
  } catch (err) {
    throw new Error(`Failed to encrypt credentials: ${err.message}`);
  }
}

/**
 * Runs one AES-GCM decryption attempt.
 *
 * @param {Buffer} key
 * @param {Buffer} iv
 * @param {Buffer} authTag
 * @param {string} ciphertextHex
 * @returns {string} utf8 plaintext
 */
function decryptWith(key, iv, authTag, ciphertextHex) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
}

/**
 * Decrypts an encrypted credentials blob.
 *
 * SECURITY: strict. Malformed ciphertext, a corrupt tag or a wrong key
 * throws; it never returns null for bad input, so a corrupted row can not
 * push callers into an "empty config" branch.
 *
 * @param {string|{encrypted: string}|null|undefined} encryptedData
 * @returns {object|null} Decrypted object, or null if the input was empty
 * @throws {Error} When the ciphertext is malformed or no configured key decrypts it
 */
function decryptCredentials(encryptedData) {
  if (!encryptedData) return null;

  const encryptedString =
    typeof encryptedData === 'object' && encryptedData.encrypted
      ? encryptedData.encrypted
      : encryptedData;

  if (typeof encryptedString !== 'string') {
    throw new Error('[magic-mail] decrypt: expected string or {encrypted: string}');
  }

  const parts = encryptedString.split(':');
  const versioned = parts.length === 4 && parts[0] === VERSION_PREFIX;
  if (!versioned && parts.length !== 3) {
    throw new Error('[magic-mail] decrypt: malformed ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = versioned ? parts.slice(1) : parts;
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('[magic-mail] decrypt: missing ciphertext components');
  }
  const ivHexLength = (versioned ? IV_LENGTH : LEGACY_IV_LENGTH) * 2;
  if (ivHex.length !== ivHexLength || !/^[a-f0-9]+$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(authTagHex)) {
    throw new Error('[magic-mail] decrypt: invalid IV or authentication tag');
  }
  if (!/^(?:[a-f0-9]{2})+$/i.test(ciphertextHex)) {
    throw new Error('[magic-mail] decrypt: ciphertext is not valid hex');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const materials = [getKeyMaterial(), getPreviousKeyMaterial()].filter(Boolean);
  let plaintext = null;
  for (const material of materials) {
    const key = versioned
      ? deriveKey(material, CREDENTIALS_INFO)
      : crypto.createHash('sha256').update(material).digest();
    try {
      plaintext = decryptWith(key, iv, authTag, ciphertextHex);
      break;
    } catch {
      // try the next key
    }
  }
  if (plaintext === null) {
    throw new Error('[magic-mail] decrypt: credentials could not be decrypted with the configured key');
  }

  try {
    return JSON.parse(plaintext);
  } catch {
    throw new Error('[magic-mail] decrypt: decrypted payload is not valid JSON');
  }
}

/**
 * True when a stored blob uses the pre-4.0 format.
 *
 * @param {string|{encrypted: string}|null|undefined} encryptedData
 * @returns {boolean}
 */
function isLegacyCiphertext(encryptedData) {
  const value = encryptedData && typeof encryptedData === 'object' ? encryptedData.encrypted : encryptedData;
  return typeof value === 'string' && !value.startsWith(`${VERSION_PREFIX}:`);
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
  derivePurposeKey,
  isLegacyCiphertext,
};
