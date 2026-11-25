'use strict';

const { getRestPrefix } = require('./services/analytics');
const { createWebhookRawBodyMiddleware, DEFAULT_LIMIT_BYTES } = require('./utils/webhook-raw-body');
const contentTypes = require('./content-types');

/**
 * Keeps every Magic Mail content type out of the GraphQL schema (MM-SA-02).
 *
 * `@strapi/plugin-graphql` builds shadow CRUD queries and mutations for every
 * content type except `admin::` ones. Magic Mail's types are internal admin
 * data (email logs with recipients and subjects, events, link targets,
 * suppressions, templates, routing rules, settings, outbox): exposed, any
 * read-only API token could read them and a full-access token could change
 * them, bypassing the plugin's admin permissions. Must run in `register`,
 * before the GraphQL plugin builds its schema in `bootstrap`.
 *
 * @param {object} strapi
 * @returns {string[]} the content type uids that were disabled
 * @sideeffect Disables GraphQL shadow CRUD for `plugin::magic-mail.*`.
 */
const disableGraphqlShadowCrud = (strapi) => {
  const graphql = strapi.plugin?.('graphql');
  const extension = graphql?.service?.('extension');
  if (!extension || typeof extension.shadowCRUD !== 'function') return [];
  const uids = Object.keys(contentTypes).map((name) => `plugin::magic-mail.${name}`);
  for (const uid of uids) extension.shadowCRUD(uid).disable();
  return uids;
};

const register = ({ strapi }) => {
  disableGraphqlShadowCrud(strapi);

  // Delivery webhooks are verified over the exact request bytes. This runs
  // before the global strapi::body parser, which is registered at bootstrap.
  // The limit comes from the validated plugin config (webhooks.maxBodyBytes).
  strapi.server.use(
    createWebhookRawBodyMiddleware({
      pathPrefix: `${getRestPrefix(strapi)}/magic-mail/webhooks/`,
      limit: strapi.config.get('plugin::magic-mail.webhooks.maxBodyBytes', DEFAULT_LIMIT_BYTES),
    })
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
    {
      section: 'plugins',
      displayName: 'Read the outbox (queued, failed and uncertain mails)',
      uid: 'queue.read',
      subCategory: 'Outbox',
      pluginName: 'magic-mail',
    },
    {
      section: 'plugins',
      displayName: 'Retry, discard or resolve outbox mails',
      uid: 'queue.manage',
      subCategory: 'Outbox',
      pluginName: 'magic-mail',
    },
  ]);
};

module.exports = register;
module.exports.disableGraphqlShadowCrud = disableGraphqlShadowCrud;
