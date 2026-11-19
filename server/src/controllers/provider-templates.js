'use strict';

const { canonicalLocale } = require('../utils/locale');

/**
 * Admin API for provider templates (SendGrid dynamic templates, Mailgun
 * templates): list and sync, preview, test send, local fallback, copy as a
 * Magic Mail template, "Convert for provider" and the core-mail design.
 *
 * Every route is an admin route (`admin::isAuthenticatedAdmin` plus the
 * capability named in its `@auth` tag, see routes/admin.js). Provider calls
 * are read-only; nothing is ever written to SendGrid or Mailgun.
 */

const { errors } = require('@strapi/utils');
const { validate, handleControllerError } = require('../validation');
const { toClientSendMessage, describeErrorForLog } = require('../utils/client-errors');

/**
 * Validates the `:key` route parameter.
 *
 * @param {import('koa').Context} ctx
 * @returns {string}
 * @throws {errors.ValidationError}
 */
const keyParam = (ctx) => {
  let raw = ctx.params?.key;
  try {
    raw = decodeURIComponent(String(raw ?? ''));
  } catch {
    raw = '';
  }
  return validate('providerTemplates.key', { key: raw }).key;
};

module.exports = ({ strapi }) => {
  const service = () => strapi.plugin('magic-mail').service('provider-templates');
  return {
    /**
     * Lists provider accounts and synced templates.
     *
     * @route GET /magic-mail/provider-templates
     * @auth Admin JWT + plugin::magic-mail.read
     * @param {import('koa').Context} ctx
     * @returns {Promise<void>} 200 `{ data: { enabled, accounts, templates, lastSyncedAt, stale } }`;
     *   `enabled` is false without a SendGrid or Mailgun account.
     */
    async list(ctx) {
      try {
        ctx.body = { data: await service().overview() };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Provider templates could not be listed');
      }
    },

    /**
     * Reads the templates of every SendGrid and Mailgun account (read-only at
     * the provider) and stores them.
     *
     * @route POST /magic-mail/provider-templates/sync
     * @auth Admin JWT + plugin::magic-mail.read, rate limited per admin
     * @param {import('koa').Context} ctx - body `{ force?: boolean }`; force
     *   re-reads even when the last sync is younger than 10 minutes
     * @returns {Promise<void>} 200 overview (as list); per-account provider
     *   failures are reported in `accounts[].error`, never as a 5xx
     * @sideeffect Calls the provider APIs; creates, updates and deletes
     *   provider-template rows.
     */
    async sync(ctx) {
      try {
        const { force } = validate('providerTemplates.sync', ctx.request.body || {});
        ctx.body = { data: await service().sync({ force: force === true }) };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Provider template sync failed');
      }
    },

    /**
     * One template with preview HTML, detected variables, sample data and the
     * copy warnings.
     *
     * @route GET /magic-mail/provider-templates/:key
     * @auth Admin JWT + plugin::magic-mail.read
     * @param {import('koa').Context} ctx - `ctx.params.key` `<provider>:<slug>`
     * @returns {Promise<void>} 200 `{ data }`; 400 invalid key; 404 unknown key
     */
    async findOne(ctx) {
      try {
        ctx.body = { data: await service().detail(keyParam(ctx)) };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Provider template could not be read');
      }
    },

    /**
     * Sends the provider template to a test address (default: the signed-in
     * admin) with the same sample values local template tests use.
     *
     * @route POST /magic-mail/provider-templates/:key/test-send
     * @auth Admin JWT + plugin::magic-mail.test-send, shared test-send rate limit
     * @param {import('koa').Context} ctx - body `{ to?: email, accountName?: string }`
     * @returns {Promise<void>} 200 `{ data: { recipient, accountUsed } }`; 400
     *   invalid input or no recipient; 404 unknown key; 400 with a client-safe
     *   message when the provider rejected the send
     * @sideeffect Sends one email through SendGrid or Mailgun; writes a delivery log.
     */
    async testSend(ctx) {
      try {
        const key = keyParam(ctx);
        const body = validate('providerTemplates.testSend', ctx.request.body || {});
        const to = body.to || ctx.state?.user?.email;
        if (!to) throw new errors.ValidationError('A test recipient is required');
        const detail = await service().detail(key);
        let result;
        try {
          result = await strapi
            .plugin('magic-mail')
            .service('email-router')
            .send(
              {
                to,
                providerTemplate: key,
                templateData: service().sampleData(detail, to),
                // A chosen language version, else the admin's interface language.
                ...(body.language
                  ? { locale: body.language }
                  : canonicalLocale(ctx.state?.user?.preferedLanguage)
                    ? { locale: canonicalLocale(ctx.state.user.preferedLanguage) }
                    : {}),
                ...(body.accountName ? { accountName: body.accountName } : {}),
              },
              { queue: false, providerTemplateFallback: false }
            );
        } catch (sendError) {
          if (sendError?.name === 'ValidationError') throw sendError;
          strapi.log.warn(
            `[magic-mail] Provider template test send failed: ${describeErrorForLog(sendError)}`
          );
          throw new errors.ApplicationError(toClientSendMessage(sendError));
        }
        ctx.body = { data: { recipient: to, accountUsed: result?.accountUsed || null } };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Provider template test send failed');
      }
    },

    /**
     * Sets or clears the local Magic Mail template sent when this provider
     * template can not be used.
     *
     * @route PUT /magic-mail/provider-templates/:key/settings
     * @auth Admin JWT + plugin::magic-mail.manage
     * @param {import('koa').Context} ctx - body `{ fallbackTemplateReferenceId?: number|null,
     *   locales?: Record<string, string> }` (at least one; `locales` maps a
     *   language tag to another synced template key of the same provider and
     *   replaces the whole map, `{}` clears it)
     * @returns {Promise<void>} 200 `{ data: { fallbackTemplateReferenceId?, locales? } }`;
     *   400 invalid or unknown template or locale; 404 unknown key
     * @sideeffect Writes the plugin store.
     */
    async updateSettings(ctx) {
      try {
        const key = keyParam(ctx);
        const body = validate('providerTemplates.settings', ctx.request.body || {});
        const data = {};
        if (body.fallbackTemplateReferenceId !== undefined) {
          Object.assign(data, await service().setFallback(key, body.fallbackTemplateReferenceId));
        }
        if (body.locales !== undefined) {
          Object.assign(data, await service().setLocales(key, body.locales));
        }
        ctx.body = { data };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Provider template settings failed');
      }
    },

    /**
     * Creates a local Magic Mail template from the provider template.
     *
     * @route POST /magic-mail/provider-templates/:key/copy
     * @auth Admin JWT + plugin::magic-mail.manage
     * @param {import('koa').Context} ctx
     * @returns {Promise<void>} 200 `{ data: { templateReferenceId, name, warnings } }`;
     *   400 without content; 404 unknown key
     * @sideeffect Creates a template and its first version.
     */
    async copy(ctx) {
      try {
        ctx.body = { data: await service().copyAsLocal(keyParam(ctx)) };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Provider template copy failed');
      }
    },

    /**
     * Converts a local template's Mustache logic to Handlebars for a provider.
     *
     * @route GET /magic-mail/designer/templates/:id/provider-html
     * @auth Admin JWT + plugin::magic-mail.read
     * @param {import('koa').Context} ctx - `ctx.params.id` template reference id
     * @returns {Promise<void>} 200 `{ data: { name, subject, html, warnings } }`; 404 unknown
     */
    async convertForProvider(ctx) {
      try {
        const { templateReferenceId } = validate('providerTemplates.localTemplateId', {
          templateReferenceId: String(ctx.params?.id ?? ''),
        });
        ctx.body = {
          data: await service().convertLocalForProvider(Number(templateReferenceId)),
        };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Template conversion failed');
      }
    },

    /**
     * Design choice of the core mails (designer or provider template).
     *
     * @route GET /magic-mail/designer/core-designs
     * @auth Admin JWT + plugin::magic-mail.read + plugin::users-permissions.email-templates.read
     * @param {import('koa').Context} ctx
     * @returns {Promise<void>} 200 `{ data: { 'reset-password': {...}, 'email-confirmation': {...},
     *   'admin-forgot-password': {...} } }`; each entry has `usable`, `problem` (error code or
     *   null), `lastSyncedAt`, `checkedAt` (startup check) and `editable` for the signed-in admin
     */
    async coreDesigns(ctx) {
      try {
        ctx.body = { data: await service().coreDesigns(ctx.state?.user ?? null) };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Core email designs could not be read');
      }
    },

    /**
     * Sets the design of a core mail.
     *
     * @route PUT /magic-mail/designer/core/:coreEmailType/design
     * @auth Admin JWT + plugin::magic-mail.manage + plugin::users-permissions.email-templates.update
     * @param {import('koa').Context} ctx - body `{ providerTemplate: key|null, fallbackToDesigner?: boolean }`
     * @returns {Promise<void>} 200 `{ data }` (the new design); 400 invalid type or template;
     *   403 admin-forgot-password for an admin who is not a super admin
     * @sideeffect Writes the plugin store; logs the change and emits
     *   `magic-mail.core-email.design.update` on the event hub.
     */
    async updateCoreDesign(ctx) {
      try {
        const body = validate('providerTemplates.coreDesign', ctx.request.body || {});
        ctx.body = {
          data: await service().setCoreDesign(
            String(ctx.params?.coreEmailType || ''),
            body,
            ctx.state?.user
          ),
        };
      } catch (error) {
        handleControllerError(ctx, error, '[magic-mail] Core email design could not be saved');
      }
    },
  };
};
