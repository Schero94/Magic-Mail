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
      try { clearInterval(global.magicMailIntervals[key]); } catch { /* ignore */ }
    }
    global.magicMailIntervals = undefined;
  }

  // 2. Restore the native email service if we replaced it, so a re-bootstrap
  //    does not wrap our own wrapper.
  const WRAPPED = Symbol.for('magic-mail.email.send.wrapped');
  if (registry.emailService && registry.originalEmailSend
      && registry.emailService.send && registry.emailService.send[WRAPPED]) {
    registry.emailService.send = registry.originalEmailSend;
    registry.emailService = null;
    registry.originalEmailSend = null;
    log.info('[magic-mail] Restored native email service');
  }

  // 3. Shut down the WhatsApp socket + reconnect timers (keep credentials).
  try {
    const whatsapp = strapi.plugin('magic-mail').service('whatsapp');
    if (whatsapp && typeof whatsapp.shutdown === 'function') {
      await whatsapp.shutdown({ logout: false });
    }
  } catch (err) {
    log.debug('[magic-mail] WhatsApp shutdown skipped:', err.message);
  }

  log.info('[magic-mail] Plugin destroyed gracefully');
};
