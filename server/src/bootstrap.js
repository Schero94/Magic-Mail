'use strict';

const crypto = require('crypto');
const { createLogger } = require('./utils/logger');
const coordination = require('./utils/coordination');
const { canonicalLocale } = require('./utils/locale');
const { emitProviderTemplateEvent } = require('./utils/provider-template-events');
const { sanitizeErrorCode } = require('./utils/delivery-outcome');
const { buildCoreMailPayload, createCoreMailCapture } = require('./utils/core-mail-payload');

/** Marks functions installed by MagicMail so hot reloads never stack wrappers. */
const WRAPPED = Symbol.for('magic-mail.email.send.wrapped');
const QUOTA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TRACKING_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Delay of the core-mail provider-template check after start (server is listening). */
const CORE_DESIGN_CHECK_DELAY_MS = 20 * 1000;
/** Random start delay so replicas and pm2 workers do not hit the database together. */
const jitter = (maxMs) => Math.floor(Math.random() * maxMs);

/**
 * Bootstrap: Initialize MagicMail plugin
 * - routes Strapi's native email (service.send and sendTemplatedEmail) through MagicMail
 * - creates the coordination tables (leases, rate limits, OAuth flows)
 * - keeps quota counters of ended windows at zero for the admin UI
 * - runs the one-time sensitive tracking-link purge
 * - schedules tracking privacy migration and retention
 *
 * Every process (replica, pm2 worker) keeps its own timers, but each job runs
 * under a database lease (`runSingleton`), so one process does the work per
 * interval and a crashed leader is replaced on the next tick.
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
    await coordination.ready(strapi);
  } catch (err) {
    log.error(
      '[BOOTSTRAP] Coordination tables could not be created; multi-instance safety is degraded:',
      err?.name || 'Error'
    );
  }

  logSecretFingerprints(strapi);

  try {
    installEmailInterception(strapi, log);
  } catch (err) {
    log.error('[BOOTSTRAP] Native email interception failed; Strapi emails bypass MagicMail:', err);
  }

  try {
    const refreshQuotaWindows = async () => {
      try {
        if (!strapi || !strapi.plugin) return;
        await coordination.runSingleton(
          strapi,
          'quota-refresh',
          QUOTA_REFRESH_INTERVAL_MS - 30 * 1000,
          async () => {
            await strapi.plugin('magic-mail').service('email-router').refreshQuotaWindows();
            // Expired leases, rate-limit windows and abandoned OAuth flows.
            await coordination.purgeExpired(strapi);
          }
        );
      } catch (err) {
        log.error('[QUOTA] Quota window refresh failed:', err);
      }
    };
    registerTimer(setTimeout(refreshQuotaWindows, 5 * 1000 + jitter(5 * 1000)));
    registerTimer(setInterval(refreshQuotaWindows, QUOTA_REFRESH_INTERVAL_MS));
  } catch (err) {
    log.error('[BOOTSTRAP] Quota refresh schedule failed:', err);
  }

  // One-time purge of historic tracking link mappings that captured a
  // sensitive/authentication URL before the tracking policy existed.
  registerTimer(
    setTimeout(
      async () => {
        try {
          await coordination.runSingleton(strapi, 'sensitive-link-purge', 30 * 60 * 1000, () =>
            purgeSensitiveLinkMappings(strapi, log)
          );
        } catch (err) {
          log.warn(
            '[PURGE] Sensitive link purge did not complete; it will run again on next start:',
            err
          );
        }
      },
      10 * 1000 + jitter(5 * 1000)
    )
  );

  // Tracking privacy and retention: one-time anonymisation of legacy events,
  // then periodic deletion of expired events, links and (optionally) logs.
  const runTrackingMaintenance = async () => {
    try {
      await coordination.runSingleton(
        strapi,
        'tracking-maintenance',
        TRACKING_MAINTENANCE_INTERVAL_MS - 5 * 60 * 1000,
        () => strapi.plugin('magic-mail').service('analytics').runTrackingMaintenance()
      );
    } catch (err) {
      log.warn('[RETENTION] Tracking maintenance failed:', err);
    }
  };
  registerTimer(setTimeout(runTrackingMaintenance, 60 * 1000 + jitter(30 * 1000)));
  registerTimer(setInterval(runTrackingMaintenance, TRACKING_MAINTENANCE_INTERVAL_MS));

  // Send queue: worker timer in every process (unless queue.worker is false),
  // reaper and retention under database leases. Idle unless mail is queued.
  try {
    strapi.plugin('magic-mail').service('queue').start(registerTimer);
  } catch (err) {
    log.error('[BOOTSTRAP] Send queue worker could not start:', err?.name || 'Error');
  }

  // Bounce monitoring: one tick per minute in every process; each account is
  // polled by one process per interval (database lease). Idle unless an
  // account has bounce monitoring turned on.
  try {
    registerTimer(strapi.plugin('magic-mail').service('bounce-monitor').start());
  } catch (err) {
    log.error('[BOOTSTRAP] Bounce monitoring could not start:', err?.name || 'Error');
  }

  // Core emails set to a provider template: checked once after start (not
  // blocking the boot). Unusable or unsynced templates are logged with their
  // key and code; a stale template list is synced first.
  registerTimer(
    setTimeout(
      () => checkCoreDesignsAtStart(strapi, log),
      CORE_DESIGN_CHECK_DELAY_MS + jitter(10 * 1000)
    )
  );

  // Roles that could read or manage Magic Mail before the outbox existed get
  // the matching outbox permission once (super admins get it from Strapi).
  try {
    await coordination.runSingleton(strapi, 'queue-permission-migration', 10 * 60 * 1000, () =>
      migrateQueuePermissions(strapi, log)
    );
  } catch (err) {
    log.warn('[BOOTSTRAP] Outbox permission migration did not complete:', err?.name || 'Error');
  }

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
      const coreMail = registry.coreMailCapture?.take(payload.html || payload.text) || null;
      if (coreMail) {
        const routed = await routeCoreMailToProviderTemplate(strapi, log, coreMail, payload, () =>
          callOriginal(options)
        );
        if (routed) return routed.result;
      }
      log.debug('[EMAIL] Routing native Strapi email through MagicMail');
      return emailRouter().send(payload, {
        source: 'strapi-email',
        fallbackSend: () => callOriginal(options),
        // users-permissions variables (USER, URL, TOKEN/CODE) for the admin
        // preview; masked before they are stored.
        ...(coreMail?.data ? { coreMailVariables: coreMail.data } : {}),
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
        const self = this && this !== globalThis ? this : service;
        if (method === 'sendTemplatedEmail') {
          const adminMail = adminForgotPasswordMail(strapi, args);
          if (adminMail) {
            return sendAdminForgotPassword(strapi, log, adminMail, args[0], () =>
              original.apply(self, args)
            );
          }
        }
        return original.apply(self, args);
      };
      shim[WRAPPED] = true;
      registry.originalServiceMethods[method] = original;
      service[method] = shim;
    }
  }

  installCoreMailCapture(strapi, log);

  const active = wrapProvider();
  if (!active) {
    log.info('[EMAIL] Email provider not initialised yet; it is routed on first use');
  }
  return active || Boolean(service);
}

/**
 * Records the variables users-permissions renders its core mails with.
 *
 * users-permissions builds the password-reset and email-confirmation bodies
 * with its own `template(layout, data)` and then sends finished HTML, so the
 * variables (URL, TOKEN/CODE, USER, ...) never reach the email provider.
 * MagicMail wraps that synchronous function: the result is returned
 * unchanged, and the allowlisted variables are kept for five minutes keyed by
 * a hash of the rendered body, so the provider wrapper can send a core mail
 * through a provider template with the same values.
 *
 * @param {object} strapi
 * @param {object} log
 * @returns {boolean} true when the capture is installed
 * @sideeffect Replaces `template` on the users-permissions service (restored
 *   by uninstallEmailInterception); keeps core-mail variables in memory.
 */
function installCoreMailCapture(strapi, log) {
  const registry = strapi.magicMail;
  registry.coreMailCapture = registry.coreMailCapture || createCoreMailCapture();
  let service = null;
  try {
    service =
      typeof strapi.plugin === 'function' && strapi.plugin('users-permissions')
        ? strapi.plugin('users-permissions').service('users-permissions')
        : null;
  } catch {
    service = null;
  }
  if (!service || typeof service.template !== 'function') return false;
  if (service.template[WRAPPED]) return true;

  const original = service.template;
  const capture = registry.coreMailCapture;
  const wrapped = function magicMailTemplateCapture(layout, data) {
    const rendered = original.call(this && this !== globalThis ? this : service, layout, data);
    try {
      capture.remember(rendered, data);
    } catch {
      // Recording is best effort; the rendered body is returned unchanged.
    }
    return rendered;
  };
  wrapped[WRAPPED] = true;
  registry.usersPermissionsService = service;
  registry.originalTemplate = original;
  service.template = wrapped;
  log.debug('[EMAIL] Core email variables are recorded for provider templates');
  return true;
}

/**
 * Recognises the admin panel's forgot-password mail in a
 * `sendTemplatedEmail(options, template, data)` call.
 *
 * @strapi/admin 5.x (services/auth.js `forgotPassword`) calls
 * `sendTemplatedEmail({ to, from, replyTo }, config('admin.forgotPassword.emailTemplate'),
 * { url: `${admin.absoluteUrl}/auth/reset-password?code=TOKEN`, user })`.
 * The call is recognised when the data has exactly `url` and `user` and
 * either the template is the configured admin template (same object) or the
 * link is the admin reset-password link.
 *
 * @param {object} strapi
 * @param {unknown[]} args - sendTemplatedEmail arguments
 * @returns {{url: string, user: object, adminUrl: string, serverUrl: string}|null}
 */
function adminForgotPasswordMail(strapi, args) {
  const [options, template, data] = args;
  if (!options || typeof options !== 'object' || !data || typeof data !== 'object') return null;
  const keys = Object.keys(data);
  if (keys.length !== 2 || typeof data.url !== 'string' || !data.user) return null;
  if (typeof data.user !== 'object' || Array.isArray(data.user)) return null;
  const config = (key) => {
    try {
      return strapi.config?.get?.(key);
    } catch {
      return undefined;
    }
  };
  const adminUrl =
    typeof config('admin.absoluteUrl') === 'string' ? config('admin.absoluteUrl') : '';
  const configuredTemplate = config('admin.forgotPassword.emailTemplate');
  const sameTemplate = Boolean(template) && template === configuredTemplate;
  const resetLink =
    Boolean(adminUrl) && data.url.startsWith(`${adminUrl}/auth/reset-password?code=`);
  if (!sameTemplate && !resetLink) return null;
  const serverUrl = config('server.absoluteUrl');
  return {
    url: data.url,
    user: data.user,
    adminUrl,
    serverUrl: typeof serverUrl === 'string' ? serverUrl : '',
  };
}

/**
 * Admin user facts for the admin forgot-password payload: the id and the
 * interface language (`preferedLanguage`). Best effort; never throws.
 *
 * @param {object} strapi
 * @param {unknown} email - Recipient address
 * @returns {Promise<{id?: number, locale?: string}>}
 */
async function adminUserFacts(strapi, email) {
  try {
    if (typeof email !== 'string' || !email) return {};
    const user = await strapi.db.query('admin::user').findOne({
      where: { email },
      select: ['id', 'preferedLanguage'],
    });
    if (!user) return {};
    return {
      ...(Number.isInteger(user.id) ? { id: user.id } : {}),
      ...(canonicalLocale(user.preferedLanguage)
        ? { locale: canonicalLocale(user.preferedLanguage) }
        : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Sends the admin forgot-password mail through its provider template when
 * one is chosen; otherwise (or on opt-in fallback) Strapi renders and sends
 * the local template as before.
 *
 * @param {object} strapi
 * @param {object} log
 * @param {{url: string, user: object, adminUrl: string, serverUrl: string}} adminMail
 * @param {object} options - Addressing from @strapi/admin ({ to, from, replyTo })
 * @param {() => Promise<any>} sendLocal - The original sendTemplatedEmail call
 * @returns {Promise<any>}
 * @throws {Error} The provider-template error (strict mode)
 */
async function sendAdminForgotPassword(strapi, log, adminMail, options, sendLocal) {
  let design;
  try {
    design = await strapi
      .plugin('magic-mail')
      .service('provider-templates')
      .coreDesignFor('admin-forgot-password');
  } catch {
    design = null;
  }
  // No provider template chosen: Strapi renders and sends as before.
  if (!design) return sendLocal();
  const facts = await adminUserFacts(strapi, options?.to);
  const coreMail = {
    coreEmailType: 'admin-forgot-password',
    data: {
      ...adminMail,
      user: { ...(facts.id !== undefined ? { id: facts.id } : {}), ...adminMail.user },
    },
    locale: facts.locale,
  };
  const routed = await routeCoreMailToProviderTemplate(
    strapi,
    log,
    coreMail,
    { ...options },
    sendLocal,
    { sendDesignerVersion: sendLocal }
  );
  return routed ? routed.result : sendLocal();
}

/** Where the base URL of each core mail's link comes from (for the warning). */
const CORE_URL_SOURCES = Object.freeze({
  'reset-password': 'Users & Permissions > Advanced settings > Reset password page',
  'email-confirmation': 'config/server (url) and the REST API prefix',
  'admin-forgot-password': 'config/admin (url) and config/server (url)',
});

/**
 * Warns once per process and core mail when the payload has no `url`
 * (empty or relative base URL). Names the setting, never values.
 *
 * @param {object} strapi
 * @param {object} log
 * @param {string} coreEmailType
 */
function warnMissingCoreUrlOnce(strapi, log, coreEmailType) {
  const registry = strapi.magicMail || (strapi.magicMail = {});
  registry.coreUrlWarned = registry.coreUrlWarned || new Set();
  if (registry.coreUrlWarned.has(coreEmailType)) return;
  registry.coreUrlWarned.add(coreEmailType);
  log.warn(
    `[EMAIL] Core email ${coreEmailType}: "url" can not be built because the base URL is empty or not an absolute http(s) URL. The template gets url "" until ${CORE_URL_SOURCES[coreEmailType] || 'the base URL'} is set`
  );
}

/**
 * Sends a core mail (password reset, email confirmation, admin forgot
 * password) through the provider template chosen for it, with the v1
 * core-mail payload.
 *
 * Strict by default: a provider-template error reaches the caller and no
 * other body is sent. With "send the Magic Mail designer version instead"
 * enabled, the local version is sent when no provider accepted the message,
 * and `magic-mail.provider-template.fallback` is emitted.
 *
 * @param {object} strapi
 * @param {object} log
 * @param {{coreEmailType: string, data: object, locale?: string}} coreMail - Recorded variables
 * @param {object} payload - The mail users-permissions sends (or the admin addressing)
 * @param {() => Promise<any>} callOriginal - Native provider send
 * @param {{sendDesignerVersion?: () => Promise<any>}} [options] - How to send
 *   the local version on fallback (default: the payload through Magic Mail)
 * @returns {Promise<{result: object}|null>} null when the core mail uses the designer
 * @throws {Error} The provider-template error (strict mode)
 */
async function routeCoreMailToProviderTemplate(
  strapi,
  log,
  coreMail,
  payload,
  callOriginal,
  options = {}
) {
  let design;
  try {
    design = await strapi
      .plugin('magic-mail')
      .service('provider-templates')
      .coreDesignFor(coreMail.coreEmailType);
  } catch (error) {
    log.warn(`[EMAIL] Core email design could not be read: ${error?.name || 'Error'}`);
    return null;
  }
  if (!design) return null;

  const router = strapi.plugin('magic-mail').service('email-router');
  // The designer body and subject are replaced by the provider template.
  const { html, text, subject, data, templateData, ...rest } = payload;
  // Users & Permissions mails: the user's stored locale (when the user
  // content type has a `locale` attribute). Admin mails: the admin's
  // interface language. It picks the language version and is sent as
  // meta.locale.
  let locale = coreMail.locale || null;
  if (!locale && coreMail.coreEmailType !== 'admin-forgot-password') {
    try {
      locale =
        typeof router.recipientLocale === 'function'
          ? await router.recipientLocale(payload.to)
          : null;
    } catch {
      locale = null;
    }
  }
  let strapiVersion;
  try {
    strapiVersion = strapi.config?.get?.('info.strapi');
  } catch {
    strapiVersion = undefined;
  }
  const coreData = buildCoreMailPayload(coreMail.coreEmailType, coreMail.data, {
    templateKey: design.providerTemplate,
    ...(locale ? { locale } : {}),
    ...(typeof strapiVersion === 'string' ? { strapiVersion } : {}),
  });
  if (!coreData.url) warnMissingCoreUrlOnce(strapi, log, coreMail.coreEmailType);
  const providerPayload = {
    ...rest,
    providerTemplate: design.providerTemplate,
    ...(locale ? { locale } : {}),
    templateData: coreData,
  };
  log.debug('[EMAIL] Routing a core email through its provider template');
  try {
    return {
      result: await router.send(providerPayload, {
        source: 'strapi-email',
        providerTemplateFallback: false,
        coreEmailType: coreMail.coreEmailType,
      }),
    };
  } catch (error) {
    if (design.fallbackToDesigner && error?.magicMailFallbackSafe === true) {
      log.warn(
        '[EMAIL] Provider template for a core email failed; sending the Magic Mail designer version'
      );
      await emitProviderTemplateEvent(strapi, 'fallback', {
        key: design.providerTemplate,
        code: sanitizeErrorCode(error),
        coreEmailType: coreMail.coreEmailType,
        fallback: 'designer',
      });
      if (typeof options.sendDesignerVersion === 'function') {
        return { result: await options.sendDesignerVersion() };
      }
      return {
        result: await router.send(payload, { source: 'strapi-email', fallbackSend: callOriginal }),
      };
    }
    throw error;
  }
}

/**
 * Startup check of the core emails that use a provider template: syncs a
 * stale template list (read-only at the provider) and logs every core email
 * whose template is not synced or not usable, with key and code only.
 * Never throws; runs after the server started.
 *
 * @param {object} strapi
 * @param {object} log
 * @returns {Promise<void>}
 * @sideeffect May sync provider templates; writes the check result to the
 *   plugin store (shown on the dashboard).
 */
async function checkCoreDesignsAtStart(strapi, log) {
  try {
    const service = strapi.plugin('magic-mail').service('provider-templates');
    if (!service || typeof service.checkCoreDesigns !== 'function') return;
    await service.checkCoreDesigns({ syncIfStale: true });
  } catch (error) {
    log.warn(`[EMAIL] Core email template check did not complete: ${error?.name || 'Error'}`);
  }
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

  const upService = registry.usersPermissionsService;
  if (upService && registry.originalTemplate && upService.template?.[WRAPPED]) {
    upService.template = registry.originalTemplate;
  }
  registry.usersPermissionsService = null;
  registry.originalTemplate = null;
  registry.coreMailCapture?.clear?.();
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

  // Compare-and-set write: no duplicate core-store rows for the flag.
  await coordination.updateStoreValue(
    strapi,
    { type: 'plugin', name: 'magic-mail', key: 'sensitiveLinkPurgeV2' },
    () => ({ done: true, removed, at: new Date().toISOString() })
  );
  if (removed > 0) {
    log.info(`[PURGE] Removed ${removed} historic sensitive tracking link mapping(s)`);
  }
}

const QUEUE_PERMISSION_MAP = Object.freeze({
  'plugin::magic-mail.read': 'plugin::magic-mail.queue.read',
  'plugin::magic-mail.manage': 'plugin::magic-mail.queue.manage',
});

/**
 * One-time migration for 4.4: every role that holds `read` gets
 * `queue.read` and every role that holds `manage` gets `queue.manage`, so
 * existing Magic Mail editors keep seeing and handling failed mails. Runs
 * once (store flag); later changes in the role editor are respected.
 *
 * @param {object} strapi
 * @param {object} log
 * @returns {Promise<number>} permissions created
 * @sideeffect Creates admin::permission rows; sets a store flag
 */
async function migrateQueuePermissions(strapi, log) {
  const store = strapi.store({ type: 'plugin', name: 'magic-mail' });
  if (await store.get({ key: 'queuePermissionsV1' })) return 0;
  const permissionService = strapi.admin?.services?.permission;
  const query = strapi.db?.query?.('admin::permission');
  if (!permissionService || typeof permissionService.createMany !== 'function' || !query) return 0;

  const existing = await query.findMany({
    where: {
      action: {
        $in: [...Object.keys(QUEUE_PERMISSION_MAP), ...Object.values(QUEUE_PERMISSION_MAP)],
      },
    },
    populate: ['role'],
  });
  const has = new Set(existing.map((row) => `${row.role?.id}:${row.action}`));
  const toCreate = [];
  for (const row of existing) {
    const target = QUEUE_PERMISSION_MAP[row.action];
    const roleId = row.role?.id;
    if (!target || !roleId || has.has(`${roleId}:${target}`)) continue;
    has.add(`${roleId}:${target}`);
    toCreate.push({
      action: target,
      actionParameters: {},
      subject: null,
      properties: {},
      conditions: [],
      role: roleId,
    });
  }
  if (toCreate.length > 0) await permissionService.createMany(toCreate);
  await coordination.updateStoreValue(
    strapi,
    { type: 'plugin', name: 'magic-mail', key: 'queuePermissionsV1' },
    () => ({ done: true, created: toCreate.length, at: new Date().toISOString() })
  );
  if (toCreate.length > 0) log.info(`[RBAC] Granted ${toCreate.length} outbox permission(s)`);
  return toCreate.length;
}

/**
 * Logs short, one-way fingerprints of the secrets that must be identical on
 * every replica and pm2 worker (encryption key, tracking secret, OAuth state
 * secret). Mismatched replicas show different values; the secrets themselves
 * can not be derived from 32 bits of an HKDF/HMAC output.
 *
 * @param {object} strapi
 */
function logSecretFingerprints(strapi) {
  try {
    const { derivePurposeKey } = require('./utils/encryption');
    const appKeys = strapi?.config?.get?.('server.app.keys');
    const appKey =
      (Array.isArray(appKeys) ? appKeys[0] : null) ||
      String(process.env.APP_KEYS || '')
        .split(',')
        .map((key) => key.trim())
        .find(Boolean);
    const fingerprint = (material) =>
      material
        ? crypto
            .createHmac('sha256', derivePurposeKey(material, 'instance-fingerprint'))
            .update('magic-mail')
            .digest('hex')
            .slice(0, 8)
        : 'unset';
    const encryption = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    const tracking = process.env.MAGIC_MAIL_TRACKING_SECRET || encryption || appKey;
    const oauthState = process.env.MAGIC_MAIL_OAUTH_STATE_SECRET || encryption || appKey;
    strapi.log.info(
      `[magic-mail] Secret fingerprints (must match on every instance): encryption=${fingerprint(
        encryption
      )} tracking=${fingerprint(tracking)} oauthState=${fingerprint(oauthState)}`
    );
  } catch {
    // Diagnostics only.
  }
}

module.exports.installEmailInterception = installEmailInterception;
module.exports.installCoreMailCapture = installCoreMailCapture;
module.exports.routeCoreMailToProviderTemplate = routeCoreMailToProviderTemplate;
module.exports.adminForgotPasswordMail = adminForgotPasswordMail;
module.exports.sendAdminForgotPassword = sendAdminForgotPassword;
module.exports.emitProviderTemplateEvent = emitProviderTemplateEvent;
module.exports.checkCoreDesignsAtStart = checkCoreDesignsAtStart;
module.exports.uninstallEmailInterception = uninstallEmailInterception;
module.exports.purgeSensitiveLinkMappings = purgeSensitiveLinkMappings;
module.exports.WRAPPED = WRAPPED;
module.exports.logSecretFingerprints = logSecretFingerprints;
module.exports.migrateQueuePermissions = migrateQueuePermissions;
