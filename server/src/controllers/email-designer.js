/**
 * Email Designer Controller
 * Handles CRUD operations for email templates
 */

'use strict';

const { validate, handleControllerError } = require('../validation');

/**
 * True when the service threw a plain "not found" Error (i.e. not a
 * Strapi error class with a status). We keep the string-sniff here for
 * backwards compat — the services currently throw `new Error('… not found')`
 * instead of NotFoundError.
 */
function isNotFoundMessage(err) {
  return err && typeof err.message === 'string' && err.message.includes('not found');
}

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
      handleControllerError(ctx, error, '[magic-mail] Error listing templates');
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
      handleControllerError(ctx, error, '[magic-mail] Error fetching template');
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
        .create(validate('emailDesigner.create', ctx.request.body));

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      if (
        error &&
        typeof error.message === 'string' &&
        (error.message.includes('limit reached') || error.message.includes('already exists'))
      ) {
        return ctx.badRequest(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error creating template');
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
        .update(id, validate('emailDesigner.update', ctx.request.body));

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error updating template');
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
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error deleting template');
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
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error fetching versions');
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
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error restoring version');
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
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      if (
        error &&
        typeof error.message === 'string' &&
        error.message.includes('does not belong')
      ) {
        return ctx.badRequest(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error deleting version');
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
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error deleting all versions');
    }
  },

  /**
   * Render template with data
   */
  async renderTemplate(ctx) {
    try {
      const { templateReferenceId } = ctx.params;
      const { data } = validate('emailDesigner.renderTemplate', ctx.request.body);

      const rendered = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .renderTemplate(parseInt(templateReferenceId), data);

      return ctx.send({
        success: true,
        data: rendered,
      });
    } catch (error) {
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error rendering template');
    }
  },

  /**
   * Export templates
   */
  async exportTemplates(ctx) {
    try {
      const { templateIds } = validate('emailDesigner.exportTemplates', ctx.request.body);
      const templates = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .exportTemplates(templateIds || []);

      return ctx.send({
        success: true,
        data: templates,
      });
    } catch (error) {
      if (
        error &&
        typeof error.message === 'string' &&
        error.message.includes('requires')
      ) {
        return ctx.forbidden(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error exporting templates');
    }
  },

  /**
   * Import templates
   */
  async importTemplates(ctx) {
    try {
      const { templates } = validate('emailDesigner.importTemplates', ctx.request.body);

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
      if (
        error &&
        typeof error.message === 'string' &&
        error.message.includes('requires')
      ) {
        return ctx.forbidden(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error importing templates');
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
      handleControllerError(ctx, error, '[magic-mail] Error fetching stats');
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
      handleControllerError(ctx, error, '[magic-mail] Error fetching core template');
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
        .updateCoreTemplate(coreEmailType, validate('emailDesigner.updateCoreTemplate', ctx.request.body));

      return ctx.send({
        success: true,
        data: template,
      });
    } catch (error) {
      handleControllerError(ctx, error, '[magic-mail] Error updating core template');
    }
  },

  /**
   * Download template as HTML or JSON
   */
  async download(ctx) {
    try {
      const { id } = ctx.params;
      const { type = 'json' } = ctx.query;

      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findOne(id);

      if (!template) {
        return ctx.notFound('Template not found');
      }

      let fileContent;
      let fileName;

      if (type === 'json') {
        fileContent = JSON.stringify(template.design, null, 2);
        fileName = `template-${id}.json`;
        ctx.set('Content-Type', 'application/json');
      } else if (type === 'html') {
        fileContent = template.bodyHtml;
        fileName = `template-${id}.html`;
        ctx.set('Content-Type', 'text/html');
      } else {
        return ctx.badRequest('Invalid type, must be either "json" or "html".');
      }

      ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
      ctx.send(fileContent);
    } catch (error) {
      handleControllerError(ctx, error, '[magic-mail] Error downloading template');
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
      if (isNotFoundMessage(error)) {
        return ctx.notFound(error.message);
      }
      handleControllerError(ctx, error, '[magic-mail] Error duplicating template');
    }
  },

  /**
   * Send test email for template
   */
  async testSend(ctx) {
    try {
      const { id } = ctx.params;
      const { to, accountName } = validate('emailDesigner.testSend', ctx.request.body);

      if (!to) {
        return ctx.badRequest('Recipient email (to) is required');
      }

      const template = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findOne(id);

      if (!template) {
        return ctx.notFound('Template not found');
      }

      const rendered = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .renderTemplate(template.templateReferenceId, {
          name: 'Test User',
          email: to,
        });

      const emailRouterService = strapi.plugin('magic-mail').service('email-router');

      const sendOptions = {
        to,
        subject: rendered.subject || template.subject,
        html: rendered.html,
        text: rendered.text,
        templateId: template.templateReferenceId,
        templateName: template.name,
      };

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
      handleControllerError(ctx, error, '[magic-mail] Error sending test email');
    }
  },
});
