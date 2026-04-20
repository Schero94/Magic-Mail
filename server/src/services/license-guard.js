/**
 * License Guard Service for MagicMail
 * Handles license creation, verification, and ping tracking.
 *
 * All outbound HTTP calls go through `fetchWithTimeout` which adds a
 * hard timeout via AbortController plus one automatic retry, so a
 * cold-starting license server does not crash the call. Without this
 * guard users saw spurious "This operation was aborted" warnings on
 * boot whenever the upstream needed a few seconds to wake up.
 */

const crypto = require('crypto');
const os = require('os');
const pluginPkg = require('../../../package.json');
const { createLogger } = require('../utils/logger');

// FIXED LICENSE SERVER URL
const LICENSE_SERVER_URL = 'https://magicapi.fitlex.me';

// 12s default tolerates a cold-start on the license server (serverless
// containers need 5–10s for the first TLS handshake). Configurable via
// MAGIC_LICENSE_TIMEOUT_MS for unusually fast or slow networks.
const envTimeout = Number(process.env.MAGIC_LICENSE_TIMEOUT_MS);
const DEFAULT_FETCH_TIMEOUT_MS = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 12000;
const FETCH_RETRIES = 1;
const FETCH_RETRY_BACKOFF_MS = 750;

/**
 * Wraps `fetch` with a hard timeout via AbortController and one retry
 * so a cold-start on the license server does not crash the call. Each
 * attempt uses a fresh AbortController (a shared one would cancel the
 * retry before it could connect).
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, FETCH_RETRY_BACKOFF_MS));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

module.exports = ({ strapi }) => {
  const log = createLogger(strapi);
  
  return {
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
      const response = await fetchWithTimeout(`${licenseServerUrl}/api/licenses/create`, {
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
        log.info('[SUCCESS] License created:', data.data.licenseKey);
        return data.data;
      } else {
        log.error('[ERROR] License creation failed:', data);
        return null;
      }
    } catch (error) {
      log.error('[ERROR] Error creating license:', error);
      return null;
    }
  },

  async verifyLicense(licenseKey, allowGracePeriod = false) {
    try {
      const licenseServerUrl = this.getLicenseServerUrl();
      // Timeout + retry handled by fetchWithTimeout.
      const response = await fetchWithTimeout(`${licenseServerUrl}/api/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          pluginName: 'magic-mail',
          productName: 'MagicMail - Email Business Suite',
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        return { valid: true, data: data.data, gracePeriod: false };
      }
      return { valid: false, data: null };
    } catch (error) {
      if (allowGracePeriod) {
        // fetchWithTimeout already retried once — logging as info here
        // because grace-period is a graceful fallback, not a defect.
        log.info(
          `License server unreachable after retry, continuing on grace period (${error.message})`
        );
        return { valid: true, data: null, gracePeriod: true };
      }
      log.error('[ERROR] License verification error:', error.message);
      return { valid: false, data: null };
    }
  },

  async getLicenseByKey(licenseKey) {
    try {
      const licenseServerUrl = this.getLicenseServerUrl();
      const url = `${licenseServerUrl}/api/licenses/key/${licenseKey}`;

      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.success && data.data) {
        return data.data;
      }
      
      return null;
    } catch (error) {
      log.error('Error fetching license by key:', error);
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
      const response = await fetchWithTimeout(`${licenseServerUrl}/api/licenses/ping`, {
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
    log.info(`[SUCCESS] License key stored: ${licenseKey.substring(0, 8)}...`);
  },

  startPinging(licenseKey, intervalMinutes = 15) {
    // Immediate ping
    this.pingLicense(licenseKey);
    
    const interval = setInterval(async () => {
      try {
        await this.pingLicense(licenseKey);
      } catch (error) {
        console.error('Ping error:', error);
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
      log.error(`[ERROR] Error loading license:`, error);
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
      log.info('[INIT] Initializing License Guard...');

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

      log.info('──────────────────────────────────────────────────────────');
      log.info(`📦 Plugin Store Check:`);
      if (licenseKey) {
        const maskedKey = licenseKey.substring(0, 8) + '...' + licenseKey.substring(licenseKey.length - 4);
        log.info(`   [SUCCESS] License Key found: ${maskedKey}`);
        if (lastValidated) {
          const lastValidatedDate = new Date(lastValidated);
          const hoursAgo = Math.floor((now.getTime() - lastValidatedDate.getTime()) / (1000 * 60 * 60));
          log.info(`   [TIME] Last validated: ${hoursAgo}h ago (Grace: ${withinGracePeriod ? 'ACTIVE' : 'EXPIRED'})`);
        } else {
          log.info(`   [TIME] Last validated: Never (Grace: ACTIVE for first ${gracePeriodHours}h)`);
        }
      } else {
        log.info(`   [ERROR] No license key stored`);
      }
      log.info('──────────────────────────────────────────────────────────');
      
      if (!licenseKey) {
        log.info('[DEMO] No license found - Running in demo mode');
        log.info('[INFO] Create a license in the admin panel to activate full features');
        return {
          valid: false,
          demo: true,
          data: null,
        };
      }

      log.info('[VERIFY] Verifying stored license key...');
      
      // Verify license (allow grace period if we have a last validation)
      const verification = await this.verifyLicense(licenseKey, withinGracePeriod);

      if (verification.valid) {
        // Get license details for display
        const license = await this.getLicenseByKey(licenseKey);
        
        log.info(`[SUCCESS] License verified online: ACTIVE (Key: ${licenseKey.substring(0, 10)}...)`);
        
        // Update last validated timestamp
        await pluginStore.set({ 
          key: 'lastValidated', 
          value: now.toISOString() 
        });

        log.info('[SUCCESS] License is valid and active');
        
        // Start automatic pinging
        const pingInterval = this.startPinging(licenseKey, 15);
        log.info('[PING] Started pinging license every 15 minutes');
        
        // Store interval globally so we can clean it up
        strapi.licenseGuardMagicMail = {
          licenseKey,
          pingInterval,
          data: verification.data,
        };

        // Display license info box
        log.info('╔════════════════════════════════════════════════════════════════╗');
        log.info('║  [SUCCESS] MAGIC MAIL PLUGIN LICENSE ACTIVE                           ║');
        log.info('║                                                                ║');
        log.info(`║  License: ${licenseKey.padEnd(38, ' ')}║`);
        log.info(`║  User: ${(license?.firstName + ' ' + license?.lastName).padEnd(41, ' ')}║`);
        log.info(`║  Email: ${(license?.email || 'N/A').padEnd(40, ' ')}║`);
        log.info('║                                                                ║');
        log.info('║  [AUTO] Pinging every 15 minutes                               ║');
        log.info('╚════════════════════════════════════════════════════════════════╝');

        return {
          valid: true,
          demo: false,
          data: verification.data,
          gracePeriod: verification.gracePeriod || false,
        };
      } else {
        log.error(`[ERROR] License validation failed (Key: ${licenseKey.substring(0, 10)}...)`);
        log.info('──────────────────────────────────────────────────────────');
        log.info('[WARNING]  Running in demo mode with limited features');
        return {
          valid: false,
          demo: true,
          error: 'Invalid or expired license',
          data: null,
        };
      }
    } catch (error) {
      log.error('[ERROR] Error initializing License Guard:', error);
      return {
        valid: false,
        demo: true,
        error: error.message,
        data: null,
      };
    }
  },
};
};

