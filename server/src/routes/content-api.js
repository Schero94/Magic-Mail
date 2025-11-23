'use strict';

module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/send',
      handler: 'controller.send',
      config: {
        auth: false, // Can be called from anywhere
        description: 'Send email via MagicMail router',
      },
    },
    // Public tracking endpoints (no auth required!)
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
