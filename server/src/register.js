'use strict';

module.exports = ({ strapi }) => {
  strapi.admin.services.permission.actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Access the MagicMail plugin',
      uid: 'access',
      pluginName: 'magic-mail',
    },
  ]);
};
