'use strict';

/**
 * Plugin Settings Controller
 * Handles API endpoints for MagicMail plugin settings
 */
module.exports = ({ strapi }) => ({
  /**
   * GET /magic-mail/settings
   * Get current plugin settings
   */
  async getSettings(ctx) {
    try {
      const settings = await strapi
        .plugin('magic-mail')
        .service('plugin-settings')
        .getSettings();
      
      ctx.body = {
        data: settings,
      };
    } catch (error) {
      strapi.log.error('[magic-mail] [SETTINGS] Error getting settings:', error);
      ctx.throw(500, 'Failed to get settings');
    }
  },

  /**
   * PUT /magic-mail/settings
   * Update plugin settings
   */
  async updateSettings(ctx) {
    try {
      const { body } = ctx.request;
      
      // Validate input
      const allowedFields = [
        'enableLinkTracking',
        'enableOpenTracking',
        'trackingBaseUrl',
        'defaultFromName',
        'defaultFromEmail',
        'unsubscribeUrl',
        'enableUnsubscribeHeader',
      ];
      
      const data = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          data[field] = body[field];
        }
      }
      
      const settings = await strapi
        .plugin('magic-mail')
        .service('plugin-settings')
        .updateSettings(data);
      
      ctx.body = {
        data: settings,
        message: 'Settings updated successfully',
      };
    } catch (error) {
      strapi.log.error('[magic-mail] [SETTINGS] Error updating settings:', error);
      ctx.throw(500, 'Failed to update settings');
    }
  },
});
