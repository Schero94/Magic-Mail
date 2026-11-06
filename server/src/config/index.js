'use strict';

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
  },
  validator(config) {
    if (config?.contentApi !== undefined) {
      if (typeof config.contentApi !== 'object' || config.contentApi === null) {
        throw new Error('[magic-mail] config.contentApi must be an object');
      }
      if (config.contentApi.allowUserRoles !== undefined && typeof config.contentApi.allowUserRoles !== 'boolean') {
        throw new Error('[magic-mail] config.contentApi.allowUserRoles must be a boolean');
      }
    }
    if (config?.tracking !== undefined) {
      const tracking = config.tracking;
      if (typeof tracking !== 'object' || tracking === null || Array.isArray(tracking)) {
        throw new Error('[magic-mail] config.tracking must be an object');
      }
      for (const key of ['eventRetentionDays', 'linkTtlDays', 'logRetentionDays', 'maxLinksPerEmail']) {
        const value = tracking[key];
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          throw new Error(`[magic-mail] config.tracking.${key} must be a non-negative integer`);
        }
      }
      if (tracking.allowedLinkHosts !== undefined && (
        !Array.isArray(tracking.allowedLinkHosts)
        || tracking.allowedLinkHosts.some((host) => typeof host !== 'string' || !host.trim())
      )) {
        throw new Error('[magic-mail] config.tracking.allowedLinkHosts must be an array of host names');
      }
      if (tracking.anonymizeIp !== undefined && typeof tracking.anonymizeIp !== 'boolean') {
        throw new Error('[magic-mail] config.tracking.anonymizeIp must be a boolean');
      }
    }
    if (config?.quotaTimezone !== undefined) {
      try {
        // eslint-disable-next-line no-new
        new Intl.DateTimeFormat('en-US', { timeZone: config.quotaTimezone });
      } catch {
        throw new Error('[magic-mail] config.quotaTimezone must be a valid IANA time zone');
      }
    }
  },
};
