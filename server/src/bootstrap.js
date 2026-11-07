'use strict';

const { createLogger } = require('./utils/logger');

/** Marks functions installed by MagicMail so hot reloads never stack wrappers. */
const WRAPPED = Symbol.for('magic-mail.email.send.wrapped');
const QUOTA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TRACKING_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Bootstrap: Initialize MagicMail plugin
 * - routes Strapi's native email (service.send and sendTemplatedEmail) through MagicMail
 * - keeps quota counters of ended windows at zero for the admin UI
 * - runs the one-time sensitive tracking-link purge
 * - schedules tracking privacy migration and retention
 */
module.exports = async ({ strapi }) => {
  const log = createLogger(strapi);

  log.info('[BOOTSTRAP] Starting...');

  // Fail fast on missing production secrets. getEncryptionKey() throws when
  // NODE_ENV=production and MAGIC_MAIL_ENCRYPTION_KEY is missing.
  try {
    const { encryptCredentials } = require('./utils/encryption');
    encryptCredentials({ __self_test: true });
  } catch (e) {
    log.error(`[BOOTSTRAP] ${e.message}`);
    throw e;
  }

  // Plugin-scoped runtime registry (timers, wrapped email functions). Kept on
  // the strapi instance so destroy()/hot-reload can clean up deterministically.
  strapi.magicMail = strapi.magicMail || {};
  strapi.magicMail.timers = strapi.magicMail.timers || [];
  const registerTimer = (handle) => {
    if (handle && typeof handle.unref === 'function') handle.unref();
    strapi.magicMail.timers.push(handle);
    return handle;
  };

  try {
    installEmailInterception(strapi, log);
  } catch (err) {
    log.error('[BOOTSTRAP] Native email interception failed; Strapi emails bypass MagicMail:', err);
  }

  try {
    const refreshQuotaWindows = async () => {
      try {
        if (!strapi || !strapi.plugin) return;
        await strapi.plugin('magic-mail').service('email-router').refreshQuotaWindows();
      } catch (err) {
        log.error('[QUOTA] Quota window refresh failed:', err);
      }
    };
    registerTimer(setTimeout(refreshQuotaWindows, 5 * 1000));
    registerTimer(setInterval(refreshQuotaWindows, QUOTA_REFRESH_INTERVAL_MS));
  } catch (err) {
    log.error('[BOOTSTRAP] Quota refresh schedule failed:', err);
  }

  // One-time purge of historic tracking link mappings that captured a
  // sensitive/authentication URL before the tracking policy existed.
  registerTimer(
    setTimeout(async () => {
      try {
        await purgeSensitiveLinkMappings(strapi, log);
      } catch (err) {
        log.warn(
          '[PURGE] Sensitive link purge did not complete; it will run again on next start:',
          err
        );
      }
    }, 10 * 1000)
  );

  // Tracking privacy and retention: one-time anonymisation of legacy events,
  // then periodic deletion of expired events, links and (optionally) logs.
  const runTrackingMaintenance = async () => {
    try {
      await strapi.plugin('magic-mail').service('analytics').runTrackingMaintenance();
    } catch (err) {
      log.warn('[RETENTION] Tracking maintenance failed:', err);
    }
  };
  registerTimer(setTimeout(runTrackingMaintenance, 60 * 1000));
  registerTimer(setInterval(runTrackingMaintenance, TRACKING_MAINTENANCE_INTERVAL_MS));

  log.info('[SUCCESS] Bootstrap complete');
};

/**
 * Routes Strapi's native email plugin through MagicMail.
 *
 * In @strapi/email 5.x both `service('email').send()` and
 * `service('email').sendTemplatedEmail()` call
 * `strapi.plugin('email').provider.send()`. MagicMail therefore wraps the
 * provider's `send`: every native email (users-permissions, admin password
 * reset, third-party plugins) is routed, validated, quota-checked and logged.
 * The service methods get thin shims that (re)install the provider wrapper
 * before delegating, so a provider created or replaced after this bootstrap
 * is still covered.
 *
 * When no MagicMail account can take a message (none active, or every
 * eligible account over quota) the original provider sends it, so mail is
 * never lost. A failure after an account was attempted is never re-sent
 * through the original provider (that could deliver twice); the error
 * reaches the caller.
 *
 * @param {object} strapi
 * @param {object} log
 * @returns {boolean} true when interception is active
 */
function installEmailInterception(strapi, log) {
  const emailPlugin = typeof strapi.plugin === 'function' ? strapi.plugin('email') : null;
  if (!emailPlugin) {
    log.warn('[EMAIL] Strapi email plugin not found - MagicMail works standalone only');
    return false;
  }

  const registry = strapi.magicMail;
  const emailRouter = () => strapi.plugin('magic-mail').service('email-router');

  const wrapProvider = () => {
    const provider = emailPlugin.provider;
    if (!provider || typeof provider.send !== 'function') return false;
    if (provider.send[WRAPPED]) return true;

    const originalSend = provider.send;
    const callOriginal = (options) => originalSend.call(provider, options);

    const routedSend = async (options = {}) => {
      const payload = { ...options };
      if (payload.data && !payload.templateData) payload.templateData = payload.data;
      log.debug('[EMAIL] Routing native Strapi email through MagicMail');
      return emailRouter().send(payload, {
        source: 'strapi-email',
        fallbackSend: () => callOriginal(options),
      });
    };
    routedSend[WRAPPED] = true;

    registry.emailProvider = provider;
    registry.originalProviderSend = originalSend;
    provider.send = routedSend;
    log.info('[EMAIL] Strapi email provider routed through MagicMail');
    return true;
  };

  const service = typeof emailPlugin.service === 'function' ? emailPlugin.service('email') : null;
  if (service) {
    registry.emailService = service;
    registry.originalServiceMethods = registry.originalServiceMethods || {};
    for (const method of ['send', 'sendTemplatedEmail']) {
      const original = service[method];
      if (typeof original !== 'function' || original[WRAPPED]) continue;
      const shim = function magicMailServiceShim(...args) {
        wrapProvider();
        return original.apply(this && this !== globalThis ? this : service, args);
      };
      shim[WRAPPED] = true;
      registry.originalServiceMethods[method] = original;
      service[method] = shim;
    }
  }

  const active = wrapProvider();
  if (!active) {
    log.info('[EMAIL] Email provider not initialised yet; it is routed on first use');
  }
  return active || Boolean(service);
}

/**
 * Restores everything installEmailInterception() replaced.
 * @param {object} strapi
 */
function uninstallEmailInterception(strapi) {
  const registry = strapi.magicMail || {};
  const provider = registry.emailProvider;
  if (provider && registry.originalProviderSend && provider.send && provider.send[WRAPPED]) {
    provider.send = registry.originalProviderSend;
  }
  registry.emailProvider = null;
  registry.originalProviderSend = null;

  const service = registry.emailService;
  const originals = registry.originalServiceMethods || {};
  if (service) {
    for (const [method, original] of Object.entries(originals)) {
      if (service[method] && service[method][WRAPPED]) service[method] = original;
    }
  }
  registry.emailService = null;
  registry.originalServiceMethods = {};
}

/**
 * One-time cleanup that removes historic click-tracking link mappings whose
 * stored `originalUrl` is a sensitive/authentication URL (password reset,
 * confirmation, magic-link, token-bearing).
 *
 * Pages by id cursor (deletes cannot shift unchecked rows out of the window)
 * and sets the store flag only after a complete pass. The flag is V2 so
 * installs that ran the earlier, row-skipping purge run it again.
 *
 * @param {object} strapi
 * @param {object} log
 * @returns {Promise<void>}
 * @sideeffect Deletes matching email-link rows; sets a store flag
 */
async function purgeSensitiveLinkMappings(strapi, log) {
  const store = strapi.store({ type: 'plugin', name: 'magic-mail' });
  const done = await store.get({ key: 'sensitiveLinkPurgeV2' });
  if (done) return;

  const { isSensitiveTrackingUrl } = require('./utils/tracking-url-policy');
  const query = strapi.db.query('plugin::magic-mail.email-link');
  const pageSize = 200;
  let lastId = 0;
  let removed = 0;

  for (let guard = 0; guard < 100000; guard += 1) {
    const rows = await query.findMany({
      select: ['id', 'originalUrl'],
      where: { id: { $gt: lastId } },
      orderBy: { id: 'asc' },
      limit: pageSize,
    });
    if (!rows || rows.length === 0) break;

    lastId = rows[rows.length - 1].id;
    const sensitiveIds = rows
      .filter((row) => isSensitiveTrackingUrl(row.originalUrl))
      .map((row) => row.id);
    if (sensitiveIds.length > 0) {
      await query.deleteMany({ where: { id: { $in: sensitiveIds } } });
      removed += sensitiveIds.length;
    }
    if (rows.length < pageSize) break;
  }

  await store.set({
    key: 'sensitiveLinkPurgeV2',
    value: { done: true, removed, at: new Date().toISOString() },
  });
  if (removed > 0) {
    log.info(`[PURGE] Removed ${removed} historic sensitive tracking link mapping(s)`);
  }
}

module.exports.installEmailInterception = installEmailInterception;
module.exports.uninstallEmailInterception = uninstallEmailInterception;
module.exports.purgeSensitiveLinkMappings = purgeSensitiveLinkMappings;
module.exports.WRAPPED = WRAPPED;
