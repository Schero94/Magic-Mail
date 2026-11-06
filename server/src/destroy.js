'use strict';

const { createLogger } = require('./utils/logger');

/**
 * Plugin teardown. Runs on shutdown and before every hot reload in dev, so it
 * must be idempotent and must not leave timers, sockets, or a patched email
 * service behind (those previously leaked and stacked across reloads).
 *
 * @param {{ strapi: object }} deps
 * @returns {Promise<void>}
 */
module.exports = async ({ strapi }) => {
  const log = createLogger(strapi);
  const registry = strapi.magicMail || {};

  // 1. Clear all plugin-scoped timers (counter resets, purge, etc.).
  const timers = Array.isArray(registry.timers) ? registry.timers : [];
  for (const handle of timers) {
    try {
      clearTimeout(handle);
      clearInterval(handle);
    } catch {
      // ignore
    }
  }
  registry.timers = [];

  // Legacy global registry cleanup (pre-3.0 installs).
  if (global.magicMailIntervals) {
    for (const key of Object.keys(global.magicMailIntervals)) {
      try {
        clearInterval(global.magicMailIntervals[key]);
      } catch {
        /* ignore */
      }
    }
    global.magicMailIntervals = undefined;
  }

  // 2. Restore the native email provider/service functions we replaced, so a
  //    re-bootstrap does not wrap our own wrapper.
  // eslint-disable-next-line global-require
  const { uninstallEmailInterception } = require('./bootstrap');
  uninstallEmailInterception(strapi);
  log.info('[magic-mail] Restored native email service');

  log.info('[magic-mail] Plugin destroyed gracefully');
};
