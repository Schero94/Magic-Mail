'use strict';

const { isContentApiToken } = require('../utils/auth-strategy');

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
  if (isContentApiToken(policyContext)) return true;
  const strategy = policyContext?.state?.auth?.strategy?.name;
  const allowUserRoles =
    strapi?.config?.get?.('plugin::magic-mail.contentApi.allowUserRoles', false) === true;
  return allowUserRoles && strategy === 'users-permissions';
};

module.exports = {
  'api-token-only': apiTokenOnly,
};
