'use strict';

module.exports = {
  type: 'admin',
  routes: [
    // Account Management
    {
      method: 'GET',
      path: '/accounts',
      handler: 'accounts.getAll',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get all email accounts',
      },
    },
    {
      method: 'GET',
      path: '/accounts/:accountId',
      handler: 'accounts.getOne',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get single email account with decrypted config',
      },
    },
    {
      method: 'POST',
      path: '/accounts',
      handler: 'accounts.create',
      config: {
        policies: [],
        auth: false,
        description: 'Create email account',
      },
    },
    {
      method: 'PUT',
      path: '/accounts/:accountId',
      handler: 'accounts.update',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Update email account',
      },
    },
    {
      method: 'POST',
      path: '/accounts/:accountId/test',
      handler: 'accounts.test',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Test email account',
      },
    },
    {
      method: 'POST',
      path: '/test-strapi-service',
      handler: 'accounts.testStrapiService',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Test Strapi Email Service integration (MagicMail intercept)',
      },
    },
    {
      method: 'DELETE',
      path: '/accounts/:accountId',
      handler: 'accounts.delete',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Delete email account',
      },
    },
    // Routing Rules
    {
      method: 'GET',
      path: '/routing-rules',
      handler: 'routingRules.getAll',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get all routing rules',
      },
    },
    {
      method: 'GET',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.getOne',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get single routing rule',
      },
    },
    {
      method: 'POST',
      path: '/routing-rules',
      handler: 'routingRules.create',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Create routing rule',
      },
    },
    {
      method: 'PUT',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.update',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Update routing rule',
      },
    },
    {
      method: 'DELETE',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.delete',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Delete routing rule',
      },
    },
    // OAuth Routes - Gmail
    {
      method: 'GET',
      path: '/oauth/gmail/auth',
      handler: 'oauth.gmailAuth',
      config: {
        policies: [],
        description: 'Initiate Gmail OAuth flow',
      },
    },
    {
      method: 'GET',
      path: '/oauth/gmail/callback',
      handler: 'oauth.gmailCallback',
      config: {
        auth: false, // Public callback
        description: 'Gmail OAuth callback',
      },
    },
    // OAuth Routes - Microsoft
    {
      method: 'GET',
      path: '/oauth/microsoft/auth',
      handler: 'oauth.microsoftAuth',
      config: {
        policies: [],
        description: 'Initiate Microsoft OAuth flow',
      },
    },
    {
      method: 'GET',
      path: '/oauth/microsoft/callback',
      handler: 'oauth.microsoftCallback',
      config: {
        auth: false, // Public callback
        description: 'Microsoft OAuth callback',
      },
    },
    // OAuth Routes - Yahoo
    {
      method: 'GET',
      path: '/oauth/yahoo/auth',
      handler: 'oauth.yahooAuth',
      config: {
        policies: [],
        description: 'Initiate Yahoo OAuth flow',
      },
    },
    {
      method: 'GET',
      path: '/oauth/yahoo/callback',
      handler: 'oauth.yahooCallback',
      config: {
        auth: false, // Public callback
        description: 'Yahoo OAuth callback',
      },
    },
    // OAuth Routes - Generic
    {
      method: 'POST',
      path: '/oauth/create-account',
      handler: 'oauth.createOAuthAccount',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Create account from OAuth',
      },
    },
    // License Routes
    {
      method: 'GET',
      path: '/license/status',
      handler: 'license.getStatus',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get license status',
      },
    },
    {
      method: 'POST',
      path: '/license/auto-create',
      handler: 'license.autoCreate',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Auto-create license with admin user data',
      },
    },
    {
      method: 'POST',
      path: '/license/store-key',
      handler: 'license.storeKey',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Store and validate existing license key',
      },
    },
    {
      method: 'GET',
      path: '/license/limits',
      handler: 'license.getLimits',
      config: {
        policies: [],
        description: 'Get license limits and available features',
      },
    },
    {
      method: 'GET',
      path: '/license/debug',
      handler: 'license.debugLicense',
      config: {
        policies: [],
        description: 'Debug license data',
      },
    },
    // Email Designer Routes
    {
      method: 'GET',
      path: '/designer/templates',
      handler: 'emailDesigner.findAll',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get all email templates',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.findOne',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get email template by ID',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates',
      handler: 'emailDesigner.create',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Create email template',
      },
    },
    {
      method: 'PUT',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.update',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Update email template',
      },
    },
    {
      method: 'DELETE',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.delete',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Delete email template',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id/versions',
      handler: 'emailDesigner.getVersions',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get template versions',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/:versionId/restore',
      handler: 'emailDesigner.restoreVersion',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Restore template from version',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/:versionId/delete',
      handler: 'emailDesigner.deleteVersion',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Delete a single version',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/delete-all',
      handler: 'emailDesigner.deleteAllVersions',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Delete all versions for a template',
      },
    },
    {
      method: 'POST',
      path: '/designer/render/:templateReferenceId',
      handler: 'emailDesigner.renderTemplate',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Render template with data',
      },
    },
    {
      method: 'POST',
      path: '/designer/export',
      handler: 'emailDesigner.exportTemplates',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Export templates (ADVANCED+)',
      },
    },
    {
      method: 'POST',
      path: '/designer/import',
      handler: 'emailDesigner.importTemplates',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Import templates (ADVANCED+)',
      },
    },
    {
      method: 'GET',
      path: '/designer/stats',
      handler: 'emailDesigner.getStats',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get template statistics',
      },
    },
    {
      method: 'GET',
      path: '/designer/core/:coreEmailType',
      handler: 'emailDesigner.getCoreTemplate',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get core email template',
      },
    },
    {
      method: 'PUT',
      path: '/designer/core/:coreEmailType',
      handler: 'emailDesigner.updateCoreTemplate',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Update core email template',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id/download',
      handler: 'emailDesigner.download',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Download template as HTML or JSON',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/duplicate',
      handler: 'emailDesigner.duplicate',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Duplicate template',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/test-send',
      handler: 'emailDesigner.testSend',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Send test email for template',
      },
    },
    // Analytics & Tracking
    {
      method: 'GET',
      path: '/analytics/stats',
      handler: 'analytics.getStats',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get analytics statistics',
      },
    },
    {
      method: 'GET',
      path: '/analytics/emails',
      handler: 'analytics.getEmailLogs',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get email logs',
      },
    },
    {
      method: 'GET',
      path: '/analytics/emails/:emailId',
      handler: 'analytics.getEmailDetails',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get email details',
      },
    },
    {
      method: 'GET',
      path: '/analytics/users/:userId',
      handler: 'analytics.getUserActivity',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Get user email activity',
      },
    },
    {
      method: 'GET',
      path: '/analytics/debug',
      handler: 'analytics.debug',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Debug analytics state',
      },
    },
    {
      method: 'DELETE',
      path: '/analytics/emails/:emailId',
      handler: 'analytics.deleteEmailLog',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Delete single email log',
      },
    },
    {
      method: 'DELETE',
      path: '/analytics/emails',
      handler: 'analytics.clearAllEmailLogs',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Clear all email logs',
      },
    },
    // Test Routes (Development)
    {
      method: 'POST',
      path: '/test/relations',
      handler: 'test.testRelations',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
        description: 'Test template-version relations',
      },
    },
  ],
};

