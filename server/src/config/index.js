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
