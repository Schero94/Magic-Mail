'use strict';

/**
 * Content-API routes for magic-mail.
 *
 * Every send endpoint is protected with the plugin's in-memory rate-limit
 * middleware to contain damage from a leaked API token or an over-eager
 * integration. Tracking endpoints (pixel, click) stay public — they are
 * triggered from e-mail clients that cannot carry a bearer token — and
 * the click handler resolves target URLs from the database, not from the
 * query, so they are not an open-redirect vector.
 *
 * The tracking limit degrades instead of blocking: over 300 requests per
 * minute and IP, opens and clicks are no longer recorded, but recipients
 * still get the pixel and the redirect (mail proxies and corporate NAT put
 * many recipients behind one IP). Only abusive rates (10x) get a 429.
 */

// Only API tokens may send unless `contentApi.allowUserRoles` is true
// (checked again in the controller, which also attributes the email log).
const sendPolicies = () => ['plugin::magic-mail.api-token-only'];

// One aggregate sending budget shared across the two email send routes.
const sendRateLimit = [
  { name: 'plugin::magic-mail.rate-limit', config: { bucket: 'send', max: 60, window: 60_000 } },
];

const trackRateLimit = [
  {
    name: 'plugin::magic-mail.rate-limit',
    config: { bucket: 'tracking', max: 300, window: 60_000, degrade: true, hardMax: 3_000 },
  },
];

module.exports = {
  type: 'content-api',
  routes: [
    // ============= EMAIL ROUTES =============
    {
      method: 'POST',
      path: '/send',
      handler: 'controller.send',
      config: {
        policies: sendPolicies(),
        middlewares: sendRateLimit,
        description: 'Send email via MagicMail router (requires API token)',
      },
    },

    // ============= EMAIL MESSAGE ROUTE =============
    {
      method: 'POST',
      path: '/send-message',
      handler: 'controller.sendMessage',
      config: {
        policies: sendPolicies(),
        middlewares: sendRateLimit,
        description: 'Send email through the MagicMail router (requires API token)',
      },
    },

    // ============= TRACKING ROUTES =============
    {
      method: 'GET',
      path: '/track/open/:emailId/:recipientHash',
      handler: 'analytics.trackOpen',
      config: {
        policies: [],
        auth: false,
        middlewares: trackRateLimit,
        description: 'Track email open (tracking pixel)',
      },
    },
    {
      method: 'GET',
      path: '/track/click/:emailId/:linkHash/:recipientHash',
      handler: 'analytics.trackClick',
      config: {
        policies: [],
        auth: false,
        middlewares: trackRateLimit,
        description: 'Track link click and redirect',
      },
    },
  ],
};
