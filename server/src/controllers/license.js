/**
 * License Controller for MagicMail Plugin
 * Manages licenses directly from the Admin Panel
 */

module.exports = ({ strapi }) => ({
  /**
   * Auto-create license with logged-in admin user data
   */
  async autoCreate(ctx) {
    try {
      // Get the logged-in admin user
      const adminUser = ctx.state.user;
      
      if (!adminUser) {
        return ctx.unauthorized('No admin user logged in');
      }

      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      
      // Use admin user data for license creation
      const license = await licenseGuard.createLicense({ 
        email: adminUser.email,
        firstName: adminUser.firstname || 'Admin',
        lastName: adminUser.lastname || 'User',
      });

      if (!license) {
        return ctx.badRequest('Failed to create license');
      }

      // Store the license key
      await licenseGuard.storeLicenseKey(license.licenseKey);

      // Start pinging
      const pingInterval = licenseGuard.startPinging(license.licenseKey, 15);

      // Update global license guard
      strapi.licenseGuardMagicMail = {
        licenseKey: license.licenseKey,
        pingInterval,
        data: license,
      };

      return ctx.send({
        success: true,
        message: 'License automatically created and activated',
        data: license,
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error auto-creating license:', error);
      return ctx.badRequest('Error creating license');
    }
  },

  /**
   * Get current license status
   */
  async getStatus(ctx) {
    try {
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      const pluginStore = strapi.store({ 
        type: 'plugin', 
        name: 'magic-mail' 
      });
      const licenseKey = await pluginStore.get({ key: 'licenseKey' });

      if (!licenseKey) {
        return ctx.send({
          success: false,
          demo: true,
          valid: false,
          message: 'No license found. Running in demo mode.',
        });
      }

      const verification = await licenseGuard.verifyLicense(licenseKey);
      const license = await licenseGuard.getLicenseByKey(licenseKey);

      return ctx.send({
        success: true,
        valid: verification.valid,
        demo: false,
        data: {
          licenseKey,
          email: license?.email || null,
          firstName: license?.firstName || null,
          lastName: license?.lastName || null,
          isActive: license?.isActive || false,
          isExpired: license?.isExpired || false,
          isOnline: license?.isOnline || false,
          expiresAt: license?.expiresAt,
          lastPingAt: license?.lastPingAt,
          deviceName: license?.deviceName,
          deviceId: license?.deviceId,
          ipAddress: license?.ipAddress,
          features: {
            premium: license?.featurePremium || false,
            advanced: license?.featureAdvanced || false,
            enterprise: license?.featureEnterprise || false,
          },
          maxDevices: license?.maxDevices || 1,
          currentDevices: license?.currentDevices || 0,
        },
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error getting license status:', error);
      return ctx.badRequest('Error getting license status');
    }
  },

  /**
   * Store and validate an existing license key
   */
  async storeKey(ctx) {
    try {
      const { licenseKey, email } = ctx.request.body;

      if (!licenseKey || !licenseKey.trim()) {
        return ctx.badRequest('License key is required');
      }

      if (!email || !email.trim()) {
        return ctx.badRequest('Email address is required');
      }

      const trimmedKey = licenseKey.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');

      // Verify the license key first
      const verification = await licenseGuard.verifyLicense(trimmedKey);

      if (!verification.valid) {
        strapi.log.warn(`[magic-mail] ⚠️  Invalid license key attempted: ${trimmedKey.substring(0, 8)}...`);
        return ctx.badRequest('Invalid or expired license key');
      }

      // Get license details to verify email
      const license = await licenseGuard.getLicenseByKey(trimmedKey);
      
      if (!license) {
        return ctx.badRequest('License not found');
      }

      // Verify email matches
      if (license.email.toLowerCase() !== trimmedEmail) {
        strapi.log.warn(`[magic-mail] ⚠️  Email mismatch for license key`);
        return ctx.badRequest('Email address does not match this license key');
      }

      // Store the license key
      await licenseGuard.storeLicenseKey(trimmedKey);

      // Start pinging
      const pingInterval = licenseGuard.startPinging(trimmedKey, 15);

      // Update global license guard
      strapi.licenseGuardMagicMail = {
        licenseKey: trimmedKey,
        pingInterval,
        data: verification.data,
      };

      strapi.log.info(`[magic-mail] ✅ License validated and stored`);

      return ctx.send({
        success: true,
        message: 'License activated successfully',
        data: verification.data,
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error storing license key:', error);
      return ctx.badRequest('Error storing license key');
    }
  },

  /**
   * Debug endpoint to check license data
   */
  async debugLicense(ctx) {
    try {
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      const license = await licenseGuard.getCurrentLicense();
      
      ctx.body = {
        success: true,
        rawLicense: license,
        detectedFlags: {
          featurePremium: license?.featurePremium,
          featureAdvanced: license?.featureAdvanced,
          featureEnterprise: license?.featureEnterprise,
        },
        detectedTier: license?.featureEnterprise ? 'enterprise' : 
                      license?.featureAdvanced ? 'advanced' : 
                      license?.featurePremium ? 'premium' : 'free',
      };
    } catch (error) {
      strapi.log.error('[magic-mail] Error in debugLicense:', error);
      ctx.throw(500, 'Error debugging license');
    }
  },

  /**
   * Get license limits and available features
   */
  async getLimits(ctx) {
    try {
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      const features = require('../config/features');
      
      const license = await licenseGuard.getCurrentLicense();
      const maxAccounts = await licenseGuard.getMaxAccounts();
      const maxRules = await licenseGuard.getMaxRoutingRules();
      const maxTemplates = await licenseGuard.getMaxEmailTemplates();
      
      // Get current counts
      const currentAccounts = await strapi.entityService.count('plugin::magic-mail.email-account');
      const currentRules = await strapi.entityService.count('plugin::magic-mail.routing-rule');
      const currentTemplates = await strapi.entityService.count('plugin::magic-mail.email-template');

      // Get tier info - check both formats
      let tier = 'free';
      if (license?.featureEnterprise === true || license?.features?.enterprise === true) tier = 'enterprise';
      else if (license?.featureAdvanced === true || license?.features?.advanced === true) tier = 'advanced';
      else if (license?.featurePremium === true || license?.features?.premium === true) tier = 'premium';

      const tierConfig = features[tier] || features.free;

      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        strapi.log.debug('[magic-mail] License tier:', tier);
      }

      ctx.body = {
        success: true,
        tier,
        limits: {
          accounts: {
            current: currentAccounts,
            max: maxAccounts,
            unlimited: maxAccounts === -1,
            canCreate: maxAccounts === -1 || currentAccounts < maxAccounts,
          },
          routingRules: {
            current: currentRules,
            max: maxRules,
            unlimited: maxRules === -1,
            canCreate: maxRules === -1 || currentRules < maxRules,
          },
          emailTemplates: {
            current: currentTemplates,
            max: maxTemplates,
            unlimited: maxTemplates === -1,
            canCreate: maxTemplates === -1 || currentTemplates < maxTemplates,
          },
        },
        allowedProviders: tierConfig.providers,
        features: tierConfig.features,
      };
    } catch (error) {
      strapi.log.error('[magic-mail] Error getting license limits:', error);
      ctx.throw(500, 'Error getting license limits');
    }
  },
});

