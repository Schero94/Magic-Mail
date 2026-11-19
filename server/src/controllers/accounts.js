'use strict';

const { errors } = require('@strapi/utils');
const { validate, handleControllerError } = require('../validation');
const { toAccountListDTO } = require('../utils/account-dto');
const { toClientSendMessage, describeErrorForLog } = require('../utils/client-errors');

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
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error getting accounts',
        'Error fetching email accounts'
      );
    }
  },

  /**
   * Create new email account
   */
  async create(ctx) {
    try {
      const accountData = validate('accounts.create', ctx.request.body);

      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const account = await accountManager.createAccount(accountData);

      ctx.body = {
        data: toAccountListDTO(account),
        message: 'Email account created successfully',
      };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error creating account',
        'Error creating email account'
      );
    }
  },

  /**
   * Get single account for the edit form. Secrets are replaced with a
   * constant placeholder; the response never contains a secret or a part
   * of one.
   */
  async getOne(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      // Use the graceful variant here — if credentials cannot be
      // decrypted (typical when MAGIC_MAIL_ENCRYPTION_KEY has changed
      // since the account was saved) we still surface the account row
      // with a `credentialsUnreadable: true` flag so the UI can render
      // a "re-enter credentials" state instead of crashing with 500.
      const account = await accountManager.getAccountForDisplay(accountId);

      if (!account) {
        return ctx.notFound('Email account not found');
      }

      ctx.body = {
        data: account,
      };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error getting account',
        'Error fetching email account'
      );
    }
  },

  /**
   * Update email account
   */
  async update(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const data = validate('accounts.update', ctx.request.body);

      const account = await accountManager.updateAccount(accountId, data);

      if (!account) {
        return ctx.notFound('Email account not found');
      }

      ctx.body = {
        data: toAccountListDTO(account),
        message: 'Email account updated successfully',
      };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error updating account',
        'Error updating email account'
      );
    }
  },

  /**
   * Validates a test-send request and delegates delivery to the selected account.
   *
   * @param {import('koa').Context} ctx - Admin request context
   * @returns {Promise<void>}
   */
  async test(ctx) {
    try {
      const { accountId } = ctx.params;
      const { testEmail, to, cc, priority, type, unsubscribeUrl } = validate(
        'accounts.test',
        ctx.request.body
      );
      const recipientEmail = testEmail || to;

      const testOptions = {
        priority: priority || 'normal',
        type: type || 'transactional',
        unsubscribeUrl: unsubscribeUrl || null,
        cc: cc || undefined,
      };

      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const result = await accountManager.testAccount(accountId, recipientEmail, testOptions);

      ctx.body = result;
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error testing account',
        'Error testing email account'
      );
    }
  },

  /**
   * Shows or rotates the Brevo webhook token (needed once, when the webhook
   * is set up in Brevo). Only an admin signed in to the browser may do this;
   * admin API tokens are refused.
   *
   * @route POST /magic-mail/accounts/:accountId/webhook-token
   * @auth admin session only (strategy `admin`); permission plugin::magic-mail.manage
   * @param {import('koa').Context} ctx - body `{ action: 'reveal'|'rotate' }`
   * @returns {Promise<void>} 200 `{ data: { token, rotated } }`; 400 other
   *   provider or invalid body; 403 admin API token; 404 unknown account
   * @sideeffect rotate stores a new token; every call writes an audit log line.
   */
  async webhookToken(ctx) {
    try {
      if (ctx.state?.auth?.strategy?.name !== 'admin') {
        throw new errors.ForbiddenError('Sign in to the admin panel to view webhook tokens');
      }
      const { action } = validate('accounts.webhookToken', ctx.request.body || {});
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const result = await accountManager.webhookToken(
        ctx.params.accountId,
        action,
        ctx.state.user
      );
      ctx.set('Cache-Control', 'no-store');
      ctx.body = { data: { token: result.token, rotated: result.rotated } };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error reading the webhook token',
        'Error reading the webhook token'
      );
    }
  },

  /**
   * Read-only connection check of a saved Brevo or Amazon SES account: the
   * stored credentials are used for one read request (Brevo account, SES
   * account details); no email is sent.
   *
   * @route POST /magic-mail/accounts/:accountId/check
   * @auth admin session or admin API token; permission plugin::magic-mail.test-send
   * @param {import('koa').Context} ctx - Admin request context
   * @returns {Promise<void>} 200 `{ ok: true, details }` or
   *   `{ ok: false, code, hintCode?, hint? }`; 404 unknown account; 400 for
   *   providers without a connection check
   * @sideeffect One read-only HTTPS request to the provider.
   */
  async check(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      ctx.body = await accountManager.checkConnection(accountId);
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error checking account',
        'Error checking email account'
      );
    }
  },

  /**
   * Sends a test through Strapi's native email service to verify Magic-Mail interception.
   *
   * @param {import('koa').Context} ctx - Admin request context
   * @returns {Promise<void>}
   */
  async testStrapiService(ctx) {
    try {
      const { testEmail, accountName, cc } = validate(
        'accounts.testStrapiService',
        ctx.request.body
      );

      strapi.log.info('[magic-mail] [TEST] Testing Strapi Email Service integration...');
      strapi.log.info(
        '[magic-mail] [EMAIL] Calling strapi.plugin("email").service("email").send()'
      );
      if (accountName) {
        strapi.log.info(`[magic-mail] [FORCE] Forcing specific account: ${accountName}`);
      }

      // Call native Strapi email service - should be intercepted by MagicMail!
      // Do NOT pass a hardcoded `from` — the router picks the account's own
      // fromEmail, and supplying a non-existent sender domain would hurt
      // deliverability / spam reputation.
      await strapi
        .plugin('email')
        .service('email')
        .send({
          to: testEmail,
          cc: cc || undefined,
          subject: 'MagicMail Integration Test',
          text: "This email was sent using Strapi's native email service but routed through MagicMail!",
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
        info: {
          method: 'strapi.plugin("email").service("email").send()',
          intercepted: true,
          routedThrough: 'MagicMail',
        },
      };
    } catch (err) {
      if (err?.name === 'ValidationError' && err?.code !== 'MAGIC_MAIL_VALIDATION') {
        // Request validation (validate()) - let Strapi render the 400.
        handleControllerError(
          ctx,
          err,
          '[magic-mail] Strapi Email Service test rejected',
          'Failed to send test email'
        );
        return;
      }
      // Never return the raw transport error (internal hosts, SMTP replies).
      strapi.log.error(
        `[magic-mail] [ERROR] Strapi Email Service test failed: ${describeErrorForLog(err)}`
      );
      ctx.status = 502;
      ctx.body = {
        success: false,
        message: 'Failed to send test email',
        error: toClientSendMessage(err),
      };
    }
  },

  /**
   * Delete email account
   */
  async delete(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager = strapi.plugin('magic-mail').service('account-manager');
      const result = await accountManager.deleteAccount(accountId);

      ctx.body = {
        message: 'Email account deleted successfully',
        // Routing rules that targeted the account were deactivated and
        // fallback references cleared; the UI can report the counts.
        data: result || { deactivatedRules: 0, clearedFallbacks: 0 },
      };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error deleting account',
        'Error deleting email account'
      );
    }
  },
};
