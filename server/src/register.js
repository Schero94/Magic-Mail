'use strict';

module.exports = ({ strapi }) => {
  strapi.admin.services.permission.actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Access the MagicMail plugin',
      uid: 'access',
      // Strapi 5's role editor only renders checkboxes for actions that
      // belong to a subCategory. Without this field the permission
      // exists but is invisible in Settings → Roles → Plugins →
      // MagicMail, so admins cannot grant or revoke it.
      subCategory: 'General',
      pluginName: 'magic-mail',
    },
  ]);
};
