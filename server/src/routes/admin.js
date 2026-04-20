'use strict';

/**
 * Admin API routes for magic-mail.
 *
 * SECURITY MODEL
 * --------------
 * Every admin route is gated by the two-step policy chain returned from
 * `adminPolicy()`:
 *
 *   1. `admin::isAuthenticatedAdmin`
 *        Requires a valid admin JWT (blocks anonymous callers and
 *        end-user Content-API tokens).
 *
 *   2. `admin::hasPermissions` with `plugin::magic-mail.access`
 *        Requires the caller to actually hold the plugin-access
 *        permission. Super-Admin gets it automatically; other admin
 *        roles only gain access if a Super-Admin explicitly grants the
 *        permission in Settings → Administration Panel → Roles →
 *        Plugins → Magic Mail.
 *
 * Exception: the 3 OAuth callback endpoints must stay public because
 * the upstream OAuth provider (Google / Microsoft / Yahoo) performs a
 * redirect back to us and cannot attach a bearer token. Those routes
 * are secured via the signed, single-use `state` parameter that the
 * callback verifies server-side — no admin JWT needed.
 */

const PLUGIN_ACCESS_ACTION = 'plugin::magic-mail.access';

/**
 * Fresh array per call because Strapi mutates policy arrays during
 * boot, and sharing one instance across routes would leak config
 * between them.
 *
 * @returns {Array<string|object>}
 */
const adminPolicy = () => [
  'admin::isAuthenticatedAdmin',
  {
    name: 'admin::hasPermissions',
    config: { actions: [PLUGIN_ACCESS_ACTION] },
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
        policies: adminPolicy(),
        description: 'Get all email accounts',
      },
    },
    {
      method: 'GET',
      path: '/accounts/:accountId',
      handler: 'accounts.getOne',
      config: {
        policies: adminPolicy(),
        description: 'Get single email account with decrypted config',
      },
    },
    {
      method: 'POST',
      path: '/accounts',
      handler: 'accounts.create',
      config: {
        policies: adminPolicy(),
        description: 'Create email account',
      },
    },
    {
      method: 'PUT',
      path: '/accounts/:accountId',
      handler: 'accounts.update',
      config: {
        policies: adminPolicy(),
        description: 'Update email account',
      },
    },
    {
      method: 'POST',
      path: '/accounts/:accountId/test',
      handler: 'accounts.test',
      config: {
        policies: adminPolicy(),
        description: 'Test email account',
      },
    },
    {
      method: 'POST',
      path: '/test-strapi-service',
      handler: 'accounts.testStrapiService',
      config: {
        policies: adminPolicy(),
        description: 'Test Strapi Email Service integration (MagicMail intercept)',
      },
    },
    {
      method: 'DELETE',
      path: '/accounts/:accountId',
      handler: 'accounts.delete',
      config: {
        policies: adminPolicy(),
        description: 'Delete email account',
      },
    },

    // ─────────────────────── Routing Rules ───────────────────────
    {
      method: 'GET',
      path: '/routing-rules',
      handler: 'routingRules.getAll',
      config: {
        policies: adminPolicy(),
        description: 'Get all routing rules',
      },
    },
    {
      method: 'GET',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.getOne',
      config: {
        policies: adminPolicy(),
        description: 'Get single routing rule',
      },
    },
    {
      method: 'POST',
      path: '/routing-rules',
      handler: 'routingRules.create',
      config: {
        policies: adminPolicy(),
        description: 'Create routing rule',
      },
    },
    {
      method: 'PUT',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.update',
      config: {
        policies: adminPolicy(),
        description: 'Update routing rule',
      },
    },
    {
      method: 'DELETE',
      path: '/routing-rules/:ruleId',
      handler: 'routingRules.delete',
      config: {
        policies: adminPolicy(),
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
        policies: adminPolicy(),
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
        policies: adminPolicy(),
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
        policies: adminPolicy(),
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
        policies: adminPolicy(),
        description: 'Create account from OAuth',
      },
    },

    // ─────────────────────── License ───────────────────────
    {
      method: 'GET',
      path: '/license/status',
      handler: 'license.getStatus',
      config: {
        policies: adminPolicy(),
        description: 'Get license status',
      },
    },
    {
      method: 'POST',
      path: '/license/auto-create',
      handler: 'license.autoCreate',
      config: {
        policies: adminPolicy(),
        description: 'Auto-create license with admin user data',
      },
    },
    {
      method: 'POST',
      path: '/license/store-key',
      handler: 'license.storeKey',
      config: {
        policies: adminPolicy(),
        description: 'Store and validate existing license key',
      },
    },
    {
      method: 'GET',
      path: '/license/limits',
      handler: 'license.getLimits',
      config: {
        policies: adminPolicy(),
        description: 'Get license limits and available features',
      },
    },
    {
      method: 'GET',
      path: '/license/debug',
      handler: 'license.debugLicense',
      config: {
        policies: adminPolicy(),
        description: 'Debug license data',
      },
    },

    // ─────────────────────── Email Designer ───────────────────────
    {
      method: 'GET',
      path: '/designer/templates',
      handler: 'emailDesigner.findAll',
      config: {
        policies: adminPolicy(),
        description: 'Get all email templates',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.findOne',
      config: {
        policies: adminPolicy(),
        description: 'Get email template by ID',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates',
      handler: 'emailDesigner.create',
      config: {
        policies: adminPolicy(),
        description: 'Create email template',
      },
    },
    {
      method: 'PUT',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.update',
      config: {
        policies: adminPolicy(),
        description: 'Update email template',
      },
    },
    {
      method: 'DELETE',
      path: '/designer/templates/:id',
      handler: 'emailDesigner.delete',
      config: {
        policies: adminPolicy(),
        description: 'Delete email template',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id/versions',
      handler: 'emailDesigner.getVersions',
      config: {
        policies: adminPolicy(),
        description: 'Get template versions',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/:versionId/restore',
      handler: 'emailDesigner.restoreVersion',
      config: {
        policies: adminPolicy(),
        description: 'Restore template from version',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/:versionId/delete',
      handler: 'emailDesigner.deleteVersion',
      config: {
        policies: adminPolicy(),
        description: 'Delete a single version',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/versions/delete-all',
      handler: 'emailDesigner.deleteAllVersions',
      config: {
        policies: adminPolicy(),
        description: 'Delete all versions for a template',
      },
    },
    {
      method: 'POST',
      path: '/designer/render/:templateReferenceId',
      handler: 'emailDesigner.renderTemplate',
      config: {
        policies: adminPolicy(),
        description: 'Render template with data',
      },
    },
    {
      method: 'POST',
      path: '/designer/export',
      handler: 'emailDesigner.exportTemplates',
      config: {
        policies: adminPolicy(),
        description: 'Export templates (ADVANCED+)',
      },
    },
    {
      method: 'POST',
      path: '/designer/import',
      handler: 'emailDesigner.importTemplates',
      config: {
        policies: adminPolicy(),
        description: 'Import templates (ADVANCED+)',
      },
    },
    {
      method: 'GET',
      path: '/designer/stats',
      handler: 'emailDesigner.getStats',
      config: {
        policies: adminPolicy(),
        description: 'Get template statistics',
      },
    },
    {
      method: 'GET',
      path: '/designer/core/:coreEmailType',
      handler: 'emailDesigner.getCoreTemplate',
      config: {
        policies: adminPolicy(),
        description: 'Get core email template',
      },
    },
    {
      method: 'PUT',
      path: '/designer/core/:coreEmailType',
      handler: 'emailDesigner.updateCoreTemplate',
      config: {
        policies: adminPolicy(),
        description: 'Update core email template',
      },
    },
    {
      method: 'GET',
      path: '/designer/templates/:id/download',
      handler: 'emailDesigner.download',
      config: {
        policies: adminPolicy(),
        description: 'Download template as HTML or JSON',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/duplicate',
      handler: 'emailDesigner.duplicate',
      config: {
        policies: adminPolicy(),
        description: 'Duplicate template',
      },
    },
    {
      method: 'POST',
      path: '/designer/templates/:id/test-send',
      handler: 'emailDesigner.testSend',
      config: {
        policies: adminPolicy(),
        description: 'Send test email for template',
      },
    },

    // ─────────────────────── Analytics & Tracking ───────────────────────
    {
      method: 'GET',
      path: '/analytics/stats',
      handler: 'analytics.getStats',
      config: {
        policies: adminPolicy(),
        description: 'Get analytics statistics',
      },
    },
    {
      method: 'GET',
      path: '/analytics/emails',
      handler: 'analytics.getEmailLogs',
      config: {
        policies: adminPolicy(),
        description: 'Get email logs',
      },
    },
    {
      method: 'GET',
      path: '/analytics/emails/:emailId',
      handler: 'analytics.getEmailDetails',
      config: {
        policies: adminPolicy(),
        description: 'Get email details',
      },
    },
    {
      method: 'GET',
      path: '/analytics/users/:userId',
      handler: 'analytics.getUserActivity',
      config: {
        policies: adminPolicy(),
        description: 'Get user email activity',
      },
    },
    {
      method: 'GET',
      path: '/analytics/debug',
      handler: 'analytics.debug',
      config: {
        policies: adminPolicy(),
        description: 'Debug analytics state',
      },
    },
    {
      method: 'DELETE',
      path: '/analytics/emails/:emailId',
      handler: 'analytics.deleteEmailLog',
      config: {
        policies: adminPolicy(),
        description: 'Delete single email log',
      },
    },
    {
      method: 'DELETE',
      path: '/analytics/emails',
      handler: 'analytics.clearAllEmailLogs',
      config: {
        policies: adminPolicy(),
        description: 'Clear all email logs',
      },
    },

    // ─────────────────────── Test (Dev) ───────────────────────
    {
      method: 'POST',
      path: '/test/relations',
      handler: 'test.testRelations',
      config: {
        policies: adminPolicy(),
        description: 'Test template-version relations',
      },
    },

    // ─────────────────────── WhatsApp ───────────────────────
    {
      method: 'GET',
      path: '/whatsapp/available',
      handler: 'whatsapp.checkAvailable',
      config: {
        policies: adminPolicy(),
        description: 'Check if WhatsApp/Baileys is available',
      },
    },
    {
      method: 'GET',
      path: '/whatsapp/status',
      handler: 'whatsapp.getStatus',
      config: {
        policies: adminPolicy(),
        description: 'Get WhatsApp connection status',
      },
    },
    {
      method: 'POST',
      path: '/whatsapp/connect',
      handler: 'whatsapp.connect',
      config: {
        policies: adminPolicy(),
        description: 'Connect to WhatsApp (generates QR if needed)',
      },
    },
    {
      method: 'POST',
      path: '/whatsapp/disconnect',
      handler: 'whatsapp.disconnect',
      config: {
        policies: adminPolicy(),
        description: 'Disconnect from WhatsApp',
      },
    },
    {
      method: 'POST',
      path: '/whatsapp/send-test',
      handler: 'whatsapp.sendTest',
      config: {
        policies: adminPolicy(),
        description: 'Send a test WhatsApp message',
      },
    },
    {
      method: 'POST',
      path: '/whatsapp/send-template',
      handler: 'whatsapp.sendTemplateMessage',
      config: {
        policies: adminPolicy(),
        description: 'Send WhatsApp message using template',
      },
    },
    {
      method: 'POST',
      path: '/whatsapp/check-number',
      handler: 'whatsapp.checkNumber',
      config: {
        policies: adminPolicy(),
        description: 'Check if phone number is on WhatsApp',
      },
    },
    {
      method: 'GET',
      path: '/whatsapp/templates',
      handler: 'whatsapp.getTemplates',
      config: {
        policies: adminPolicy(),
        description: 'Get all WhatsApp message templates',
      },
    },
    {
      method: 'POST',
      path: '/whatsapp/templates',
      handler: 'whatsapp.saveTemplate',
      config: {
        policies: adminPolicy(),
        description: 'Save a WhatsApp message template',
      },
    },
    {
      method: 'DELETE',
      path: '/whatsapp/templates/:templateName',
      handler: 'whatsapp.deleteTemplate',
      config: {
        policies: adminPolicy(),
        description: 'Delete a WhatsApp message template',
      },
    },
    {
      method: 'GET',
      path: '/whatsapp/session',
      handler: 'whatsapp.getSession',
      config: {
        policies: adminPolicy(),
        description: 'Get WhatsApp session info',
      },
    },

    // ─────────────────────── Plugin Settings ───────────────────────
    {
      method: 'GET',
      path: '/settings',
      handler: 'pluginSettings.getSettings',
      config: {
        policies: adminPolicy(),
        description: 'Get plugin settings',
      },
    },
    {
      method: 'PUT',
      path: '/settings',
      handler: 'pluginSettings.updateSettings',
      config: {
        policies: adminPolicy(),
        description: 'Update plugin settings',
      },
    },
  ],
};
