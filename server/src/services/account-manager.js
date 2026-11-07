'use strict';

const { errors } = require('@strapi/utils');
const { encryptCredentials, decryptCredentials } = require('../utils/encryption');
const { toAccountListDTO, toAccountEditDTO } = require('../utils/account-dto');
const { toClientSendMessage, describeErrorForLog } = require('../utils/client-errors');
const { MAILGUN_REGIONS, resolveMailgunRegion } = require('../utils/mailgun-region');

/**
 * Constant placeholder returned instead of every stored secret. It carries no
 * information about the secret (SUP-06); sending it back unchanged keeps the
 * stored value, as long as the account's endpoint/identity did not change.
 */
const SECRET_MASK = '********';

/**
 * Config fields that decide WHERE a stored secret is sent or WHO it belongs
 * to. Changing one of them while keeping a stored secret would let a manage
 * admin redirect the SMTP password / API key / client secret to another
 * server (SEC-04), so the secret must then be re-entered.
 */
const IDENTITY_FIELDS = ['host', 'port', 'user', 'clientId', 'tenantId', 'domain', 'allowInsecure'];

const ROUTING_RULE_UID = 'plugin::magic-mail.routing-rule';

/**
 * Rejects an unsupported Mailgun `config.region`. Only "us" and "eu" are
 * accepted; an omitted region keeps the US endpoint (accounts saved before
 * regions existed).
 *
 * @param {string} provider - effective provider of the account
 * @param {object|undefined|null} config - incoming plain config
 * @throws {errors.ValidationError}
 */
const assertMailgunRegion = (provider, config) => {
  if (provider !== 'mailgun' || !config || !('region' in config)) return;
  if (resolveMailgunRegion(config.region)) return;
  throw new errors.ValidationError(`Mailgun region must be one of: ${MAILGUN_REGIONS.join(', ')}`, {
    config: [`region: must be one of ${MAILGUN_REGIONS.join(', ')}`],
  });
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Account Manager Service
 * Manages email accounts (create, update, test, delete)
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
      description,
      provider,
      config,
      fromEmail,
      fromName,
      replyTo,
      isPrimary = false,
      // Honour the caller's active flag instead of forcing every account
      // active — an explicitly disabled account must not be selectable.
      isActive = true,
      priority = 1,
      dailyLimit = 0,
      hourlyLimit = 0,
    } = accountData;

    strapi.log.info(`[magic-mail] Creating account: ${name} (${provider})`);

    assertMailgunRegion(provider, config);

    // Encrypt sensitive config data
    const encryptedConfig = config ? encryptCredentials(config) : null;

    // If this is primary, unset other primaries
    if (isPrimary) {
      await this.unsetAllPrimary();
    }

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).create({
      data: {
        name,
        description: description ?? null,
        provider,
        config: encryptedConfig,
        fromEmail,
        fromName,
        replyTo: replyTo || null,
        isPrimary,
        priority,
        dailyLimit,
        hourlyLimit,
        isActive,
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
      throw new errors.NotFoundError('Email account not found');
    }

    const existingAccount = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId,
    });

    if (!existingAccount) {
      throw new errors.NotFoundError('Email account not found');
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

    const previousName = existingAccount.name;
    const providerChanged = provider !== undefined && provider !== existingAccount.provider;
    if (providerChanged && !config) {
      throw new errors.ValidationError(
        'Changing the provider requires a complete provider configuration',
        {
          config: ['Required when the provider changes'],
        }
      );
    }

    assertMailgunRegion(provider ?? existingAccount.provider, config);

    let encryptedConfig = existingAccount.config;
    if (config) {
      // A key change since the account was saved makes the stored secrets
      // unreadable; every secret must then be entered again (a mask has no
      // source to merge against and is rejected below).
      let existingPlain = {};
      let unreadable = false;
      if (existingAccount.config) {
        try {
          existingPlain = decryptCredentials(existingAccount.config) || {};
        } catch (err) {
          unreadable = true;
          strapi.log.warn(
            `[magic-mail] updateAccount: stored credentials of account ${existingAccount.documentId} could not be decrypted (${describeErrorForLog(err)}); all secrets must be re-entered.`
          );
        }
      }
      const merged = this._mergeConfig(existingPlain, config, { providerChanged, unreadable });
      encryptedConfig = encryptCredentials(merged);
    }

    // If this is being set to primary, unset other primaries
    if (isPrimary && !existingAccount.isPrimary) {
      await this.unsetAllPrimary();
    }

    const data = {
      name,
      // '' clears the optional text fields (the form sends '' for "remove").
      description: description === '' ? null : description,
      provider,
      config: encryptedConfig,
      fromEmail,
      fromName: fromName === '' ? null : fromName,
      replyTo: replyTo === '' ? null : replyTo,
      isActive,
      isPrimary,
      priority,
      dailyLimit,
      hourlyLimit,
    };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }

    const updatedAccount = await strapi.documents(EMAIL_ACCOUNT_UID).update({ documentId, data });

    // Keep routing rules pointing at the renamed account (UI-M04).
    if (typeof name === 'string' && name !== previousName) {
      await this._renameRuleReferences(previousName, name);
    }

    strapi.log.info(`[magic-mail] [SUCCESS] Email account updated: ${documentId}`);

    return updatedAccount;
  },

  /**
   * Sends a local account test message through the shared router.
   *
   * @param {string|number} idOrDocumentId - Account identifier
   * @param {string} testEmail - Primary test recipient
   * @param {{priority?: string, type?: string, unsubscribeUrl?: string|null, cc?: string|string[]}} testOptions - Test headers and delivery options
   * @returns {Promise<{success: boolean, message: string, testConfig?: object}>}
   */
  async testAccount(idOrDocumentId, testEmail, testOptions = {}) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new errors.NotFoundError('Email account not found');
    }

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId,
    });

    if (!account) {
      throw new errors.NotFoundError('Email account not found');
    }

    // Use provided test email or default to account's own email
    const recipient = testEmail || account.fromEmail;

    const emailRouter = strapi.plugin('magic-mail').service('email-router');

    // Extract test options
    const { priority = 'normal', type = 'transactional', unsubscribeUrl = null, cc } = testOptions;

    try {
      await emailRouter.send(
        {
          to: recipient,
          cc: cc || undefined,
          subject: 'MagicMail Test Email',
          text: `This is a test email from MagicMail account: ${account.name}\n\nPriority: ${priority}\nType: ${type}\n\nProvider: ${account.provider}\nFrom: ${account.fromEmail}\n\nIf you receive this, your email account is configured correctly!`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0EA5E9;">MagicMail Test Email</h2>
            <p>This is a test email from account: <strong>${escapeHtml(account.name)}</strong></p>

            <div style="background: #F0F9FF; border: 1px solid #0EA5E9; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0369A1;">Test Configuration</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li><strong>Priority:</strong> ${escapeHtml(priority)}</li>
                <li><strong>Type:</strong> ${escapeHtml(type)}</li>
                <li><strong>Provider:</strong> ${escapeHtml(account.provider)}</li>
                <li><strong>From:</strong> ${escapeHtml(account.fromEmail)}</li>
                ${unsubscribeUrl ? `<li><strong>Unsubscribe URL:</strong> ${escapeHtml(unsubscribeUrl)}</li>` : ''}
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

            ${unsubscribeUrl ? `<p style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB;"><a href="${escapeHtml(unsubscribeUrl)}" style="color: #6B7280; font-size: 12px;">Unsubscribe</a></p>` : ''}
          </div>
        `,
          priority,
          type,
          unsubscribeUrl,
        },
        {
          // Test exactly this account (also before activation); never fail
          // over to another account and report that as a successful test.
          accountDocumentId: account.documentId,
          allowInactive: true,
          source: 'account-test',
        }
      );

      return {
        success: true,
        message: `Test email sent successfully to ${recipient}`,
        testConfig: { priority, type, unsubscribeUrl: !!unsubscribeUrl },
      };
    } catch (error) {
      // Never echo raw transport errors (internal hosts, ports, SMTP
      // responses with addresses) to the client.
      strapi.log.warn(`[magic-mail] Account test failed: ${describeErrorForLog(error)}`);
      return { success: false, message: toClientSendMessage(error) };
    }
  },

  /**
   * Get all accounts
   */
  async getAllAccounts() {
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      sort: [{ priority: 'desc' }],
    });

    // Never expose the encrypted `config`/`oauth` blobs in list responses.
    return accounts.map((account) => toAccountListDTO(account));
  },

  /**
   * Returns an account record in a shape suitable for the edit-form UI.
   *
   * Secrets are replaced with the constant SECRET_MASK; non-secret fields
   * (host, port, user, clientId, tenantId, domain) are returned in clear.
   * A decrypt failure (usually a changed MAGIC_MAIL_ENCRYPTION_KEY) gives
   * `config: {}` and `credentialsUnreadable: true` with a fixed reason code;
   * the crypto error itself stays in the server log (SUP-M02).
   *
   * The email router never uses this helper: it must fail on unreadable
   * credentials instead of sending with an empty config.
   *
   * @param {string|number} idOrDocumentId
   * @returns {Promise<object>}
   */
  async getAccountForDisplay(idOrDocumentId) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new errors.NotFoundError('Email account not found');
    }

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId,
    });

    if (!account) {
      throw new errors.NotFoundError('Email account not found');
    }

    let maskedConfig = {};
    let credentialsUnreadable = false;

    if (account.config) {
      try {
        const decryptedConfig = decryptCredentials(account.config);
        maskedConfig = this._maskSecrets(decryptedConfig || {});
      } catch (err) {
        credentialsUnreadable = true;
        strapi.log.warn(
          `[magic-mail] Credentials of account ${account.documentId} could not be decrypted (${describeErrorForLog(err)}). ` +
            'The encryption key likely changed since the account was saved; the admin must re-enter the secrets.'
        );
      }
    }

    return toAccountEditDTO(account, maskedConfig, {
      credentialsUnreadable,
      ...(credentialsUnreadable ? { credentialsUnreadableReason: 'KEY_MISMATCH' } : {}),
    });
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

  /** The constant secret placeholder (see SECRET_MASK). */
  SECRET_MASK,

  /**
   * @param {string} key
   * @returns {boolean} true for a secret config key
   */
  _isSecretKey(key) {
    const lower = String(key).toLowerCase();
    return this._SECRET_FIELDS.some((f) => f.toLowerCase() === lower);
  },

  /**
   * Returns a copy of `config` where every stored secret is replaced with
   * SECRET_MASK. Nested objects such as `dkim` are masked field by field.
   *
   * @param {object} config
   * @returns {object}
   */
  _maskSecrets(config) {
    const out = { ...config };
    for (const key of Object.keys(out)) {
      if (!this._isSecretKey(key) || !out[key]) continue;
      if (typeof out[key] === 'object') {
        const nested = {};
        for (const [nestedKey, value] of Object.entries(out[key])) {
          nested[nestedKey] = value ? SECRET_MASK : value;
        }
        out[key] = nested;
      } else {
        out[key] = SECRET_MASK;
      }
    }
    return out;
  },

  /**
   * True when `value` is the unchanged placeholder.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  _isMask(value) {
    return value === SECRET_MASK;
  },

  /**
   * Fields whose change means stored secrets must be re-entered.
   *
   * @param {object} existingPlain
   * @param {object} incoming
   * @returns {string[]} names of changed identity fields
   */
  _changedIdentityFields(existingPlain, incoming) {
    const norm = (key, value) => {
      if (value === undefined || value === null || value === '') return '';
      if (key === 'allowInsecure') return value === true || value === 'true' ? 'true' : '';
      const text = String(value).trim();
      return key === 'host' || key === 'domain' ? text.toLowerCase() : text;
    };
    return IDENTITY_FIELDS.filter(
      (key) => key in incoming && norm(key, incoming[key]) !== norm(key, existingPlain[key])
    );
  },

  /**
   * Builds the config to store on update.
   *
   * - Non-secret fields from `incoming` win; omitted ones are kept (unless
   *   the provider changed, then nothing old is kept).
   * - A secret sent as SECRET_MASK (or omitted) keeps the stored value ONLY
   *   while provider and identity fields (IDENTITY_FIELDS) are unchanged and
   *   the stored config was readable. Otherwise the request is rejected with
   *   a ValidationError naming the secrets to re-enter (SEC-04).
   *
   * @param {object} existingPlain - Decrypted stored config ({} if none/unreadable)
   * @param {object} incoming - Config from the PUT request
   * @param {{providerChanged?: boolean, unreadable?: boolean}} [options]
   * @returns {object} Config ready for encryptCredentials()
   * @throws {errors.ValidationError}
   */
  _mergeConfig(existingPlain, incoming, { providerChanged = false, unreadable = false } = {}) {
    const stored = providerChanged || unreadable ? {} : existingPlain || {};
    const identityChanged =
      providerChanged || this._changedIdentityFields(existingPlain || {}, incoming).length > 0;
    const keepSecrets = !identityChanged && !unreadable;
    const missing = [];

    const out = { ...stored };
    for (const [key, value] of Object.entries(incoming)) {
      if (!this._isSecretKey(key)) {
        out[key] = value;
        continue;
      }
      if (value && typeof value === 'object') {
        const previous = stored[key] && typeof stored[key] === 'object' ? stored[key] : {};
        const nested = {};
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (this._isMask(nestedValue)) {
            if (keepSecrets && previous[nestedKey]) nested[nestedKey] = previous[nestedKey];
            else missing.push(`${key}.${nestedKey}`);
          } else {
            nested[nestedKey] = nestedValue;
          }
        }
        out[key] = nested;
      } else if (this._isMask(value)) {
        if (keepSecrets && stored[key]) out[key] = stored[key];
        else missing.push(key);
      } else {
        out[key] = value;
      }
    }

    // An omitted stored secret would silently follow the new host/user.
    if (identityChanged && !providerChanged) {
      for (const [key, value] of Object.entries(existingPlain || {})) {
        if (this._isSecretKey(key) && value && !(key in incoming)) {
          missing.push(key);
          delete out[key];
        }
      }
    }

    if (missing.length > 0) {
      const reason = unreadable
        ? 'The stored secret can not be decrypted; enter it again'
        : 'Enter the secret again: the provider, server or account identity changed';
      const details = { config: missing.map((field) => `${field}: ${reason}`) };
      throw new errors.ValidationError(
        `Re-enter the stored secret(s): ${missing.join(', ')}`,
        details
      );
    }

    return out;
  },

  /**
   * Updates routing rules after an account rename.
   *
   * @param {string} oldName
   * @param {string} newName
   * @returns {Promise<number>} number of updated rules
   */
  async _renameRuleReferences(oldName, newName) {
    const rules = await this._rulesReferencing(oldName);
    const wanted = String(oldName || '').toLowerCase();
    let updated = 0;
    for (const rule of rules) {
      const data = {};
      if (String(rule.accountName || '').toLowerCase() === wanted) data.accountName = newName;
      if (String(rule.fallbackAccountName || '').toLowerCase() === wanted)
        data.fallbackAccountName = newName;
      if (Object.keys(data).length === 0) continue;
      await strapi.documents(ROUTING_RULE_UID).update({ documentId: rule.documentId, data });
      updated += 1;
    }
    if (updated > 0)
      strapi.log.info(`[magic-mail] Updated ${updated} routing rule(s) after an account rename`);
    return updated;
  },

  /**
   * Routing rules whose target or fallback is `accountName` (case-insensitive).
   *
   * @param {string} accountName
   * @returns {Promise<object[]>}
   */
  async _rulesReferencing(accountName) {
    if (!accountName) return [];
    return strapi.documents(ROUTING_RULE_UID).findMany({
      filters: {
        $or: [
          { accountName: { $eqi: accountName } },
          { fallbackAccountName: { $eqi: accountName } },
        ],
      },
    });
  },

  /**
   * Deletes an account. Routing rules that target it are deactivated (so
   * they show up as broken instead of silently routing to the primary
   * account) and fallback references to it are cleared (UI-M04).
   *
   * @param {string|number} idOrDocumentId
   * @returns {Promise<{deactivatedRules: number, clearedFallbacks: number}>}
   */
  async deleteAccount(idOrDocumentId) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new errors.NotFoundError('Email account not found');
    }

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({ documentId });
    if (!account) {
      throw new errors.NotFoundError('Email account not found');
    }

    await strapi.documents(EMAIL_ACCOUNT_UID).delete({ documentId });

    let deactivatedRules = 0;
    let clearedFallbacks = 0;
    const wanted = String(account.name || '').toLowerCase();
    for (const rule of await this._rulesReferencing(account.name)) {
      const data = {};
      if (String(rule.accountName || '').toLowerCase() === wanted && rule.isActive !== false) {
        data.isActive = false;
        deactivatedRules += 1;
      }
      if (String(rule.fallbackAccountName || '').toLowerCase() === wanted) {
        data.fallbackAccountName = null;
        clearedFallbacks += 1;
      }
      if (Object.keys(data).length > 0) {
        await strapi.documents(ROUTING_RULE_UID).update({ documentId: rule.documentId, data });
      }
    }

    strapi.log.info(`[magic-mail] Account deleted: ${documentId}`);
    return { deactivatedRules, clearedFallbacks };
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
});
