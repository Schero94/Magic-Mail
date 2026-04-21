'use strict';

const { validate, handleControllerError } = require('../validation');

/**
 * Strips file-path attachments from API requests.
 *
 * Internal service calls can still use `attachment.path` because they
 * originate from trusted code that has already vetted the path. Public
 * Content-API callers must never be able to make the server read from
 * arbitrary disk locations (would be a direct LFI → file exfiltration).
 */
function stripAttachmentPaths(body) {
  if (body && Array.isArray(body.attachments)) {
    body.attachments = body.attachments.map(({ path, ...safe }) => safe);
  }
  return body;
}

/**
 * Main Controller
 * Handles email and WhatsApp sending requests.
 *
 * Every public endpoint validates its payload with Zod BEFORE any service
 * call. Attachments are bounded both in count (20) and per-entry size
 * (25 MB) to protect against OOM from large base64 payloads.
 */

module.exports = {
  async send(ctx) {
    try {
      const raw = stripAttachmentPaths({ ...ctx.request.body });
      const body = validate('content.send', raw);

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.send(body);

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error sending email', 'Failed to send email');
    }
  },

  async sendMessage(ctx) {
    try {
      const raw = stripAttachmentPaths({ ...ctx.request.body });
      const body = validate('content.sendMessage', raw);

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.sendMessage(body);

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error sending message', 'Failed to send message');
    }
  },

  async sendWhatsApp(ctx) {
    try {
      const body = validate('content.sendWhatsApp', ctx.request.body);

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.sendWhatsApp(body);

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error sending WhatsApp', 'Failed to send WhatsApp message');
    }
  },

  async getWhatsAppStatus(ctx) {
    try {
      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const status = emailRouter.getWhatsAppStatus();

      ctx.body = { success: true, data: status };
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

  async checkWhatsAppNumber(ctx) {
    try {
      const { phoneNumber } = validate('content.phoneParam', ctx.params);

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.checkWhatsAppNumber(phoneNumber);

      ctx.body = { success: true, data: result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error checking WhatsApp number', 'Failed to check phone number');
    }
  },
};
