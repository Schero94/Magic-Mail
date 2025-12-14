'use strict';

/**
 * Debug Logger Utility for magic-mail
 * Only logs messages when debug: true in plugin config
 * ALL logs (including errors/warnings) are hidden unless debug mode is enabled
 */

const PLUGIN_NAME = 'magic-mail';
const PREFIX = '[magic-mail]';

/**
 * Format message with prefix - returns a formatted string
 */
function formatMessage(prefix, args) {
  if (args.length === 0) return prefix;
  const parts = args.map(arg => 
    typeof arg === 'string' ? arg : JSON.stringify(arg)
  );
  return `${prefix} ${parts.join(' ')}`;
}

/**
 * Creates a logger instance that respects debug config
 * @param {object} strapi - Strapi instance
 * @returns {object} Logger with info, debug, warn, error methods
 */
function createLogger(strapi) {
  const getDebugMode = () => {
    try {
      const config = strapi.config.get(`plugin::${PLUGIN_NAME}`) || {};
      return config.debug === true;
    } catch {
      return false;
    }
  };

  return {
    /**
     * Log info - only when debug: true
     */
    info: (...args) => {
      if (getDebugMode()) {
        strapi.log.info(formatMessage(PREFIX, args));
      }
    },

    /**
     * Log debug - only when debug: true
     */
    debug: (...args) => {
      if (getDebugMode()) {
        strapi.log.debug(formatMessage(PREFIX, args));
      }
    },

    /**
     * Log warning - only when debug: true
     */
    warn: (...args) => {
      if (getDebugMode()) {
        strapi.log.warn(formatMessage(PREFIX, args));
      }
    },

    /**
     * Log error - only when debug: true
     */
    error: (...args) => {
      if (getDebugMode()) {
        strapi.log.error(formatMessage(PREFIX, args));
      }
    },

    /**
     * Force log - always logged (for critical errors only)
     */
    forceError: (...args) => {
      strapi.log.error(formatMessage(PREFIX, args));
    },
  };
}

module.exports = { createLogger };
