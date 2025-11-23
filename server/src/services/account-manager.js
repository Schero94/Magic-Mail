'use strict';

const { encryptCredentials, decryptCredentials } = require('../utils/encryption');

/**
 * Account Manager Service
 * Manages email accounts (create, update, test, delete)
 */

module.exports = ({ strapi }) => ({
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

    console.log('create account', accountData);

    // Encrypt sensitive config data
    const encryptedConfig = encryptCredentials(config);

    // If this is primary, unset other primaries
    if (isPrimary) {
      await this.unsetAllPrimary();
    }

    const account = await strapi.entityService.create('plugin::magic-mail.email-account', {
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

    strapi.log.info(`[magic-mail] ✅ Email account created: ${name}`);

    return account;
  },

  /**
   * Update email account
   */
  async updateAccount(accountId, accountData) {
    const existingAccount = await strapi.entityService.findOne('plugin::magic-mail.email-account', accountId);
    
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

    // Encrypt sensitive config data
    const encryptedConfig = encryptCredentials(config);

    // If this is being set to primary, unset other primaries
    if (isPrimary && !existingAccount.isPrimary) {
      await this.unsetAllPrimary();
    }

    const updatedAccount = await strapi.entityService.update('plugin::magic-mail.email-account', accountId, {
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

    strapi.log.info(`[magic-mail] ✅ Email account updated: ${name} (Active: ${isActive})`);

    return updatedAccount;
  },

  /**
   * Test email account
   */
  async testAccount(accountId, testEmail, testOptions = {}) {
    const account = await strapi.entityService.findOne('plugin::magic-mail.email-account', accountId);

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
    const accounts = await strapi.entityService.findMany('plugin::magic-mail.email-account', {
      sort: { priority: 'desc' },
    });

    // Don't return encrypted config in list
    return accounts.map(account => ({
      ...account,
      config: account.config ? '***encrypted***' : null,
    }));
  },

  /**
   * Get single account with decrypted config (for editing)
   */
  async getAccountWithDecryptedConfig(accountId) {
    const account = await strapi.entityService.findOne('plugin::magic-mail.email-account', accountId);
    
    if (!account) {
      throw new Error('Account not found');
    }

    // Decrypt the config for editing
    const decryptedConfig = account.config ? decryptCredentials(account.config) : {};
    
    return {
      ...account,
      config: decryptedConfig,
    };
  },

  /**
   * Delete account
   */
  async deleteAccount(accountId) {
    await strapi.entityService.delete('plugin::magic-mail.email-account', accountId);
    strapi.log.info(`[magic-mail] Account deleted: ${accountId}`);
  },

  /**
   * Unset all primary flags
   */
  async unsetAllPrimary() {
    const accounts = await strapi.entityService.findMany('plugin::magic-mail.email-account', {
      filters: { isPrimary: true },
    });

    for (const account of accounts) {
      await strapi.entityService.update('plugin::magic-mail.email-account', account.id, {
        data: { isPrimary: false },
      });
    }
  },

  /**
   * Reset daily/hourly counters (called by cron)
   */
  async resetCounters(type = 'daily') {
    const accounts = await strapi.entityService.findMany('plugin::magic-mail.email-account');

    for (const account of accounts) {
      const updateData = {};
      
      if (type === 'daily') {
        updateData.emailsSentToday = 0;
      } else if (type === 'hourly') {
        updateData.emailsSentThisHour = 0;
      }

      await strapi.entityService.update('plugin::magic-mail.email-account', account.id, {
        data: updateData,
      });
    }

    strapi.log.info(`[magic-mail] ✅ ${type} counters reset`);
  },
});

