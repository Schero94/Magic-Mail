'use strict';

/**
 * Strip file-path attachments from API requests (security: prevents arbitrary file read).
 * Internal service calls bypass the controller and can still use path-based attachments.
 */
function stripAttachmentPaths(body) {
  if (body.attachments && Array.isArray(body.attachments)) {
    body.attachments = body.attachments.map(({ path, ...safe }) => safe);
  }
  return body;
}

/**
 * Main Controller
 * Handles email and WhatsApp sending requests
 */

module.exports = {
  /**
   * Send email via MagicMail router
   */
  async send(ctx) {
    try {
      const body = stripAttachmentPaths({ ...ctx.request.body });
      if (!body || !body.to) {
        return ctx.badRequest('Recipient (to) is required');
      }

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.send(body);

      ctx.body = {
        success: true,
        ...result,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error sending email:', err.message);
      ctx.throw(err.status || 500, err.message || 'Failed to send email');
    }
  },

  /**
   * Send message via Email or WhatsApp (unified API)
   */
  async sendMessage(ctx) {
    try {
      const body = stripAttachmentPaths({ ...ctx.request.body });
      if (!body || (!body.to && !body.phoneNumber)) {
        return ctx.badRequest('Recipient (to or phoneNumber) is required');
      }

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.sendMessage(body);

      ctx.body = {
        success: true,
        ...result,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error sending message:', err.message);
      ctx.throw(err.status || 500, err.message || 'Failed to send message');
    }
  },

  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(ctx) {
    try {
      const body = stripAttachmentPaths({ ...ctx.request.body });
      if (!body || !body.phoneNumber) {
        return ctx.badRequest('Phone number is required');
      }

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.sendWhatsApp(body);

      ctx.body = {
        success: true,
        ...result,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error sending WhatsApp:', err.message);
      ctx.throw(err.status || 500, err.message || 'Failed to send WhatsApp message');
    }
  },

  /**
   * Get WhatsApp connection status
   */
  async getWhatsAppStatus(ctx) {
    try {
      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const status = emailRouter.getWhatsAppStatus();

      ctx.body = {
        success: true,
        data: status,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting WhatsApp status:', err.message);
      ctx.status = 503;
      ctx.body = {
        success: false,
        data: {
          isConnected: false,
          status: 'error',
          error: err.message,
        },
      };
    }
  },

  /**
   * Check if phone number is on WhatsApp
   */
  async checkWhatsAppNumber(ctx) {
    try {
      const { phoneNumber } = ctx.params;
      
      if (!phoneNumber) {
        return ctx.badRequest('Phone number is required');
      }

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.checkWhatsAppNumber(phoneNumber);

      ctx.body = {
        success: true,
        data: result,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error checking WhatsApp number:', err.message);
      ctx.throw(err.status || 500, err.message || 'Failed to check phone number');
    }
  },
};
