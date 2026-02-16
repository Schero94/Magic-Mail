'use strict';

module.exports = {
  type: 'content-api',
  routes: [
    // ============= EMAIL ROUTES =============
    {
      method: 'POST',
      path: '/send',
      handler: 'controller.send',
      config: {
        description: 'Send email via MagicMail router (requires API token)',
      },
    },

    // ============= UNIFIED MESSAGE ROUTE =============
    {
      method: 'POST',
      path: '/send-message',
      handler: 'controller.sendMessage',
      config: {
        description: 'Send message via Email or WhatsApp (requires API token)',
      },
    },

    // ============= WHATSAPP ROUTES =============
    {
      method: 'POST',
      path: '/send-whatsapp',
      handler: 'controller.sendWhatsApp',
      config: {
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
        description: 'Track link click and redirect',
      },
    },
  ],
};
