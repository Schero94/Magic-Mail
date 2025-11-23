/**
 * License Guard Service for MagicMail
 * Handles license creation, verification, and ping tracking
 */

const crypto = require('crypto');
const os = require('os');
const pluginPkg = require('../../../package.json');

// FIXED LICENSE SERVER URL
const LICENSE_SERVER_URL = 'https://magicapi.fitlex.me';

module.exports = ({ strapi }) => ({
  /**
   * Get license server URL
   */
  getLicenseServerUrl() {
    return LICENSE_SERVER_URL;
  },

  /**
   * Generate device ID
   */
  generateDeviceId() {
    try {
      const networkInterfaces = os.networkInterfaces();
      const macAddresses = [];
      
      Object.values(networkInterfaces).forEach(interfaces => {
        interfaces?.forEach(iface => {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddresses.push(iface.mac);
          }
        });
      });
      
      const identifier = `${macAddresses.join('-')}-${os.hostname()}`;
      return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 32);
    } catch (error) {
      return crypto.randomBytes(16).toString('hex');
    }
  },

  getDeviceName() {
    try {
      return os.hostname() || 'Unknown Device';
    } catch (error) {
      return 'Unknown Device';
    }
  },

  getIpAddress() {
    try {
      const networkInterfaces = os.networkInterfaces();
      for (const name of Object.keys(networkInterfaces)) {
        const interfaces = networkInterfaces[name];
        if (interfaces) {
          for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
              return iface.address;
            }
          }
        }
      }
      return '127.0.0.1';
    } catch (error) {
      return '127.0.0.1';
    }
  },

  getUserAgent() {
    const pluginVersion = pluginPkg.version || '1.0.0';
    const strapiVersion = strapi.config.get('info.strapi') || '5.0.0';
    return `MagicMail/${pluginVersion} Strapi/${strapiVersion} Node/${process.version} ${os.platform()}/${os.release()}`;
  },

  async createLicense({ email, firstName, lastName }) {
    try {
      const deviceId = this.generateDeviceId();
      const deviceName = this.getDeviceName();
      const ipAddress = this.getIpAddress();
      const userAgent = this.getUserAgent();

      const licenseServerUrl = this.getLicenseServerUrl();
      const response = await fetch(`${licenseServerUrl}/api/licenses/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          deviceName,
          deviceId,
          ipAddress,
          userAgent,
          pluginName: 'magic-mail',
          productName: 'MagicMail - Email Business Suite',
        }),
      });

      const data = await response.json();

      if (data.success) {
        strapi.log.info('[magic-mail] ✅ License created:', data.data.licenseKey);
        return data.data;
      } else {
        strapi.log.error('[magic-mail] ❌ License creation failed:', data);
        return null;
      }
    } catch (error) {
      strapi.log.error('[magic-mail] ❌ Error creating license:', error);
      return null;
    }
  },

  async verifyLicense(licenseKey, allowGracePeriod = false) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const licenseServerUrl = this.getLicenseServerUrl();
      const response = await fetch(`${licenseServerUrl}/api/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          licenseKey,
          pluginName: 'magic-mail',
          productName: 'MagicMail - Email Business Suite',
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const data = await response.json();

      if (data.success && data.data) {
        return { valid: true, data: data.data, gracePeriod: false };
      } else {
        return { valid: false, data: null };
      }
    } catch (error) {
      if (allowGracePeriod) {
        strapi.log.warn('[magic-mail] ⚠️ License verification timeout - grace period active');
        return { valid: true, data: null, gracePeriod: true };
      }
      strapi.log.error('[magic-mail] ❌ License verification error:', error.message);
      return { valid: false, data: null };
    }
  },

  async getLicenseByKey(licenseKey) {
    try {
      const licenseServerUrl = this.getLicenseServerUrl();
      const url = `${licenseServerUrl}/api/licenses/key/${licenseKey}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.success && data.data) {
        return data.data;
      }
      
      return null;
    } catch (error) {
      strapi.log.error('[magic-mail] Error fetching license by key:', error);
      return null;
    }
  },

  async pingLicense(licenseKey) {
    try {
      const deviceId = this.generateDeviceId();
      const deviceName = this.getDeviceName();
      const ipAddress = this.getIpAddress();
      const userAgent = this.getUserAgent();

      const licenseServerUrl = this.getLicenseServerUrl();
      const response = await fetch(`${licenseServerUrl}/api/licenses/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          deviceId,
          deviceName,
          ipAddress,
          userAgent,
          pluginName: 'magic-mail',
        }),
      });

      const data = await response.json();
      return data.success ? data.data : null;
    } catch (error) {
      // Silent fail for pings
      return null;
    }
  },

  async storeLicenseKey(licenseKey) {
    const pluginStore = strapi.store({ 
      type: 'plugin', 
      name: 'magic-mail' 
    });
    await pluginStore.set({ key: 'licenseKey', value: licenseKey });
    strapi.log.info(`[magic-mail] ✅ License key stored: ${licenseKey.substring(0, 8)}...`);
  },

  startPinging(licenseKey, intervalMinutes = 15) {
    // Immediate ping
    this.pingLicense(licenseKey);
    
    const interval = setInterval(async () => {
      try {
        await this.pingLicense(licenseKey);
      } catch (error) {
        console.error('[magic-mail] Ping error:', error);
      }
    }, intervalMinutes * 60 * 1000);

    return interval;
  },

  /**
   * Get current license data from store
   */
  async getCurrentLicense() {
    try {
      const pluginStore = strapi.store({ 
        type: 'plugin', 
        name: 'magic-mail' 
      });
      const licenseKey = await pluginStore.get({ key: 'licenseKey' });

      if (!licenseKey) {
        return null;
      }

      const license = await this.getLicenseByKey(licenseKey);
      return license;
    } catch (error) {
      strapi.log.error(`[magic-mail] ❌ Error loading license:`, error);
      return null;
    }
  },

  /**
   * Check if license has specific feature
   */
  async hasFeature(featureName) {
    const license = await this.getCurrentLicense();
    const features = require('../config/features');
    return features.hasFeature(license, featureName);
  },

  /**
   * Check if provider is allowed
   */
  async isProviderAllowed(provider) {
    const license = await this.getCurrentLicense();
    const features = require('../config/features');
    return features.isProviderAllowed(license, provider);
  },

  /**
   * Get max allowed accounts
   */
  async getMaxAccounts() {
    const license = await this.getCurrentLicense();
    const features = require('../config/features');
    return features.getMaxAccounts(license);
  },

  /**
   * Get max allowed routing rules
   */
  async getMaxRoutingRules() {
    const license = await this.getCurrentLicense();
    const features = require('../config/features');
    return features.getMaxRoutingRules(license);
  },

  /**
   * Get max allowed email templates
   */
  async getMaxEmailTemplates() {
    const license = await this.getCurrentLicense();
    const features = require('../config/features');
    return features.getMaxEmailTemplates(license);
  },

  /**
   * Initialize license guard
   * Checks for existing license and starts pinging
   */
  async initialize() {
    try {
      strapi.log.info('🔐 Initializing License Guard...');

      // Check if license key exists in plugin store
      const pluginStore = strapi.store({ 
        type: 'plugin', 
        name: 'magic-mail' 
      });
      const licenseKey = await pluginStore.get({ key: 'licenseKey' });

      // Check last validation timestamp
      const lastValidated = await pluginStore.get({ key: 'lastValidated' });
      const now = new Date();
      const gracePeriodHours = 24;
      let withinGracePeriod = false;
      
      if (lastValidated) {
        const lastValidatedDate = new Date(lastValidated);
        const hoursSinceValidation = (now.getTime() - lastValidatedDate.getTime()) / (1000 * 60 * 60);
        withinGracePeriod = hoursSinceValidation < gracePeriodHours;
      }

      strapi.log.info('──────────────────────────────────────────────────────────');
      strapi.log.info(`📦 Plugin Store Check:`);
      if (licenseKey) {
        strapi.log.info(`   ✅ License Key found: ${licenseKey}`);
        strapi.log.info(`   🔑 Key (short): ${licenseKey.substring(0, 10)}...`);
        if (lastValidated) {
          const lastValidatedDate = new Date(lastValidated);
          const hoursAgo = Math.floor((now.getTime() - lastValidatedDate.getTime()) / (1000 * 60 * 60));
          strapi.log.info(`   🕐 Last validated: ${hoursAgo}h ago (Grace: ${withinGracePeriod ? 'ACTIVE' : 'EXPIRED'})`);
        } else {
          strapi.log.info(`   🕐 Last validated: Never (Grace: ACTIVE for first ${gracePeriodHours}h)`);
        }
      } else {
        strapi.log.info(`   ❌ No license key stored`);
      }
      strapi.log.info('──────────────────────────────────────────────────────────');
      
      if (!licenseKey) {
        strapi.log.info('📄 No license found - Running in demo mode');
        strapi.log.info('💡 Create a license in the admin panel to activate full features');
        return {
          valid: false,
          demo: true,
          data: null,
        };
      }

      strapi.log.info('📄 Verifying stored license key...');
      
      // Verify license (allow grace period if we have a last validation)
      const verification = await this.verifyLicense(licenseKey, withinGracePeriod);

      if (verification.valid) {
        // Get license details for display
        const license = await this.getLicenseByKey(licenseKey);
        
        strapi.log.info(`✅ License verified online: ACTIVE (Key: ${licenseKey.substring(0, 10)}...)`);
        
        // Update last validated timestamp
        await pluginStore.set({ 
          key: 'lastValidated', 
          value: now.toISOString() 
        });

        strapi.log.info('✅ License is valid and active');
        
        // Start automatic pinging
        const pingInterval = this.startPinging(licenseKey, 15);
        strapi.log.info('📡 Started pinging license every 15 minutes');
        
        // Store interval globally so we can clean it up
        strapi.licenseGuardMagicMail = {
          licenseKey,
          pingInterval,
          data: verification.data,
        };

        // Display license info box
        strapi.log.info('╔════════════════════════════════════════════════════════════════╗');
        strapi.log.info('║  ✅ MAGIC MAIL PLUGIN LICENSE ACTIVE                           ║');
        strapi.log.info('║                                                                ║');
        strapi.log.info(`║  License: ${licenseKey.padEnd(38, ' ')}║`);
        strapi.log.info(`║  User: ${(license?.firstName + ' ' + license?.lastName).padEnd(41, ' ')}║`);
        strapi.log.info(`║  Email: ${(license?.email || 'N/A').padEnd(40, ' ')}║`);
        strapi.log.info('║                                                                ║');
        strapi.log.info('║  🔄 Auto-pinging every 15 minutes                              ║');
        strapi.log.info('╚════════════════════════════════════════════════════════════════╝');

        return {
          valid: true,
          demo: false,
          data: verification.data,
          gracePeriod: verification.gracePeriod || false,
        };
      } else {
        strapi.log.error(`❌ License validation failed (Key: ${licenseKey.substring(0, 10)}...)`);
        strapi.log.info('──────────────────────────────────────────────────────────');
        strapi.log.info('⚠️  Running in demo mode with limited features');
        return {
          valid: false,
          demo: true,
          error: 'Invalid or expired license',
          data: null,
        };
      }
    } catch (error) {
      strapi.log.error('❌ Error initializing License Guard:', error);
      return {
        valid: false,
        demo: true,
        error: error.message,
        data: null,
      };
    }
  },
});

