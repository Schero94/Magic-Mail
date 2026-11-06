'use strict';

/**
 * Content-API send routes accept API tokens only (SEC-07). A
 * users-permissions role (Authenticated/Public) that was granted
 * `controller.send` by mistake must not turn the plugin into a mail relay
 * for every end user. `config.contentApi.allowUserRoles: true` in the
 * plugin config restores the pre-4.0 behaviour.
 *
 * @param {import('koa').Context} policyContext
 * @param {object} _config
 * @param {{strapi: object}} deps
 * @returns {boolean}
 */
const apiTokenOnly = (policyContext, _config, { strapi }) => {
  const strategy = policyContext?.state?.auth?.strategy?.name;
  if (strategy === 'api-token') return true;
  const allowUserRoles = strapi?.config?.get?.('plugin::magic-mail.contentApi.allowUserRoles', false) === true;
  return allowUserRoles && strategy === 'users-permissions';
};

module.exports = {
  'api-token-only': apiTokenOnly,
};
