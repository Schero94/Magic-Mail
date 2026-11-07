'use strict';

const { getRestPrefix } = require('./services/analytics');
const { createWebhookRawBodyMiddleware } = require('./utils/webhook-raw-body');

module.exports = ({ strapi }) => {
  // Delivery webhooks are verified over the exact request bytes. This runs
  // before the global strapi::body parser, which is registered at bootstrap.
  strapi.server.use(
    createWebhookRawBodyMiddleware({ pathPrefix: `${getRestPrefix(strapi)}/magic-mail/webhooks/` })
  );

  strapi.admin.services.permission.actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Show MagicMail navigation',
      uid: 'access',
      subCategory: 'General',
      pluginName: 'magic-mail',
    },
    {
      section: 'plugins',
      displayName: 'Read MagicMail data',
      uid: 'read',
      subCategory: 'General',
      pluginName: 'magic-mail',
    },
    {
      section: 'plugins',
      displayName: 'Manage MagicMail configuration and content',
      uid: 'manage',
      subCategory: 'General',
      pluginName: 'magic-mail',
    },
    {
      section: 'plugins',
      displayName: 'Send MagicMail test messages',
      uid: 'test-send',
      subCategory: 'General',
      pluginName: 'magic-mail',
    },
  ]);
};
