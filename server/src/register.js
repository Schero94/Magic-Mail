'use strict';

module.exports = ({ strapi }) => {
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
