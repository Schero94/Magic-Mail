'use strict';

const { validate, handleControllerError } = require('../validation');

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
      const data = validate('pluginSettings.update', ctx.request.body);
      
      const settings = await strapi
        .plugin('magic-mail')
        .service('plugin-settings')
        .updateSettings(data);
      
      ctx.body = {
        data: settings,
        message: 'Settings updated successfully',
      };
    } catch (error) {
      // Map Zod/Strapi ValidationError to 400 with details instead of a
      // generic 500.
      handleControllerError(ctx, error, '[magic-mail] [SETTINGS] Error updating settings', 'Failed to update settings');
    }
  },
});
