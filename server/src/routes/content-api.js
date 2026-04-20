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
 */

const sendRateLimit = [
  { name: 'plugin::magic-mail.rate-limit', config: { max: 60, window: 60_000 } },
];

const trackRateLimit = [
  { name: 'plugin::magic-mail.rate-limit', config: { max: 300, window: 60_000 } },
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
        middlewares: sendRateLimit,
        description: 'Send email via MagicMail router (requires API token)',
      },
    },

    // ============= UNIFIED MESSAGE ROUTE =============
    {
      method: 'POST',
      path: '/send-message',
      handler: 'controller.sendMessage',
      config: {
        middlewares: sendRateLimit,
        description: 'Send message via Email or WhatsApp (requires API token)',
      },
    },

    // ============= WHATSAPP ROUTES =============
    {
      method: 'POST',
      path: '/send-whatsapp',
      handler: 'controller.sendWhatsApp',
      config: {
        middlewares: sendRateLimit,
        description: 'Send WhatsApp message (requires API token)',
      },
    },
    {
      method: 'GET',
      path: '/whatsapp/status',
      handler: 'controller.getWhatsAppStatus',
      config: {
        description: 'Get WhatsApp connection status (requires API token)',
      },
    },
    {
      method: 'GET',
      path: '/whatsapp/check/:phoneNumber',
      handler: 'controller.checkWhatsAppNumber',
      config: {
        middlewares: [
          { name: 'plugin::magic-mail.rate-limit', config: { max: 30, window: 60_000 } },
        ],
        description: 'Check if phone number is on WhatsApp (requires API token)',
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
