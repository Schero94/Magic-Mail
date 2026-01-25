'use strict';

/**
 * WhatsApp Service for MagicMail
 * 
 * Provides FREE WhatsApp messaging functionality for message delivery.
 * Uses baileys for WhatsApp Web API integration.
 * 
 * Features:
 * - Session persistence (no re-scan needed after first setup)
 * - QR code generation for pairing
 * - Message sending to phone numbers
 * - Connection status monitoring
 * - Template-based messaging
 */

const path = require('path');
const fs = require('fs');

// Baileys imports (lazy loaded to avoid issues if not installed)
let baileys = null;

/**
 * Lazy load Baileys library
 * @returns {Promise<boolean>} True if Baileys is available
 */
const loadBaileys = async () => {
  if (!baileys) {
    try {
      baileys = require('baileys');
      if (process.env.DEBUG) {
        console.log('[MagicMail WhatsApp] Baileys loaded successfully');
      }
      return true;
    } catch (error) {
      console.warn('[MagicMail WhatsApp] Baileys not installed. WhatsApp features disabled.');
      console.warn('[MagicMail WhatsApp] Install with: npm install baileys pino qrcode');
      return false;
    }
  }
  return true;
};

module.exports = ({ strapi }) => {
  // WhatsApp connection state
  let sock = null;
  let qrCode = null;
  let connectionStatus = 'disconnected'; // disconnected, connecting, connected, qr_pending
  let lastError = null;
  let eventListeners = [];
  let wasConnectedBefore = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;

  /**
   * Check if WhatsApp debug logging is enabled
   * @returns {Promise<boolean>} True if debug is enabled
   */
  const isDebugEnabled = async () => {
    try {
      const pluginStore = strapi.store({ type: 'plugin', name: 'magic-mail' });
      const settings = await pluginStore.get({ key: 'settings' });
      return settings?.whatsapp_debug === true;
    } catch {
      return false;
    }
  };

  /**
   * Log debug message only if whatsapp_debug is enabled
   * @param {string} message - Message to log
   */
  const debugLog = async (message) => {
    if (await isDebugEnabled()) {
      strapi.log.info(message);
    }
  };

  /**
   * Get auth folder path for WhatsApp session
   * @returns {string} Path to auth folder
   */
  const getAuthPath = () => {
    const strapiRoot = strapi.dirs?.app?.root || process.cwd();
    return path.join(strapiRoot, '.magicmail-whatsapp-auth');
  };

  /**
   * Emit event to all registered listeners
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  const emit = (event, data) => {
    eventListeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (e) {
        console.error('[MagicMail WhatsApp] Event listener error:', e);
      }
    });
  };

  // Service object with all methods
  const service = {
    /**
     * Check if Baileys is available
     * @returns {Promise<boolean>} True if Baileys is installed
     */
    async isAvailable() {
      return await loadBaileys();
    },

    /**
     * Get current connection status
     * @returns {object} Status object with status, qrCode, lastError, isConnected
     */
    getStatus() {
      return {
        status: connectionStatus,
        qrCode: qrCode,
        lastError: lastError,
        isConnected: connectionStatus === 'connected',
      };
    },

    /**
     * Add event listener for WhatsApp events
     * @param {function} callback - Callback function(event, data)
     * @returns {function} Unsubscribe function
     */
    on(callback) {
      eventListeners.push(callback);
      return () => {
        eventListeners = eventListeners.filter(l => l !== callback);
      };
    },

    /**
     * Initialize WhatsApp connection
     * @returns {Promise<object>} Connection result with success status
     */
    async connect() {
      const available = await loadBaileys();
      if (!available) {
        lastError = 'Baileys not installed. Run: npm install baileys pino qrcode';
        strapi.log.error('[MagicMail WhatsApp] [ERROR] Baileys library not available');
        return { success: false, error: lastError };
      }

      if (sock && connectionStatus === 'connected') {
        await debugLog('[MagicMail WhatsApp] Already connected');
        return { success: true, status: 'already_connected' };
      }

      // Close existing socket if any
      if (sock) {
        try {
          sock.end();
        } catch (e) {}
        sock = null;
      }

      return new Promise(async (resolve) => {
        try {
          connectionStatus = 'connecting';
          emit('status', { status: connectionStatus });
          await debugLog('[MagicMail WhatsApp] Starting connection...');

          const authPath = getAuthPath();
          
          // Ensure auth directory exists
          if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
          }
          await debugLog(`[MagicMail WhatsApp] Auth path: ${authPath}`);

          const { state, saveCreds } = await baileys.useMultiFileAuthState(authPath);
          await debugLog('[MagicMail WhatsApp] Auth state loaded');

          // Create socket with silent logging
          const pino = require('pino');
          const logger = pino({ level: 'silent' });

          await debugLog('[MagicMail WhatsApp] Creating WhatsApp socket...');
          const makeSocket = baileys.default || baileys.makeWASocket;
          
          // Browser config - use Chrome browser fingerprint for better compatibility
          const browserConfig = baileys.Browsers.ubuntu('Chrome');
          await debugLog(`[MagicMail WhatsApp] Browser config: ${JSON.stringify(browserConfig)}`);
          
          sock = makeSocket({
            auth: state,
            logger,
            browser: browserConfig,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
              return { conversation: '' };
            },
          });
          await debugLog('[MagicMail WhatsApp] Socket created, registering event handlers...');

          let resolved = false;
          const resolveOnce = (result) => {
            if (!resolved) {
              resolved = true;
              resolve(result);
            }
          };

          // Timeout after 30 seconds
          setTimeout(() => {
            if (!resolved) {
              strapi.log.warn('[MagicMail WhatsApp] Connection timeout - no QR or connection');
              resolveOnce({ success: true, status: connectionStatus, qrCode });
            }
          }, 30000);

          // Handle connection updates
          sock.ev.on('connection.update', async (update) => {
            await debugLog(`[MagicMail WhatsApp] connection.update: ${JSON.stringify(update)}`);
            
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
              await debugLog('[MagicMail WhatsApp] QR code received');
              try {
                const QRCode = require('qrcode');
                qrCode = await QRCode.toDataURL(qr);
                connectionStatus = 'qr_pending';
                emit('qr', { qrCode });
                emit('status', { status: connectionStatus });
                strapi.log.info('[MagicMail WhatsApp] [SUCCESS] QR Code generated - scan with WhatsApp');
                resolveOnce({ success: true, status: connectionStatus, qrCode });
              } catch (qrError) {
                strapi.log.error('[MagicMail WhatsApp] QR generation error:', qrError.message);
              }
            }

            if (connection === 'close') {
              const statusCode = lastDisconnect?.error?.output?.statusCode;
              const isLoggedOut = statusCode === baileys.DisconnectReason.loggedOut;
              const isRestartRequired = statusCode === baileys.DisconnectReason.restartRequired;
              const isConnectionFailure = statusCode === 405;
              
              await debugLog(`[MagicMail WhatsApp] Connection closed - statusCode: ${statusCode}`);
              
              if (isLoggedOut) {
                connectionStatus = 'disconnected';
                lastError = 'Logged out from WhatsApp';
                qrCode = null;
                wasConnectedBefore = false;
                reconnectAttempts = 0;
                try {
                  fs.rmSync(authPath, { recursive: true, force: true });
                } catch (e) {}
                strapi.log.warn('[MagicMail WhatsApp] Logged out - auth cleared');
              } else if (isRestartRequired) {
                await debugLog('[MagicMail WhatsApp] Restart required - reconnecting...');
                connectionStatus = 'connecting';
                setTimeout(() => {
                  service.connect();
                }, 1000);
              } else if (isConnectionFailure && reconnectAttempts < 2) {
                reconnectAttempts++;
                await debugLog(`[MagicMail WhatsApp] Connection rejected (405) - retrying (${reconnectAttempts}/2)`);
                try {
                  fs.rmSync(authPath, { recursive: true, force: true });
                } catch (e) {}
                connectionStatus = 'disconnected';
                qrCode = null;
                setTimeout(() => {
                  service.connect();
                }, 3000);
              } else if (isConnectionFailure) {
                connectionStatus = 'disconnected';
                lastError = 'WhatsApp connection rejected (405). Please try again later.';
                strapi.log.error('[MagicMail WhatsApp] [ERROR] Connection rejected after retries.');
                resolveOnce({ success: false, status: connectionStatus, error: lastError });
              } else if (wasConnectedBefore && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                connectionStatus = 'connecting';
                await debugLog(`[MagicMail WhatsApp] Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => {
                  service.connect();
                }, 3000 * reconnectAttempts);
              } else if (!wasConnectedBefore) {
                connectionStatus = 'disconnected';
                qrCode = null;
                await debugLog('[MagicMail WhatsApp] Connection closed - waiting for QR scan');
              } else {
                connectionStatus = 'disconnected';
                lastError = 'Max reconnect attempts reached';
                strapi.log.warn('[MagicMail WhatsApp] Max reconnect attempts reached');
              }
              
              emit('status', { status: connectionStatus, error: lastError });
            }

            if (connection === 'open') {
              connectionStatus = 'connected';
              qrCode = null;
              lastError = null;
              wasConnectedBefore = true;
              reconnectAttempts = 0;
              emit('status', { status: connectionStatus });
              strapi.log.info('[MagicMail WhatsApp] [SUCCESS] Connected successfully!');
              resolveOnce({ success: true, status: connectionStatus });
            }
          });

          // Save credentials when updated
          sock.ev.on('creds.update', saveCreds);

        } catch (error) {
          lastError = error.message;
          connectionStatus = 'disconnected';
          strapi.log.error('[MagicMail WhatsApp] Connection error:', error);
          resolve({ success: false, error: error.message });
        }
      });
    },

    /**
     * Disconnect WhatsApp and clear session
     * @returns {Promise<object>} Result with success status
     */
    async disconnect() {
      if (sock) {
        try {
          await sock.logout();
        } catch (e) {}
        sock = null;
      }
      connectionStatus = 'disconnected';
      qrCode = null;
      emit('status', { status: connectionStatus });
      strapi.log.info('[MagicMail WhatsApp] Disconnected');
      return { success: true };
    },

    /**
     * Send a text message to a phone number
     * @param {string} phoneNumber - Phone number with country code (e.g., "491234567890")
     * @param {string} message - Message text
     * @returns {Promise<object>} Result with success status
     */
    async sendMessage(phoneNumber, message) {
      if (connectionStatus !== 'connected' || !sock) {
        return { 
          success: false, 
          error: 'WhatsApp not connected. Please connect first.' 
        };
      }

      try {
        // Format phone number (remove + and spaces, ensure @s.whatsapp.net suffix)
        const formattedNumber = phoneNumber.replace(/[^\d]/g, '');
        const jid = `${formattedNumber}@s.whatsapp.net`;

        // Check if number exists on WhatsApp
        const [exists] = await sock.onWhatsApp(formattedNumber);
        if (!exists?.exists) {
          return { 
            success: false, 
            error: `Phone number ${phoneNumber} is not registered on WhatsApp` 
          };
        }

        // Send message
        await sock.sendMessage(jid, { text: message });

        await debugLog(`[MagicMail WhatsApp] Message sent to ${formattedNumber}`);
        return { success: true, jid };
      } catch (error) {
        strapi.log.error('[MagicMail WhatsApp] Send error:', error);
        return { success: false, error: error.message };
      }
    },

    /**
     * Send message using a template
     * @param {string} phoneNumber - Phone number
     * @param {string} templateName - Template identifier
     * @param {object} variables - Template variables to replace
     * @returns {Promise<object>} Result with success status
     */
    async sendTemplateMessage(phoneNumber, templateName, variables = {}) {
      // Get template from plugin store
      try {
        const pluginStore = strapi.store({ type: 'plugin', name: 'magic-mail' });
        const templates = await pluginStore.get({ key: 'whatsapp_templates' }) || {};
        
        let template = templates[templateName];
        if (!template) {
          // Use default template
          template = `*{{subject}}*\n\n{{body}}`;
        }

        // Replace variables
        let message = template;
        for (const [key, value] of Object.entries(variables)) {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        return this.sendMessage(phoneNumber, message);
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Check if a phone number is on WhatsApp
     * @param {string} phoneNumber - Phone number to check
     * @returns {Promise<object>} Result with exists boolean
     */
    async checkNumber(phoneNumber) {
      if (connectionStatus !== 'connected' || !sock) {
        return { success: false, error: 'WhatsApp not connected' };
      }

      try {
        const formattedNumber = phoneNumber.replace(/[^\d]/g, '');
        const [result] = await sock.onWhatsApp(formattedNumber);
        return { 
          success: true, 
          exists: result?.exists || false,
          jid: result?.jid 
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Get session info
     * @returns {Promise<object|null>} Session info or null if not connected
     */
    async getSessionInfo() {
      if (connectionStatus !== 'connected' || !sock) {
        return null;
      }

      try {
        const user = sock.user;
        return {
          phoneNumber: user?.id?.split(':')[0] || user?.id?.split('@')[0],
          name: user?.name,
          platform: 'WhatsApp Web',
        };
      } catch (error) {
        return null;
      }
    },

    /**
     * Reset connection state (for manual cleanup)
     */
    reset() {
      sock = null;
      qrCode = null;
      connectionStatus = 'disconnected';
      lastError = null;
      wasConnectedBefore = false;
      reconnectAttempts = 0;
    },

    /**
     * Save WhatsApp template
     * @param {string} templateName - Template identifier
     * @param {string} templateContent - Template content with {{variables}}
     * @returns {Promise<object>} Result with success status
     */
    async saveTemplate(templateName, templateContent) {
      try {
        const pluginStore = strapi.store({ type: 'plugin', name: 'magic-mail' });
        const templates = await pluginStore.get({ key: 'whatsapp_templates' }) || {};
        
        templates[templateName] = templateContent;
        
        await pluginStore.set({ key: 'whatsapp_templates', value: templates });
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Get all WhatsApp templates
     * @returns {Promise<object>} Templates object
     */
    async getTemplates() {
      try {
        const pluginStore = strapi.store({ type: 'plugin', name: 'magic-mail' });
        const templates = await pluginStore.get({ key: 'whatsapp_templates' }) || {};
        return templates;
      } catch (error) {
        return {};
      }
    },

    /**
     * Delete a WhatsApp template
     * @param {string} templateName - Template identifier
     * @returns {Promise<object>} Result with success status
     */
    async deleteTemplate(templateName) {
      try {
        const pluginStore = strapi.store({ type: 'plugin', name: 'magic-mail' });
        const templates = await pluginStore.get({ key: 'whatsapp_templates' }) || {};
        
        delete templates[templateName];
        
        await pluginStore.set({ key: 'whatsapp_templates', value: templates });
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  };

  return service;
};

