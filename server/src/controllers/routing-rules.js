'use strict';

const ROUTING_RULE_UID = 'plugin::magic-mail.routing-rule';

const ALLOWED_RULE_FIELDS = ['name', 'conditions', 'accountName', 'priority', 'isActive', 'matchType', 'matchField', 'matchValue', 'description'];

/**
 * Sanitize request body to only include allowed fields
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

module.exports = {
  /**
   * Get all routing rules
   */
  async getAll(ctx) {
    try {
      const rules = await strapi.documents(ROUTING_RULE_UID).findMany({
        sort: [{ priority: 'asc' }],
      });

      ctx.body = {
        data: rules,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting routing rules:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error fetching routing rules');
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
      strapi.log.error('[magic-mail] Error getting routing rule:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error fetching routing rule');
    }
  },

  /**
   * Create new routing rule with input sanitization
   */
  async create(ctx) {
    try {
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');

      const currentRules = await strapi.documents(ROUTING_RULE_UID).count();
      const maxRules = await licenseGuard.getMaxRoutingRules();
      
      if (maxRules !== -1 && currentRules >= maxRules) {
        return ctx.forbidden(`Routing rule limit reached (${maxRules}). Upgrade to Advanced license for unlimited rules.`);
      }

      const data = sanitizeRuleData(ctx.request.body);
      const rule = await strapi.documents(ROUTING_RULE_UID).create({ data });

      ctx.body = {
        data: rule,
        message: 'Routing rule created successfully',
      };

      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule created: ${rule.name}`);
    } catch (err) {
      strapi.log.error('[magic-mail] Error creating routing rule:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error creating routing rule');
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

      const data = sanitizeRuleData(ctx.request.body);
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
      strapi.log.error('[magic-mail] Error updating routing rule:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error updating routing rule');
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
      strapi.log.error('[magic-mail] Error deleting routing rule:', err.message);
      ctx.throw(err.status || 500, err.message || 'Error deleting routing rule');
    }
  },
};
