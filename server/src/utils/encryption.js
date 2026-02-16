'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Get encryption key from environment or generate one
 */
function getEncryptionKey() {
  const envKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY || process.env.APP_KEYS;
  
  if (!envKey) {
    throw new Error(
      '[magic-mail] FATAL: No encryption key configured. ' +
      'Set MAGIC_MAIL_ENCRYPTION_KEY or APP_KEYS in your environment variables. ' +
      'Email account credentials cannot be stored securely without a proper key.'
    );
  }
  
  return crypto.createHash('sha256').update(envKey).digest();
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
 * Decrypt credentials with backwards compatibility
 * Handles both old format (plain string) and new format (object with .encrypted)
 * @param {string|object} encryptedData - The encrypted data (string or object)
 * @returns {object|null} The decrypted credentials object, or null if failed
 */
function decryptCredentials(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const key = getEncryptionKey();
    
    // Handle both formats: new object format { encrypted: "..." } and old string format
    const encryptedString = typeof encryptedData === 'object' && encryptedData.encrypted 
      ? encryptedData.encrypted 
      : encryptedData;
    
    const parts = encryptedString.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    if (typeof strapi !== 'undefined' && strapi.log) {
      strapi.log.error('[magic-mail] Decryption failed:', err.message);
    }
    return null;
  }
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
};

