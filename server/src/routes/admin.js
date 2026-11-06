'use strict';

/**
 * Admin API routes for magic-mail.
 *
 * SECURITY MODEL
 * --------------
 * Every protected admin route is gated by the two-step policy chain returned
 * from `adminPolicy(capability)`:
 *
 *   1. `admin::isAuthenticatedAdmin`
 *        Requires a valid admin JWT (blocks anonymous callers and
 *        end-user Content-API tokens).
 *
 *   2. `admin::hasPermissions` with one route-specific capability:
 *        `read` for data retrieval, rendering and export; `manage` for
 *        configuration or content changes; `test-send` for test delivery.
 *        The `access` action is reserved for menu and page visibility.
 *
 * Exception: the 3 OAuth callback endpoints must stay public because
 * the upstream OAuth provider (Google / Microsoft / Yahoo) performs a
 * redirect back to us and cannot attach a bearer token. Those routes
 * are secured via the signed, single-use `state` parameter that the
 * callback verifies server-side — no admin JWT needed.
 */

const PLUGIN_ID = 'magic-mail';

/**
 * Fresh array per call because Strapi mutates policy arrays during
 * boot, and sharing one instance across routes would leak config
 * between them.
 *
 * @param {'read'|'manage'|'test-send'} capability
 * @returns {Array<string|object>}
 */
const adminPolicy = (capability) => [
  'admin::isAuthenticatedAdmin',
  {
    name: 'admin::hasPermissions',
    config: { actions: [`plugin::${PLUGIN_ID}.${capability}`] },
  },
];

module.exports = {
  type: 'admin',
  routes: [
    // ─────────────────────── Account Management ───────────────────────
    {
      method: 'GET',
      path: '/accounts',
      handler: 'accounts.getAll',
      config: {
        policies: adminPolicy('read'),
        description: 'Get all email accounts',
      },
    },
    {
      method: 'GET',
      path: '/accounts/:accountId',
      handler: 'accounts.getOne',
      config: {
        policies: adminPolicy('read'),
        description: 'Get single email account with decrypted config',
      },
    },
    {
      method: 'POST',
      path: '/accounts',
      handler: 'accounts.create',
      config: {
        policies: adminPolicy('manage'),
        description: 'Create email account',
      },
    },
    {
      method: 'PUT',
      path: '/accounts/:accountId',
      handler: 'accounts.update',
      config: {
        policies: adminPolicy('manage'),
        description: 'Update email account',
      },
    },
    {
      method: 'POST',
      path: '/accounts/:accountId/test',
      handler: 'accounts.test',
      config: {
        policies: adminPolicy('test-send'),
        description: 'Test email account',
      },
    },
    {
      method: 'POST',
      path: '/test-strapi-service',
      handler: 'accounts.testStrapiService',
      config: {
        policies: adminPolicy('test-send'),
        description: 'Test Strapi Email Service integration (MagicMail intercept)',
      },
    },
    {
      method: 'DELETE',
      path: '/accounts/:accountId',
      handler: 'accounts.delete',
      config: {
        policies: adminPolicy('manage'),
        description: 'Delete email account',
      },
    },

    // ─────────────────────── Routing Rules ───────────────────────
    {
      method: 'GET',
      path: '/routing-rules',
      handler: 'routingRules.getAll',
      config: {
        policies: adminPolicy('read'),
        description: 'Get all routing rules',
      },
    },
    {
      method: 'GET',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.getOne',
      config: {
        policies: adminPolicy('read'),
        description: 'Get single routing rule',
      },
    },
    {
      method: 'POST',
      path: '/routing-rules',
      handler: 'routingRules.create',
      config: {
        policies: adminPolicy('manage'),
        description: 'Create routing rule',
      },
    },
    {
      method: 'PUT',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.update',
      config: {
        policies: adminPolicy('manage'),
        description: 'Update routing rule',
      },
    },
    {
      method: 'DELETE',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.delete',
      config: {
        policies: adminPolicy('manage'),
        description: 'Delete routing rule',
      },
    },

    // ─────────────────────── OAuth – Gmail ───────────────────────
    // /auth endpoints are admin-only (they generate the OAuth URL for
    // the currently-authenticated admin). /callback MUST remain public
    // because Google/Microsoft/Yahoo can't send a bearer token on the
    // redirect — security is enforced by the signed single-use state.
    {
      method: 'GET',
      path: '/oauth/gmail/auth',
      handler: 'oauth.gmailAuth',
      config: {
        policies: adminPolicy('manage'),
        description: 'Initiate Gmail OAuth flow',
      },
    },
    {
      method: 'GET',
      path: '/oauth/gmail/callback',
      handler: 'oauth.gmailCallback',
      config: {
        auth: false, // Public callback - secured via signed state
        description: 'Gmail OAuth callback',
      },
    },

    // ─────────────────────── OAuth – Microsoft ───────────────────────
    {
      method: 'GET',
      path: '/oauth/microsoft/auth',
      handler: 'oauth.microsoftAuth',
      config: {
        policies: adminPolicy('manage'),
        description: 'Initiate Microsoft OAuth flow',
      },
    },
    {
      method: 'GET',
      path: '/oauth/microsoft/callback',
      handler: 'oauth.microsoftCallback',
      config: {
        auth: false, // Public callback - secured via signed state
        description: 'Microsoft OAuth callback',
      },
    },

    // ─────────────────────── OAuth – Yahoo ───────────────────────
    {
      method: 'GET',
      path: '/oauth/yahoo/auth',
      handler: 'oauth.yahooAuth',
      config: {
        policies: adminPolicy('manage'),
        description: 'Initiate Yahoo OAuth flow',
      },
    },
    {
      method: 'GET',
      path: '/oauth/yahoo/callback',
      handler: 'oauth.yahooCallback',
      config: {
        auth: false, // Public callback - secured via signed state
        description: 'Yahoo OAuth callback',
      },
    },

    // ─────────────────────── OAuth – Generic ───────────────────────
    {
      method: 'POST',
      path: '/oauth/create-account',
      handler: 'oauth.createOAuthAccount',
      config: {
        policies: adminPolicy('manage'),
        description: 'Create account from OAuth',
      },
    },

    // ─────────────────────── Email Designer ───────────────────────
    {
      method: 'GET',
      path: '/designer/templates',
      handler: 'emailDesigner.findAll',
      config: {
        policies: adminPolicy('read'),
        description: 'Get all email templates',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.findOne',
      config: {
        policies: adminPolicy('read'),
        description: 'Get email template by ID',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates',
      handler: 'emailDesigner.create',
      config: {
        policies: adminPolicy('manage'),
        description: 'Create email template',
      },
    },
    {
      method: 'PUT',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.update',
      config: {
        policies: adminPolicy('manage'),
        description: 'Update email template',
      },
    },
    {
      method: 'DELETE',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.delete',
      config: {
        policies: adminPolicy('manage'),
        description: 'Delete email template',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id/versions',
      handler: 'emailDesigner.getVersions',
      config: {
        policies: adminPolicy('read'),
        description: 'Get template versions',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/:versionId/restore',
      handler: 'emailDesigner.restoreVersion',
      config: {
        policies: adminPolicy('manage'),
        description: 'Restore template from version',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/:versionId/delete',
      handler: 'emailDesigner.deleteVersion',
      config: {
        policies: adminPolicy('manage'),
        description: 'Delete a single version',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/delete-all',
      handler: 'emailDesigner.deleteAllVersions',
      config: {
        policies: adminPolicy('manage'),
        description: 'Delete all versions for a template',
      },
    },
    {
      method: 'POST',
      path: '/designer/render/:templateReferenceId',
      handler: 'emailDesigner.renderTemplate',
      config: {
        policies: adminPolicy('read'),
        description: 'Render template with data',
      },
    },
    {
      method: 'POST',
      path: '/designer/export',
      handler: 'emailDesigner.exportTemplates',
      config: {
        policies: adminPolicy('read'),
        description: 'Export templates (ADVANCED+)',
      },
    },
    {
      method: 'POST',
      path: '/designer/import',
      handler: 'emailDesigner.importTemplates',
      config: {
        policies: adminPolicy('manage'),
        description: 'Import templates (ADVANCED+)',
      },
    },
    {
      method: 'GET',
      path: '/designer/stats',
      handler: 'emailDesigner.getStats',
      config: {
        policies: adminPolicy('read'),
        description: 'Get template statistics',
      },
    },
    {
      method: 'GET',
      path: '/designer/core/:coreEmailType',
      handler: 'emailDesigner.getCoreTemplate',
      config: {
        policies: adminPolicy('read'),
        description: 'Get core email template',
      },
    },
    {
      method: 'PUT',
      path: '/designer/core/:coreEmailType',
      handler: 'emailDesigner.updateCoreTemplate',
      config: {
        policies: adminPolicy('manage'),
        description: 'Update core email template',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id/download',
      handler: 'emailDesigner.download',
      config: {
        policies: adminPolicy('read'),
        description: 'Download template as HTML or JSON',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/duplicate',
      handler: 'emailDesigner.duplicate',
      config: {
        policies: adminPolicy('manage'),
        description: 'Duplicate template',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/test-send',
      handler: 'emailDesigner.testSend',
      config: {
        policies: adminPolicy('test-send'),
        description: 'Send test email for template',
      },
    },

    // ─────────────────────── Analytics & Tracking ───────────────────────
    {
      method: 'GET',
      path: '/analytics/stats',
      handler: 'analytics.getStats',
      config: {
        policies: adminPolicy('read'),
        description: 'Get analytics statistics',
      },
    },
    {
      method: 'GET',
      path: '/analytics/emails',
      handler: 'analytics.getEmailLogs',
      config: {
        policies: adminPolicy('read'),
        description: 'Get email logs',
      },
    },
    {
      method: 'GET',
      path: '/analytics/emails/:emailId',
      handler: 'analytics.getEmailDetails',
      config: {
        policies: adminPolicy('read'),
        description: 'Get email details',
      },
    },
    {
      method: 'GET',
      path: '/analytics/users/:userId',
      handler: 'analytics.getUserActivity',
      config: {
        policies: adminPolicy('read'),
        description: 'Get user email activity',
      },
    },
    {
      method: 'GET',
      path: '/analytics/debug',
      handler: 'analytics.debug',
      config: {
        policies: adminPolicy('read'),
        description: 'Debug analytics state',
      },
    },
    {
      method: 'DELETE',
      path: '/analytics/emails/:emailId',
      handler: 'analytics.deleteEmailLog',
      config: {
        policies: adminPolicy('manage'),
        description: 'Delete single email log',
      },
    },
    {
      method: 'DELETE',
      path: '/analytics/emails',
      handler: 'analytics.clearAllEmailLogs',
      config: {
        policies: adminPolicy('manage'),
        description: 'Clear all email logs',
      },
    },

    // ─────────────────────── Plugin Settings ───────────────────────
    {
      method: 'GET',
      path: '/settings',
      handler: 'pluginSettings.getSettings',
      config: {
        policies: adminPolicy('read'),
        description: 'Get plugin settings',
      },
    },
    {
      method: 'PUT',
      path: '/settings',
      handler: 'pluginSettings.updateSettings',
      config: {
        policies: adminPolicy('manage'),
        description: 'Update plugin settings',
      },
    },
  ],
};
