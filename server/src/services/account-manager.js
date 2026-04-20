'use strict';

const { encryptCredentials, decryptCredentials } = require('../utils/encryption');

/**
 * Account Manager Service
 * Manages email accounts (create, update, test, delete)
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';

module.exports = ({ strapi }) => ({
  /**
   * Resolves account ID to documentId (handles both numeric id and documentId)
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   * @returns {Promise<string|null>} The documentId or null if not found
   */
  async resolveDocumentId(idOrDocumentId) {
    // If it looks like a documentId (not purely numeric), use directly
    if (idOrDocumentId && !/^\d+$/.test(String(idOrDocumentId))) {
      return String(idOrDocumentId);
    }
    
    // Otherwise, find by numeric id
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { id: Number(idOrDocumentId) },
      fields: ['documentId'],
      limit: 1,
    });
    
    return accounts.length > 0 ? accounts[0].documentId : null;
  },

  /**
   * Create new email account
   */
  async createAccount(accountData) {
    const {
      name,
      provider,
      config,
      fromEmail,
      fromName,
      replyTo,
      isPrimary = false,
      priority = 1,
      dailyLimit = 0,
      hourlyLimit = 0,
    } = accountData;

    strapi.log.info(`[magic-mail] Creating account: ${name} (${provider})`);

    // Encrypt sensitive config data
    const encryptedConfig = config ? encryptCredentials(config) : null;

    // If this is primary, unset other primaries
    if (isPrimary) {
      await this.unsetAllPrimary();
    }

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).create({
      data: {
        name,
        provider,
        config: encryptedConfig,
        fromEmail,
        fromName,
        replyTo,
        isPrimary,
        priority,
        dailyLimit,
        hourlyLimit,
        isActive: true,
        emailsSentToday: 0,
        emailsSentThisHour: 0,
        totalEmailsSent: 0,
      },
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Email account created: ${name}`);

    return account;
  },

  /**
   * Update email account
   */
  async updateAccount(idOrDocumentId, accountData) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error('Account not found');
    }
    
    const existingAccount = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId,
    });
    
    if (!existingAccount) {
      throw new Error('Account not found');
    }

    const {
      name,
      description,
      provider,
      config,
      fromEmail,
      fromName,
      replyTo,
      isActive,
      isPrimary,
      priority,
      dailyLimit,
      hourlyLimit,
    } = accountData;

    // Merge incoming config with the existing encrypted one. The edit UI
    // receives masked secrets (see getAccountWithDecryptedConfig) and MAY
    // submit them back unchanged, e.g. `****a1b2`. We detect those and
    // preserve the existing plaintext instead of persisting the mask.
    let encryptedConfig = existingAccount.config;
    if (config) {
      const existingPlain = existingAccount.config ? decryptCredentials(existingAccount.config) : {};
      const merged = this._mergeMaskedConfig(existingPlain || {}, config);
      encryptedConfig = encryptCredentials(merged);
    }

    // If this is being set to primary, unset other primaries
    if (isPrimary && !existingAccount.isPrimary) {
      await this.unsetAllPrimary();
    }

    const updatedAccount = await strapi.documents(EMAIL_ACCOUNT_UID).update({
      documentId,
      data: {
        name,
        description,
        provider,
        config: encryptedConfig,
        fromEmail,
        fromName,
        replyTo,
        isActive,
        isPrimary,
        priority,
        dailyLimit,
        hourlyLimit,
      },
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Email account updated: ${name} (Active: ${isActive})`);

    return updatedAccount;
  },

  /**
   * Test email account
   */
  async testAccount(idOrDocumentId, testEmail, testOptions = {}) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error('Account not found');
    }
    
    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId,
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Use provided test email or default to account's own email
    const recipient = testEmail || account.fromEmail;

    const emailRouter = strapi.plugin('magic-mail').service('email-router');

    // Extract test options
    const {
      priority = 'normal',
      type = 'transactional',
      unsubscribeUrl = null,
    } = testOptions;

    try {
      await emailRouter.send({
        to: recipient,
        from: account.fromEmail,
        subject: 'MagicMail Test Email',
        text: `This is a test email from MagicMail account: ${account.name}\n\nPriority: ${priority}\nType: ${type}\n\nProvider: ${account.provider}\nFrom: ${account.fromEmail}\n\nIf you receive this, your email account is configured correctly!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0EA5E9;">MagicMail Test Email</h2>
            <p>This is a test email from account: <strong>${account.name}</strong></p>
            
            <div style="background: #F0F9FF; border: 1px solid #0EA5E9; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0369A1;">Test Configuration</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li><strong>Priority:</strong> ${priority}</li>
                <li><strong>Type:</strong> ${type}</li>
                <li><strong>Provider:</strong> ${account.provider}</li>
                <li><strong>From:</strong> ${account.fromEmail}</li>
                ${unsubscribeUrl ? `<li><strong>Unsubscribe URL:</strong> ${unsubscribeUrl}</li>` : ''}
              </ul>
            </div>

            <div style="background: #DCFCE7; border: 1px solid #22C55E; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #15803D;">Security Features Active</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>TLS/SSL Encryption enforced</li>
                <li>Email content validated</li>
                <li>Proper headers included</li>
                <li>Message-ID generated</li>
                ${type === 'marketing' && unsubscribeUrl ? '<li>List-Unsubscribe header added (GDPR/CAN-SPAM)</li>' : ''}
              </ul>
            </div>

            <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
              Sent at: ${new Date().toLocaleString()}<br>
              Via: MagicMail Email Router<br>
              Version: 1.0
            </p>
            
            ${unsubscribeUrl ? `<p style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB;"><a href="${unsubscribeUrl}" style="color: #6B7280; font-size: 12px;">Unsubscribe</a></p>` : ''}
          </div>
        `,
        accountName: account.name,
        priority,
        type,
        unsubscribeUrl,
      });

      return { 
        success: true, 
        message: `Test email sent successfully to ${recipient}`,
        testConfig: { priority, type, unsubscribeUrl: !!unsubscribeUrl }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  /**
   * Get all accounts
   */
  async getAllAccounts() {
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      sort: [{ priority: 'desc' }],
    });

    // Don't return encrypted config in list
    return accounts.map(account => ({
      ...account,
      config: account.config ? '***encrypted***' : null,
    }));
  },

  /**
   * Get a single account with its config prepared for the edit UI.
   *
   * Secret fields (clientSecret, apiKey, SMTP pass, etc.) are returned in
   * a masked form like `****5bf3`. This lets the edit form render placeholders
   * indicating "a secret is stored" without ever shipping the plaintext to
   * the browser. To rotate a secret the admin supplies a new value; if they
   * leave the field as the mask, the server preserves the existing ciphertext
   * (handled in updateAccount).
   *
   * Non-secret fields (host, port, user, clientId, tenantId, domain, region…)
   * are returned in clear so the form is useful.
   *
   * @param {string|number} idOrDocumentId
   * @returns {Promise<object>}
   */
  async getAccountWithDecryptedConfig(idOrDocumentId) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error('Account not found');
    }

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId,
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const decryptedConfig = account.config ? decryptCredentials(account.config) : {};
    const maskedConfig = this._maskSecrets(decryptedConfig || {});

    return {
      ...account,
      config: maskedConfig,
    };
  },

  /**
   * Known secret field names across all supported providers. Matching is
   * case-insensitive so we also catch `ClientSecret`, `API_KEY`, etc.
   */
  _SECRET_FIELDS: [
    'clientSecret',
    'client_secret',
    'apiKey',
    'api_key',
    'pass',
    'password',
    'privateKey',
    'private_key',
    'secret',
    'dkim',
    'refreshToken',
    'refresh_token',
    'accessToken',
    'access_token',
  ],

  /**
   * Produces a short, non-reversible tag for a secret so the UI can
   * display a placeholder without the plaintext. Format: ****<last 4>.
   * Returns a generic placeholder if the value is shorter than 6 chars.
   *
   * @param {string} value
   * @returns {string}
   */
  _maskSecret(value) {
    if (typeof value !== 'string') return '****';
    const trimmed = value.trim();
    if (trimmed.length < 6) return '****';
    return `****${trimmed.slice(-4)}`;
  },

  /**
   * Returns a shallow copy of `config` where every known secret field is
   * replaced with its masked form. Handles nested `dkim` object specially.
   *
   * @param {object} config
   * @returns {object}
   */
  _maskSecrets(config) {
    const out = { ...config };
    for (const key of Object.keys(out)) {
      const lower = key.toLowerCase();
      const isSecret = this._SECRET_FIELDS.some((f) => f.toLowerCase() === lower);
      if (isSecret && out[key]) {
        if (typeof out[key] === 'string') {
          out[key] = this._maskSecret(out[key]);
        } else if (typeof out[key] === 'object') {
          // Recurse once for structures like { dkim: { privateKey } }
          out[key] = this._maskSecrets(out[key]);
        }
      }
    }
    return out;
  },

  /**
   * Detects whether a string looks like the mask produced by _maskSecret.
   * Safe against ambiguity — the mask is always `****<4 hex-ish chars>`,
   * a pattern that real secrets almost never start with.
   *
   * @param {string} value
   * @returns {boolean}
   */
  _looksMasked(value) {
    return typeof value === 'string' && /^\*{4,}/.test(value);
  },

  /**
   * Returns a merged config for updateAccount: every field from `incoming`
   * wins EXCEPT when its value is the mask placeholder (`****…`), in which
   * case the original `existingPlain` value is kept. This lets the edit
   * form round-trip without the admin re-typing every secret.
   *
   * @param {object} existingPlain - The decrypted config currently stored
   * @param {object} incoming - The config payload from the PUT request
   * @returns {object} Merged config ready for encryptCredentials()
   */
  _mergeMaskedConfig(existingPlain, incoming) {
    const out = { ...existingPlain, ...incoming };
    for (const [key, value] of Object.entries(incoming)) {
      const lower = key.toLowerCase();
      const isSecret = this._SECRET_FIELDS.some((f) => f.toLowerCase() === lower);

      if (isSecret && this._looksMasked(value)) {
        out[key] = existingPlain[key];
      } else if (isSecret && value && typeof value === 'object' && typeof existingPlain[key] === 'object') {
        // Nested structures like dkim: recurse so individual masked fields inside survive.
        out[key] = this._mergeMaskedConfig(existingPlain[key] || {}, value);
      }
    }
    return out;
  },

  /**
   * Delete account
   */
  async deleteAccount(idOrDocumentId) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error('Account not found');
    }
    
    await strapi.documents(EMAIL_ACCOUNT_UID).delete({ documentId });
    strapi.log.info(`[magic-mail] Account deleted: ${documentId}`);
  },

  /**
   * Unset all primary flags
   */
  async unsetAllPrimary() {
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { isPrimary: true },
    });

    for (const account of accounts) {
      await strapi.documents(EMAIL_ACCOUNT_UID).update({
        documentId: account.documentId,
        data: { isPrimary: false },
      });
    }
  },

  /**
   * Reset daily/hourly counters (called by cron)
   */
  async resetCounters(type = 'daily') {
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({});

    for (const account of accounts) {
      const updateData = {};
      
      if (type === 'daily') {
        updateData.emailsSentToday = 0;
      } else if (type === 'hourly') {
        updateData.emailsSentThisHour = 0;
      }

      await strapi.documents(EMAIL_ACCOUNT_UID).update({
        documentId: account.documentId,
        data: updateData,
      });
    }

    strapi.log.info(`[magic-mail] [SUCCESS] ${type} counters reset`);
  },
});
