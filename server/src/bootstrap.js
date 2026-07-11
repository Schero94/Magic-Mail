'use strict';

const { createLogger } = require('./utils/logger');

/**
 * Bootstrap: Initialize MagicMail plugin
 * Sets up email account counter resets and health checks
 * OVERRIDES Strapi's native email service with MagicMail router
 */

module.exports = async ({ strapi }) => {
  const log = createLogger(strapi);

  log.info('[BOOTSTRAP] Starting...');

  // Fail fast on missing production secrets. getEncryptionKey() throws when
  // NODE_ENV=production and MAGIC_MAIL_ENCRYPTION_KEY is missing, so a bad
  // deploy dies here with a clear error instead of silently failing later
  // when the first encrypted-credential read/write happens.
  try {
    const { encryptCredentials } = require('./utils/encryption');
    encryptCredentials({ __self_test: true });
  } catch (e) {
    log.error(`[BOOTSTRAP] ${e.message}`);
    throw e;
  }

  // Plugin-scoped runtime registry (timers, wrapped email service). Kept on
  // the strapi instance instead of `global` so destroy()/hot-reload can clean
  // up deterministically and repeated bootstraps do not leak timers.
  strapi.magicMail = strapi.magicMail || {};
  strapi.magicMail.timers = strapi.magicMail.timers || [];
  const registerTimer = (handle) => {
    // unref so a pending timer never keeps the process alive on shutdown.
    if (handle && typeof handle.unref === 'function') handle.unref();
    strapi.magicMail.timers.push(handle);
    return handle;
  };

  try {
    const emailRouter = strapi.plugin('magic-mail').service('email-router');

    // ============================================================
    // OVERRIDE STRAPI'S NATIVE EMAIL SERVICE
    // ============================================================
    //
    // SECURITY / CORRECTNESS: The override never silently re-sends through the
    // original provider when MagicMail throws. Doing so previously caused
    // duplicate delivery (a post-acceptance bookkeeping failure looked like a
    // send failure) and bypassed MagicMail's validation, routing, and rate
    // limits. MagicMail is the mail router once installed; on failure we
    // surface the real error so the caller can decide, and never dispatch the
    // same message twice.

    const WRAPPED = Symbol.for('magic-mail.email.send.wrapped');
    strapi.magicMail = strapi.magicMail || {};

    // Try to get email service (support both v4 and v5 APIs)
    const originalEmailService = strapi.plugin('email')?.service?.('email') ||
                                  strapi.plugins?.email?.services?.email;

    if (originalEmailService && originalEmailService.send) {
      if (originalEmailService.send[WRAPPED]) {
        // Idempotent across hot reloads: never stack wrappers on top of wrappers.
        log.debug('[EMAIL] Native email service already routed through MagicMail');
      } else {
        const originalSend = originalEmailService.send.bind(originalEmailService);
        strapi.magicMail.emailService = originalEmailService;
        strapi.magicMail.originalEmailSend = originalSend;

        const wrappedSend = async (emailData) => {
          log.info('[EMAIL] Intercepted from native Strapi service');
          log.debug('[EMAIL] Routing message', {
            templateId: emailData.templateId,
            hasHtml: !!emailData.html,
            hasText: !!emailData.text,
          });

          // Map 'data' to 'templateData' for backward compatibility. Clone so a
          // downstream failure never leaves the caller's object mutated.
          const payload = { ...emailData };
          if (payload.data && !payload.templateData) {
            payload.templateData = payload.data;
          }

          const result = await emailRouter.send(payload);
          log.info('[SUCCESS] Email routed successfully through MagicMail');
          return result;
        };
        wrappedSend[WRAPPED] = true;
        originalEmailService.send = wrappedSend;

        log.info('[SUCCESS] Native email service overridden!');
        log.info('[INFO] All strapi.plugin(\'email\').service(\'email\').send() calls route through MagicMail');
      }
    } else {
      log.warn('[WARNING] Native email service not found - MagicMail will work standalone');
      log.warn('[INFO] Make sure @strapi/plugin-email is installed');
    }

    // ============================================================
    // COUNTER RESET SCHEDULES
    // ============================================================

    // Reset hourly counters every hour
    registerTimer(setInterval(async () => {
      try {
        if (!strapi || !strapi.plugin) return;
        const accountMgr = strapi.plugin('magic-mail').service('account-manager');
        await accountMgr.resetCounters('hourly');
        log.info('[RESET] Hourly counters reset');
      } catch (err) {
        strapi.log.error('[magic-mail] Hourly reset error:', err.message);
      }
    }, 60 * 60 * 1000));

    // Reset daily counters at midnight, then every 24h.
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight - now;

    registerTimer(setTimeout(async () => {
      try {
        if (!strapi || !strapi.plugin) return;
        const accountMgr = strapi.plugin('magic-mail').service('account-manager');
        await accountMgr.resetCounters('daily');
        log.info('[RESET] Daily counters reset');

        registerTimer(setInterval(async () => {
          try {
            if (!strapi || !strapi.plugin) return;
            const mgr = strapi.plugin('magic-mail').service('account-manager');
            await mgr.resetCounters('daily');
            log.info('[RESET] Daily counters reset');
          } catch (err) {
            strapi.log.error('[magic-mail] Daily reset error:', err.message);
          }
        }, 24 * 60 * 60 * 1000));
      } catch (err) {
        strapi.log.error('[magic-mail] Initial daily reset error:', err.message);
      }
    }, msUntilMidnight));

    // One-time purge of any historic tracking link mappings that captured a
    // sensitive/authentication URL before the tracking policy existed. Runs
    // shortly after boot, guarded by a store flag so it happens once.
    registerTimer(setTimeout(async () => {
      try {
        await purgeSensitiveLinkMappings(strapi, log);
      } catch (err) {
        strapi.log.debug('[magic-mail] Sensitive link purge skipped:', err.message);
      }
    }, 10 * 1000));

    log.info('[SUCCESS] Counter reset schedules initialized');
    log.info('[SUCCESS] Bootstrap complete');
  } catch (err) {
    log.error('[ERROR] Bootstrap error:', err);
  }
};

/**
 * One-time cleanup that removes historic click-tracking link mappings whose
 * stored `originalUrl` is a sensitive/authentication URL (password reset,
 * confirmation, magic-link, token-bearing). Such rows may predate the tracking
 * policy and would otherwise keep exposing credentials via the tracking table.
 *
 * Guarded by a plugin-store flag so it only runs once per installation.
 *
 * @param {object} strapi
 * @param {object} log
 * @returns {Promise<void>}
 * @sideeffect Deletes matching email-link rows; sets a store flag
 */
async function purgeSensitiveLinkMappings(strapi, log) {
  const store = strapi.store({ type: 'plugin', name: 'magic-mail' });
  const done = await store.get({ key: 'sensitiveLinkPurgeV1' });
  if (done) return;

  const { isSensitiveTrackingUrl } = require('./utils/tracking-url-policy');
  const LINK_UID = 'plugin::magic-mail.email-link';
  const pageSize = 200;
  let start = 0;
  let removed = 0;

  // Iterate defensively; the table is usually small.
  for (let guard = 0; guard < 10000; guard += 1) {
    const rows = await strapi.documents(LINK_UID).findMany({
      fields: ['documentId', 'originalUrl'],
      limit: pageSize,
      start,
    });
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      if (isSensitiveTrackingUrl(row.originalUrl)) {
        try {
          await strapi.documents(LINK_UID).delete({ documentId: row.documentId });
          removed += 1;
        } catch {
          // best-effort
        }
      }
    }

    if (rows.length < pageSize) break;
    // Only advance when we did not delete the whole page (deletes shift rows).
    start += pageSize - 0;
  }

  await store.set({ key: 'sensitiveLinkPurgeV1', value: { done: true, removed, at: new Date().toISOString() } });
  if (removed > 0) {
    log.info(`[magic-mail] [PURGE] Removed ${removed} historic sensitive tracking link mapping(s)`);
  }
}
