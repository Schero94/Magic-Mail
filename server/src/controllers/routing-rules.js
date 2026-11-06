'use strict';

const { errors } = require('@strapi/utils');
const { validate, handleControllerError } = require('../validation');

const ROUTING_RULE_UID = 'plugin::magic-mail.routing-rule';
const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';

/**
 * The fields we let the admin UI write to a routing-rule row.
 *
 * Kept strictly in sync with `server/src/content-types/routing-rule/schema.json`
 * — the previous list contained two dead fields (`conditions`, `matchField`)
 * that do not exist in the DB, while silently dropping three legitimate
 * frontend field (`fallbackAccountName`). The result: saving a rule ignored
 * the fallback account without any error.
 */
const ALLOWED_RULE_FIELDS = [
  'name',
  'description',
  'isActive',
  'priority',
  'matchType',
  'matchValue',
  'accountName',
  'fallbackAccountName',
];

/**
 * Sanitize request body to only include allowed fields.
 *
 * Unlike the Zod-based validator used elsewhere, this whitelist is
 * permissive: unknown keys are silently dropped rather than throwing.
 * That's intentional for a free-form edit form where the UI may evolve
 * faster than the backend — but it is a trade-off. If we want strict
 * rejection later, migrate this endpoint to a zod schema in validation.js.
 */
function sanitizeRuleData(body) {
  const data = {};
  for (const field of ALLOWED_RULE_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }
  return data;
}

/**
 * Rejects rules that reference accounts which do not exist. Rules store the
 * account NAME (matched case-insensitively by the router); a typo or a
 * deleted account would otherwise make the rule silently fall through to the
 * primary account.
 *
 * @param {{accountName?: string, fallbackAccountName?: string|null}} data
 * @returns {Promise<void>}
 * @throws {errors.ValidationError}
 */
async function assertAccountsExist(data) {
  const details = {};
  for (const field of ['accountName', 'fallbackAccountName']) {
    const name = typeof data[field] === 'string' ? data[field].trim() : '';
    if (!name) continue;
    const matches = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { name: { $eqi: name } },
      fields: ['name'],
      limit: 1,
    });
    if (!matches || matches.length === 0) {
      details[field] = [`No email account named "${name.slice(0, 80)}" exists`];
    }
  }
  if (Object.keys(details).length > 0) {
    throw new errors.ValidationError('Routing rule references an unknown email account', details);
  }
}

module.exports = {
  /**
   * Lists routing rules in evaluation order: highest priority first (the
   * router checks rules by priority descending, first match wins).
   */
  async getAll(ctx) {
    try {
      const rules = await strapi.documents(ROUTING_RULE_UID).findMany({
        sort: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });

      ctx.body = {
        data: rules,
      };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error getting routing rules',
        'Error fetching routing rules'
      );
    }
  },

  /**
   * Get single routing rule
   */
  async getOne(ctx) {
    try {
      const { ruleId } = ctx.params;
      const rule = await strapi.documents(ROUTING_RULE_UID).findOne({
        documentId: ruleId,
      });

      if (!rule) {
        return ctx.notFound('Routing rule not found');
      }

      ctx.body = {
        data: rule,
      };
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error getting routing rule',
        'Error fetching routing rule'
      );
    }
  },

  /**
   * Create new routing rule with input sanitization
   */
  async create(ctx) {
    try {
      const data = validate('routingRules.create', sanitizeRuleData(ctx.request.body));
      await assertAccountsExist(data);
      const rule = await strapi.documents(ROUTING_RULE_UID).create({ data });

      ctx.body = {
        data: rule,
        message: 'Routing rule created successfully',
      };

      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule created: ${rule.name}`);
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error creating routing rule',
        'Error creating routing rule'
      );
    }
  },

  /**
   * Update routing rule with existence check and input sanitization
   */
  async update(ctx) {
    try {
      const { ruleId } = ctx.params;

      const existing = await strapi.documents(ROUTING_RULE_UID).findOne({ documentId: ruleId });
      if (!existing) {
        return ctx.notFound('Routing rule not found');
      }

      const data = validate('routingRules.update', sanitizeRuleData(ctx.request.body));
      await assertAccountsExist(data);
      const rule = await strapi.documents(ROUTING_RULE_UID).update({
        documentId: ruleId,
        data,
      });

      ctx.body = {
        data: rule,
        message: 'Routing rule updated successfully',
      };

      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule updated: ${rule.name}`);
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error updating routing rule',
        'Error updating routing rule'
      );
    }
  },

  /**
   * Delete routing rule with existence check
   */
  async delete(ctx) {
    try {
      const { ruleId } = ctx.params;

      const existing = await strapi.documents(ROUTING_RULE_UID).findOne({ documentId: ruleId });
      if (!existing) {
        return ctx.notFound('Routing rule not found');
      }

      await strapi.documents(ROUTING_RULE_UID).delete({
        documentId: ruleId,
      });

      ctx.body = {
        message: 'Routing rule deleted successfully',
      };

      strapi.log.info(`[magic-mail] Routing rule deleted: ${ruleId}`);
    } catch (err) {
      handleControllerError(
        ctx,
        err,
        '[magic-mail] Error deleting routing rule',
        'Error deleting routing rule'
      );
    }
  },
};
