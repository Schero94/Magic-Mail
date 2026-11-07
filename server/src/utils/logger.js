'use strict';

/**
 * Logger utility for magic-mail.
 *
 * `info` and `debug` are only written when `debug: true` is set in the plugin
 * config. `warn` and `error` are ALWAYS forwarded to strapi.log so failures
 * (for example a failed email-service override at bootstrap) are visible in
 * every environment.
 *
 * Error objects are reduced to their name and code, never their message or
 * stack, because provider errors can contain recipient addresses.
 */

const PLUGIN_NAME = 'magic-mail';
const PREFIX = '[magic-mail]';

/**
 * Renders one log argument without leaking error details.
 * @param {*} arg
 * @returns {string}
 */
function formatArg(arg) {
  if (typeof arg === 'string') return arg;
  // Error instances, errors from another realm and error-shaped objects
  // (`{ message, response, ... }` from HTTP clients) are reduced the same way;
  // serialising them would put messages and response bodies into the log.
  const errorLike =
    arg instanceof Error ||
    (arg &&
      typeof arg === 'object' &&
      !Array.isArray(arg) &&
      (typeof arg.message === 'string' || typeof arg.stack === 'string'));
  if (errorLike) {
    const name = typeof arg.name === 'string' && arg.name ? arg.name : 'Error';
    const code = typeof arg.code === 'string' || typeof arg.code === 'number' ? arg.code : null;
    return code !== null ? `${name} (${code})` : name;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Format message with prefix - returns a formatted string.
 * Avoids a doubled prefix when the message already starts with it.
 */
function formatMessage(prefix, args) {
  if (args.length === 0) return prefix;
  const text = args.map(formatArg).join(' ');
  return text.startsWith(prefix) ? text : `${prefix} ${text}`;
}

/**
 * Creates a logger instance that respects the debug config.
 * @param {object} strapi - Strapi instance
 * @returns {{info: Function, debug: Function, warn: Function, error: Function, forceError: Function}}
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
    /** Info - only when debug: true */
    info: (...args) => {
      if (getDebugMode()) strapi.log.info(formatMessage(PREFIX, args));
    },

    /** Debug - only when debug: true */
    debug: (...args) => {
      if (getDebugMode()) strapi.log.debug(formatMessage(PREFIX, args));
    },

    /** Warning - always logged */
    warn: (...args) => {
      strapi.log.warn(formatMessage(PREFIX, args));
    },

    /** Error - always logged */
    error: (...args) => {
      strapi.log.error(formatMessage(PREFIX, args));
    },

    /** Alias kept for existing callers - always logged */
    forceError: (...args) => {
      strapi.log.error(formatMessage(PREFIX, args));
    },
  };
}

module.exports = { createLogger, formatMessage };
