'use strict';

/**
 * Routing Rules Controller
 * Manages email routing rules CRUD operations
 */

module.exports = {
  /**
   * Get all routing rules
   */
  async getAll(ctx) {
    try {
      const rules = await strapi.entityService.findMany('plugin::magic-mail.routing-rule', {
        sort: { priority: 'desc' },
      });

      ctx.body = {
        data: rules,
        meta: { count: rules.length },
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting routing rules:', err);
      ctx.throw(500, 'Error fetching routing rules');
    }
  },

  /**
   * Get single routing rule
   */
  async getOne(ctx) {
    try {
      const { ruleId } = ctx.params;
      const rule = await strapi.entityService.findOne('plugin::magic-mail.routing-rule', ruleId);

      if (!rule) {
        ctx.throw(404, 'Routing rule not found');
      }

      ctx.body = {
        data: rule,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting routing rule:', err);
      ctx.throw(500, 'Error fetching routing rule');
    }
  },

  /**
   * Create new routing rule
   */
  async create(ctx) {
    try {
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');

      // Check routing rule limit
      const currentRules = await strapi.entityService.count('plugin::magic-mail.routing-rule');
      const maxRules = await licenseGuard.getMaxRoutingRules();
      
      if (maxRules !== -1 && currentRules >= maxRules) {
        ctx.throw(403, `Routing rule limit reached (${maxRules}). Upgrade to Advanced license for unlimited rules.`);
        return;
      }

      const rule = await strapi.entityService.create('plugin::magic-mail.routing-rule', {
        data: ctx.request.body,
      });

      ctx.body = {
        data: rule,
        message: 'Routing rule created successfully',
      };

      strapi.log.info(`[magic-mail] ✅ Routing rule created: ${rule.name}`);
    } catch (err) {
      strapi.log.error('[magic-mail] Error creating routing rule:', err);
      ctx.throw(err.status || 500, err.message || 'Error creating routing rule');
    }
  },

  /**
   * Update routing rule
   */
  async update(ctx) {
    try {
      const { ruleId } = ctx.params;
      const rule = await strapi.entityService.update('plugin::magic-mail.routing-rule', ruleId, {
        data: ctx.request.body,
      });

      ctx.body = {
        data: rule,
        message: 'Routing rule updated successfully',
      };

      strapi.log.info(`[magic-mail] ✅ Routing rule updated: ${rule.name}`);
    } catch (err) {
      strapi.log.error('[magic-mail] Error updating routing rule:', err);
      ctx.throw(500, err.message || 'Error updating routing rule');
    }
  },

  /**
   * Delete routing rule
   */
  async delete(ctx) {
    try {
      const { ruleId } = ctx.params;
      await strapi.entityService.delete('plugin::magic-mail.routing-rule', ruleId);

      ctx.body = {
        message: 'Routing rule deleted successfully',
      };

      strapi.log.info(`[magic-mail] Routing rule deleted: ${ruleId}`);
    } catch (err) {
      strapi.log.error('[magic-mail] Error deleting routing rule:', err);
      ctx.throw(500, 'Error deleting routing rule');
    }
  },
};

