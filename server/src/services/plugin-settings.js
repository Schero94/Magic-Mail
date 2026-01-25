'use strict';

const SETTINGS_UID = 'plugin::magic-mail.plugin-settings';

/**
 * Plugin Settings Service
 * Manages global settings for MagicMail plugin
 */
module.exports = ({ strapi }) => ({
  /**
   * Get plugin settings (creates default if not exists)
   * @returns {Promise<Object>} Plugin settings
   */
  async getSettings() {
    try {
      // Try to find existing settings
      let settings = await strapi.documents(SETTINGS_UID).findFirst({});
      
      // Create default settings if none exist
      if (!settings) {
        settings = await strapi.documents(SETTINGS_UID).create({
          data: {
            enableLinkTracking: true,
            enableOpenTracking: true,
            trackingBaseUrl: null,
            defaultFromName: null,
            defaultFromEmail: null,
            unsubscribeUrl: null,
            enableUnsubscribeHeader: true,
          },
        });
        strapi.log.info('[magic-mail] [SETTINGS] Created default plugin settings');
      }
      
      return settings;
    } catch (error) {
      strapi.log.error('[magic-mail] [SETTINGS] Error getting settings:', error);
      // Return default values on error
      return {
        enableLinkTracking: true,
        enableOpenTracking: true,
        trackingBaseUrl: null,
        defaultFromName: null,
        defaultFromEmail: null,
        unsubscribeUrl: null,
        enableUnsubscribeHeader: true,
      };
    }
  },

  /**
   * Update plugin settings
   * @param {Object} data - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateSettings(data) {
    try {
      // Sanitize data - convert empty strings to null for optional fields
      const sanitizedData = {
        ...data,
        trackingBaseUrl: data.trackingBaseUrl?.trim() || null,
        defaultFromName: data.defaultFromName?.trim() || null,
        defaultFromEmail: data.defaultFromEmail?.trim() || null,
        unsubscribeUrl: data.unsubscribeUrl?.trim() || null,
      };
      
      // Get existing settings
      let settings = await strapi.documents(SETTINGS_UID).findFirst({});
      
      if (settings) {
        // Update existing settings
        settings = await strapi.documents(SETTINGS_UID).update({
          documentId: settings.documentId,
          data: sanitizedData,
        });
        strapi.log.info('[magic-mail] [SETTINGS] Updated plugin settings');
      } else {
        // Create new settings
        settings = await strapi.documents(SETTINGS_UID).create({
          data: {
            enableLinkTracking: sanitizedData.enableLinkTracking ?? true,
            enableOpenTracking: sanitizedData.enableOpenTracking ?? true,
            trackingBaseUrl: sanitizedData.trackingBaseUrl,
            defaultFromName: sanitizedData.defaultFromName,
            defaultFromEmail: sanitizedData.defaultFromEmail,
            unsubscribeUrl: sanitizedData.unsubscribeUrl,
            enableUnsubscribeHeader: sanitizedData.enableUnsubscribeHeader ?? true,
          },
        });
        strapi.log.info('[magic-mail] [SETTINGS] Created plugin settings');
      }
      
      return settings;
    } catch (error) {
      strapi.log.error('[magic-mail] [SETTINGS] Error updating settings:', error);
      throw error;
    }
  },

  /**
   * Check if link tracking is enabled
   * @returns {Promise<boolean>}
   */
  async isLinkTrackingEnabled() {
    const settings = await this.getSettings();
    return settings.enableLinkTracking !== false;
  },

  /**
   * Check if open tracking is enabled
   * @returns {Promise<boolean>}
   */
  async isOpenTrackingEnabled() {
    const settings = await this.getSettings();
    return settings.enableOpenTracking !== false;
  },

  /**
   * Get tracking base URL
   * @returns {Promise<string|null>}
   */
  async getTrackingBaseUrl() {
    const settings = await this.getSettings();
    return settings.trackingBaseUrl || null;
  },
});
