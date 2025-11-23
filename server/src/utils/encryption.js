'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Get encryption key from environment or generate one
 */
function getEncryptionKey() {
  const envKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY || process.env.APP_KEYS;
  
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  
  console.warn('[magic-mail] ⚠️  No MAGIC_MAIL_ENCRYPTION_KEY found. Using fallback.');
  return crypto.createHash('sha256').update('magic-mail-default-key').digest();
}

/**
 * Encrypt credentials
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
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[magic-mail] Encryption failed:', err);
    throw new Error('Failed to encrypt credentials');
  }
}

/**
 * Decrypt credentials
 */
function decryptCredentials(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    
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
    console.error('[magic-mail] Decryption failed:', err);
    return null;
  }
}

module.exports = {
  encryptCredentials,
  decryptCredentials,
};

