import pluginId from './pluginId';

/**
 * Admin RBAC actions registered by the server (server/src/register.js).
 * - access: plugin menu entry
 * - read: view accounts, rules, templates, logs and settings
 * - manage: create, update and delete
 * - test-send: send test emails
 * - queue.read: see the outbox (queued, failed and uncertain mails)
 * - queue.manage: retry, discard or resolve outbox mails
 *
 * UI code reads capabilities through useMagicMailRBAC(); only route-level
 * <Page.Protect> and menu/settings registration use these arrays directly.
 */
const pluginPermissions = {
  access: [{ action: `plugin::${pluginId}.access`, subject: null }],
  read: [{ action: `plugin::${pluginId}.read`, subject: null }],
  manage: [{ action: `plugin::${pluginId}.manage`, subject: null }],
  testSend: [{ action: `plugin::${pluginId}.test-send`, subject: null }],
  queueRead: [{ action: `plugin::${pluginId}.queue.read`, subject: null }],
  queueManage: [{ action: `plugin::${pluginId}.queue.manage`, subject: null }],
};

export default pluginPermissions;
