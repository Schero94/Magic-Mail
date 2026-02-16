'use strict';

/**
 * Accounts Controller
 * Manages email accounts CRUD operations
 */

module.exports = {
  /**
   * Get all email accounts
   */
  async getAll(ctx) {
    try {
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const accounts = await accountManager.getAllAccounts();

      ctx.body = {
        data: accounts,
        meta: { count: accounts.length },
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting accounts:', err);
      ctx.throw(500, 'Error fetching email accounts');
    }
  },

  /**
   * Create new email account
   */
  async create(ctx) {
    try {
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      const accountData = ctx.request.body;

      // Check if provider is allowed by license
      const providerAllowed = await licenseGuard.isProviderAllowed(accountData.provider);
      if (!providerAllowed) {
        ctx.throw(403, `Provider "${accountData.provider}" requires a Premium license or higher. Please upgrade your license.`);
        return;
      }

      // Check account limit using Document Service count()
      const currentAccounts = await strapi.documents('plugin::magic-mail.email-account').count();
      const maxAccounts = await licenseGuard.getMaxAccounts();
      
      if (maxAccounts !== -1 && currentAccounts >= maxAccounts) {
        ctx.throw(403, `Account limit reached (${maxAccounts}). Upgrade your license to add more accounts.`);
        return;
      }

      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const account = await accountManager.createAccount(accountData);

      ctx.body = {
        data: account,
        message: 'Email account created successfully',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error creating account:', err);
      ctx.throw(err.status || 500, err.message || 'Error creating email account');
    }
  },

  /**
   * Get single account with decrypted config (for editing)
   */
  async getOne(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const account = await accountManager.getAccountWithDecryptedConfig(accountId);

      if (!account) {
        return ctx.notFound('Email account not found');
      }

      ctx.body = {
        data: account,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting account:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error fetching email account');
    }
  },

  /**
   * Update email account
   */
  async update(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const account = await accountManager.updateAccount(accountId, ctx.request.body);

      if (!account) {
        return ctx.notFound('Email account not found');
      }

      ctx.body = {
        data: account,
        message: 'Email account updated successfully',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error updating account:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error updating email account');
    }
  },

  /**
   * Test email account with validation
   */
  async test(ctx) {
    try {
      const { accountId } = ctx.params;
      const { testEmail, to, priority, type, unsubscribeUrl } = ctx.request.body;
      const recipientEmail = testEmail || to;
      
      if (!recipientEmail) {
        return ctx.badRequest('testEmail is required');
      }
      
      const testOptions = {
        priority: priority || 'normal',
        type: type || 'transactional',
        unsubscribeUrl: unsubscribeUrl || null,
      };
      
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const result = await accountManager.testAccount(accountId, recipientEmail, testOptions);

      ctx.body = result;
    } catch (err) {
      strapi.log.error('[magic-mail] Error testing account:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error testing email account');
    }
  },

  /**
   * Test Strapi Email Service Integration
   * Tests if MagicMail intercepts native Strapi email service
   */
  async testStrapiService(ctx) {
    try {
      const { testEmail, accountName } = ctx.request.body;

      if (!testEmail) {
        ctx.throw(400, 'testEmail is required');
      }

      strapi.log.info('[magic-mail] [TEST] Testing Strapi Email Service integration...');
      strapi.log.info('[magic-mail] [EMAIL] Calling strapi.plugin("email").service("email").send()');
      if (accountName) {
        strapi.log.info(`[magic-mail] [FORCE] Forcing specific account: ${accountName}`);
      }

      // Call native Strapi email service - should be intercepted by MagicMail!
      const result = await strapi.plugin('email').service('email').send({
        to: testEmail,
        from: 'test@magicmail.com',
        subject: 'MagicMail Integration Test',
        text: 'This email was sent using Strapi\'s native email service but routed through MagicMail!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0EA5E9;">MagicMail Integration Test</h1>
            <p style="font-size: 16px; color: #374151;">
              This email was sent using <strong>Strapi's native email service</strong> 
              but <strong>routed through MagicMail's smart routing</strong>!
            </p>
            <div style="background: #F0F9FF; border-left: 4px solid #0EA5E9; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0369A1;">Integration Working</h3>
              <p style="margin: 0;">
                MagicMail successfully intercepted the email and applied:
              </p>
              <ul style="margin: 10px 0;">
                <li>Smart routing rules</li>
                <li>Account selection (${accountName ? 'Forced: ' + accountName : 'Primary or by routing rules'})</li>
                <li>Rate limiting</li>
                <li>Email logging</li>
                <li>Statistics tracking</li>
              </ul>
            </div>
            <div style="background: #DCFCE7; border: 1px solid #22C55E; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #15803D;">Security Features Active</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>TLS/SSL Encryption enforced</li>
                <li>Email content validated</li>
                <li>Proper headers included</li>
                <li>Message-ID generated</li>
              </ul>
            </div>
            <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
              Sent at: ${new Date().toLocaleString()}<br>
              Via: MagicMail Email Router
            </p>
          </div>
        `,
        type: 'transactional',
        accountName: accountName || null, // Force specific account if provided
      });

      strapi.log.info('[magic-mail] [SUCCESS] Strapi Email Service test completed');

      ctx.body = {
        success: true,
        message: 'Email sent via Strapi Email Service (intercepted by MagicMail)',
        result,
        info: {
          method: 'strapi.plugin("email").service("email").send()',
          intercepted: true,
          routedThrough: 'MagicMail',
        },
      };
    } catch (err) {
      strapi.log.error('[magic-mail] [ERROR] Strapi Email Service test failed:', err);
      ctx.body = {
        success: false,
        message: 'Failed to send test email',
        error: err.message,
      };
      ctx.status = 500;
    }
  },

  /**
   * Delete email account
   */
  async delete(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      await accountManager.deleteAccount(accountId);

      ctx.body = {
        message: 'Email account deleted successfully',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error deleting account:', err);
      ctx.throw(500, 'Error deleting email account');
    }
  },
};

