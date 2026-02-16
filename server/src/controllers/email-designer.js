/**
 * Email Designer Controller
 * Handles CRUD operations for email templates
 */

'use strict';

module.exports = ({ strapi }) => ({
  /**
   * Get all templates
   */
  async findAll(ctx) {
    try {
      const templates = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findAll(ctx.query.filters);

      return ctx.send({
        success: true,
        data: templates,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get template by ID
   */
  async findOne(ctx) {
    try {
      const { id } = ctx.params;
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findOne(id);

      if (!template) {
        return ctx.notFound('Template not found');
      }

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Create template
   */
  async create(ctx) {
    try {
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .create(ctx.request.body);

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      if (error.message.includes('limit reached') || error.message.includes('already exists')) {
        return ctx.badRequest(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Update template
   */
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .update(id, ctx.request.body);

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Delete template
   */
  async delete(ctx) {
    try {
      const { id } = ctx.params;
      await strapi.plugin('magic-mail').service('email-designer').delete(id);

      return ctx.send({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get template versions
   */
  async getVersions(ctx) {
    try {
      const { id } = ctx.params;
      const versions = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .getVersions(id);

      return ctx.send({
        success: true,
        data: versions,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Restore version
   */
  async restoreVersion(ctx) {
    try {
      const { id, versionId } = ctx.params;
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .restoreVersion(id, versionId);

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Delete a single version
   */
  async deleteVersion(ctx) {
    try {
      const { id, versionId } = ctx.params;
      const result = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .deleteVersion(id, versionId);

      return ctx.send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ctx.notFound(error.message);
      }
      if (error.message.includes('does not belong')) {
        return ctx.badRequest(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Delete all versions for a template
   */
  async deleteAllVersions(ctx) {
    try {
      const { id } = ctx.params;
      const result = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .deleteAllVersions(id);

      return ctx.send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Render template with data
   */
  async renderTemplate(ctx) {
    try {
      const { templateReferenceId } = ctx.params;
      const { data } = ctx.request.body;

      const rendered = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .renderTemplate(parseInt(templateReferenceId), data);

      return ctx.send({
        success: true,
        data: rendered,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Export templates
   */
  async exportTemplates(ctx) {
    try {
      const { templateIds } = ctx.request.body;
      const templates = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .exportTemplates(templateIds || []);

      return ctx.send({
        success: true,
        data: templates,
      });
    } catch (error) {
      if (error.message.includes('requires')) {
        return ctx.forbidden(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Import templates
   */
  async importTemplates(ctx) {
    try {
      const { templates } = ctx.request.body;

      if (!Array.isArray(templates)) {
        return ctx.badRequest('Templates must be an array');
      }

      const results = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .importTemplates(templates);

      return ctx.send({
        success: true,
        data: results,
      });
    } catch (error) {
      if (error.message.includes('requires')) {
        return ctx.forbidden(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get template statistics
   */
  async getStats(ctx) {
    try {
      const stats = await strapi.plugin('magic-mail').service('email-designer').getStats();

      return ctx.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get core email template
   */
  async getCoreTemplate(ctx) {
    try {
      const { coreEmailType } = ctx.params;
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .getCoreTemplate(coreEmailType);

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Update core email template
   */
  async updateCoreTemplate(ctx) {
    try {
      const { coreEmailType } = ctx.params;
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .updateCoreTemplate(coreEmailType, ctx.request.body);

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Download template as HTML or JSON
   */
  async download(ctx) {
    try {
      const { id } = ctx.params;
      const { type = 'json' } = ctx.query;

      // Get the template
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findOne(id);

      if (!template) {
        return ctx.notFound('Template not found');
      }

      let fileContent, fileName;

      if (type === 'json') {
        // Serve JSON design
        fileContent = JSON.stringify(template.design, null, 2);
        fileName = `template-${id}.json`;
        ctx.set('Content-Type', 'application/json');
      } else if (type === 'html') {
        // Serve HTML
        fileContent = template.bodyHtml;
        fileName = `template-${id}.html`;
        ctx.set('Content-Type', 'text/html');
      } else {
        return ctx.badRequest('Invalid type, must be either "json" or "html".');
      }

      // Set the content disposition to prompt a file download
      ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
      ctx.send(fileContent);
    } catch (error) {
      strapi.log.error('[magic-mail] Error downloading template:', error.message);
      ctx.throw(500, error.message);
    }
  },

  /**
   * Duplicate template
   */
  async duplicate(ctx) {
    try {
      const { id } = ctx.params;

      const duplicated = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .duplicate(id);

      return ctx.send({
        success: true,
        data: duplicated,
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },

  /**
   * Send test email for template
   */
  async testSend(ctx) {
    try {
      const { id } = ctx.params;
      const { to, accountName } = ctx.request.body;

      // Validate required fields
      if (!to) {
        return ctx.badRequest('Recipient email (to) is required');
      }

      // Get template
      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findOne(id);

      if (!template) {
        return ctx.notFound('Template not found');
      }

      // Render template with empty test data (you can add default test data if needed)
      const rendered = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .renderTemplate(template.templateReferenceId, {
          name: 'Test User',
          email: to,
          // Add more default test variables as needed
        });

      // Send email using the email router service
      const emailRouterService = strapi.plugin('magic-mail').service('email-router');
      
      const sendOptions = {
        to,
        subject: rendered.subject || template.subject,
        html: rendered.html,
        text: rendered.text,
        // Add template tracking info
        templateId: template.templateReferenceId,
        templateName: template.name,
      };

      // If accountName is specified, include it
      if (accountName) {
        sendOptions.accountName = accountName;
      }

      const result = await emailRouterService.send(sendOptions);

      return ctx.send({
        success: true,
        message: 'Test email sent successfully',
        data: {
          recipient: to,
          template: template.name,
          result,
        },
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error sending test email:', error);
      return ctx.badRequest(error.message || 'Failed to send test email');
    }
  },
});

