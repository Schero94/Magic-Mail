'use strict';

const MAX_PAYLOAD_CEILING = 20 * 1024 * 1024;

/**
 * Validates `config.queue` (send queue). Unknown keys are ignored like the
 * rest of the plugin config.
 *
 * @param {*} queue
 * @throws {Error} On an invalid value
 */
function validateQueueConfig(queue) {
  if (typeof queue !== 'object' || queue === null || Array.isArray(queue)) {
    throw new Error('[magic-mail] config.queue must be an object');
  }
  if (queue.worker !== undefined && typeof queue.worker !== 'boolean') {
    throw new Error('[magic-mail] config.queue.worker must be a boolean');
  }
  const ranges = {
    pollIntervalMs: [1_000, 3_600_000],
    batchSize: [1, 100],
    concurrency: [1, 20],
    leaseMs: [30_000, 3_600_000],
    maxAgeHours: [1, 24 * 30],
    maxPayloadBytes: [1024, MAX_PAYLOAD_CEILING],
    maxDispatchPerMinute: [1, 100_000],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = queue[key];
    if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
      throw new Error(`[magic-mail] config.queue.${key} must be an integer from ${min} to ${max}`);
    }
  }
  if (
    queue.backoffMs !== undefined &&
    (!Array.isArray(queue.backoffMs) ||
      queue.backoffMs.length === 0 ||
      queue.backoffMs.length > 10 ||
      queue.backoffMs.some((v) => !Number.isInteger(v) || v < 1_000 || v > 86_400_000))
  ) {
    throw new Error(
      '[magic-mail] config.queue.backoffMs must be 1-10 integers from 1000 to 86400000'
    );
  }
  if (
    queue.jitterRatio !== undefined &&
    (typeof queue.jitterRatio !== 'number' || queue.jitterRatio < 0 || queue.jitterRatio > 0.9)
  ) {
    throw new Error('[magic-mail] config.queue.jitterRatio must be a number from 0 to 0.9');
  }
  if (queue.retention !== undefined) {
    const retention = queue.retention;
    if (typeof retention !== 'object' || retention === null || Array.isArray(retention)) {
      throw new Error('[magic-mail] config.queue.retention must be an object');
    }
    for (const key of ['sentDays', 'unresolvedDays', 'rowDays']) {
      const value = retention[key];
      if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 3650)) {
        throw new Error(`[magic-mail] config.queue.retention.${key} must be 1-3650 days`);
      }
    }
  }
}

module.exports = {
  default: {
    // Enable debug logging (set to true to see info/debug plugin logs;
    // warnings and errors are always logged).
    debug: false,
    contentApi: {
      // Content-API send routes (/api/magic-mail/send, /send-message) accept
      // API tokens only. Set to true to also let users-permissions roles send
      // (pre-4.0 behaviour); their emails are attributed to the sending user.
      allowUserRoles: false,
    },
    designer: {
      // Optional Unlayer project id. Unset by default so no third-party
      // project receives your template edits.
      projectId: null,
      // Optional https URL of the Unlayer loader (e.g. a self-hosted, vetted
      // copy). Unset: the admin uses https://editor.unlayer.com/embed.js?2.
      scriptUrl: null,
      // Optional exact Unlayer editor build ("1.524.0"). Unset: the version
      // pinned in the admin bundle.
      version: null,
    },
    rateLimit: {
      // Where request counters live. 'database' (default) shares them across
      // every process through the Strapi database, so the limits hold with
      // several replicas or pm2 workers. 'redis' uses `rateLimit.redis` (an
      // ioredis or node-redis v4+ client you create) and falls back to the
      // database on errors. 'memory' counts per process (single instance).
      store: 'database',
      // Key prefix for the redis store.
      redisPrefix: 'magic-mail:rl:',
    },
    // IANA time zone for hourly/daily account quota windows.
    quotaTimezone: 'UTC',
    tracking: {
      // Days raw open/click events (anonymised IP, user agent) are kept.
      // 0 keeps them forever.
      eventRetentionDays: 90,
      // Days a tracked link keeps redirecting. Expired links show the
      // fallback page and their stored destination is deleted. 0 = forever.
      linkTtlDays: 180,
      // Days email log rows are kept (with their events and links).
      // 0 keeps them forever.
      logRetentionDays: 0,
      // Maximum number of distinct links rewritten per email; the rest
      // stay untracked.
      maxLinksPerEmail: 100,
      // Destination hosts (and their subdomains) that may be click-tracked.
      // Empty: every host for admin/service/native sends, NONE for
      // Content-API sends (an API token must not mint redirects to
      // arbitrary sites on your domain).
      allowedLinkHosts: [],
      // Store open/click IPs truncated to /24 (IPv4) or /48 (IPv6).
      anonymizeIp: true,
    },
    // Send queue (outbox). Off unless a send passes `queue: true` or the
    // "Queue failed sends" setting is on. See README "Retries and the outbox".
    queue: {
      // false: this process never dispatches queued mail (e.g. web-only replicas).
      worker: true,
      // Poll interval plus random jitter of up to half of it.
      pollIntervalMs: 10_000,
      // Rows claimed per poll and parallel sends per process.
      batchSize: 5,
      concurrency: 2,
      // Visibility timeout of a claim; must exceed the bounded send time.
      leaseMs: 180_000,
      // Delay before retry 1, 2, 3 (+/- jitterRatio).
      backoffMs: [60_000, 300_000, 900_000],
      jitterRatio: 0.2,
      // Queued mail older than this is never sent (status failed, EXPIRED).
      maxAgeHours: 24,
      // Largest prepared message (JSON, before encryption) that is queued.
      maxPayloadBytes: 10 * 1024 * 1024,
      // Queue dispatches per minute across every process.
      maxDispatchPerMinute: 120,
      retention: {
        // Days sent rows are kept, days failed/uncertain rows keep their
        // message (so they can still be retried), days any row is kept.
        sentDays: 7,
        unresolvedDays: 14,
        rowDays: 30,
      },
    },
  },
  validator(config) {
    if (config?.contentApi !== undefined) {
      if (typeof config.contentApi !== 'object' || config.contentApi === null) {
        throw new Error('[magic-mail] config.contentApi must be an object');
      }
      if (
        config.contentApi.allowUserRoles !== undefined &&
        typeof config.contentApi.allowUserRoles !== 'boolean'
      ) {
        throw new Error('[magic-mail] config.contentApi.allowUserRoles must be a boolean');
      }
    }
    if (config?.tracking !== undefined) {
      const tracking = config.tracking;
      if (typeof tracking !== 'object' || tracking === null || Array.isArray(tracking)) {
        throw new Error('[magic-mail] config.tracking must be an object');
      }
      for (const key of [
        'eventRetentionDays',
        'linkTtlDays',
        'logRetentionDays',
        'maxLinksPerEmail',
      ]) {
        const value = tracking[key];
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          throw new Error(`[magic-mail] config.tracking.${key} must be a non-negative integer`);
        }
      }
      if (
        tracking.allowedLinkHosts !== undefined &&
        (!Array.isArray(tracking.allowedLinkHosts) ||
          tracking.allowedLinkHosts.some((host) => typeof host !== 'string' || !host.trim()))
      ) {
        throw new Error(
          '[magic-mail] config.tracking.allowedLinkHosts must be an array of host names'
        );
      }
      if (tracking.anonymizeIp !== undefined && typeof tracking.anonymizeIp !== 'boolean') {
        throw new Error('[magic-mail] config.tracking.anonymizeIp must be a boolean');
      }
    }
    if (config?.designer !== undefined) {
      const designer = config.designer;
      if (typeof designer !== 'object' || designer === null || Array.isArray(designer)) {
        throw new Error('[magic-mail] config.designer must be an object');
      }
      if (
        designer.projectId != null &&
        !(Number.isSafeInteger(designer.projectId) && designer.projectId > 0)
      ) {
        throw new Error('[magic-mail] config.designer.projectId must be a positive integer');
      }
      if (designer.scriptUrl != null) {
        let url;
        try {
          url = new URL(designer.scriptUrl);
        } catch {
          url = null;
        }
        if (!url || url.protocol !== 'https:' || url.username || url.password) {
          throw new Error('[magic-mail] config.designer.scriptUrl must be an https URL');
        }
      }
      if (
        designer.version != null &&
        !(typeof designer.version === 'string' && /^\d+\.\d+\.\d+$/.test(designer.version))
      ) {
        throw new Error(
          '[magic-mail] config.designer.version must be an exact version such as "1.524.0"'
        );
      }
    }
    if (config?.rateLimit !== undefined) {
      const rateLimit = config.rateLimit;
      if (typeof rateLimit !== 'object' || rateLimit === null || Array.isArray(rateLimit)) {
        throw new Error('[magic-mail] config.rateLimit must be an object');
      }
      if (
        rateLimit.store !== undefined &&
        !['database', 'redis', 'memory'].includes(rateLimit.store)
      ) {
        throw new Error(
          "[magic-mail] config.rateLimit.store must be 'database', 'redis' or 'memory'"
        );
      }
      if (rateLimit.store === 'redis') {
        const client = rateLimit.redis;
        const hasIncr =
          client && (typeof client.incrby === 'function' || typeof client.incrBy === 'function');
        const hasExpire =
          client && (typeof client.pexpire === 'function' || typeof client.pExpire === 'function');
        if (!hasIncr || !hasExpire) {
          throw new Error(
            "[magic-mail] config.rateLimit.redis must be an ioredis or node-redis client when store is 'redis'"
          );
        }
      }
      if (rateLimit.redisPrefix !== undefined && typeof rateLimit.redisPrefix !== 'string') {
        throw new Error('[magic-mail] config.rateLimit.redisPrefix must be a string');
      }
    }
    if (config?.queue !== undefined) validateQueueConfig(config.queue);
    if (config?.quotaTimezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: config.quotaTimezone });
      } catch {
        throw new Error('[magic-mail] config.quotaTimezone must be a valid IANA time zone');
      }
    }
  },
};
