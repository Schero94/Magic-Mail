'use strict';

/**
 * Main Controller
 * Handles email sending requests
 */

module.exports = {
  /**
   * Send email via MagicMail router
   */
  async send(ctx) {
    try {
      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.send(ctx.request.body);

      ctx.body = {
        success: true,
        ...result,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error sending email:', err);
      ctx.throw(500, err.message || 'Failed to send email');
    }
  },
};
