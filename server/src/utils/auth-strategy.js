'use strict';

/**
 * Names of Strapi's Content-API token auth strategy (`ctx.state.auth.strategy.name`).
 *
 * Strapi 5 renamed the strategy from `api-token` to `content-api-token`
 * when admin tokens (`admin-token`) were introduced; Strapi 5.57 to 5.61 ship
 * `@strapi/admin/server/src/strategies/content-api-token` with
 * `name: 'content-api-token'`. Both names are accepted so the send routes
 * work on every supported Strapi version. `admin-token` is deliberately not
 * accepted: admin tokens belong to the admin API, not the Content API.
 */
const CONTENT_API_TOKEN_STRATEGIES = Object.freeze(['content-api-token', 'api-token']);

/**
 * True when the request was authenticated with a Content-API token.
 *
 * @param {{state?: {auth?: {strategy?: {name?: string}}}}|undefined} ctx - Koa context or policy context
 * @returns {boolean}
 */
const isContentApiToken = (ctx) =>
  CONTENT_API_TOKEN_STRATEGIES.includes(ctx?.state?.auth?.strategy?.name);

module.exports = { CONTENT_API_TOKEN_STRATEGIES, isContentApiToken };
