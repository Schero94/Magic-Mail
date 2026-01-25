'use strict';

/**
 * WhatsApp Controller for MagicMail
 * 
 * Handles all WhatsApp-related HTTP endpoints for the admin panel.
 * Provides QR code generation, status checking, and message sending.
 */

module.exports = {
  /**
   * Check if WhatsApp/Baileys is available
   * GET /magic-mail/whatsapp/available
   */
  async checkAvailable(ctx) {
    try {
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const available = await whatsappService.isAvailable();
      
      ctx.body = {
        success: true,
        data: {
          available,
          message: available 
            ? 'WhatsApp integration is available' 
            : 'Baileys not installed. Run: npm install baileys pino qrcode',
        },
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get WhatsApp connection status
   * GET /magic-mail/whatsapp/status
   */
  async getStatus(ctx) {
    try {
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const status = whatsappService.getStatus();
      const sessionInfo = await whatsappService.getSessionInfo();
      
      ctx.body = {
        success: true,
        data: {
          ...status,
          session: sessionInfo,
        },
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Connect to WhatsApp (generates QR code if needed)
   * POST /magic-mail/whatsapp/connect
   */
  async connect(ctx) {
    try {
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const result = await whatsappService.connect();
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Disconnect from WhatsApp
   * POST /magic-mail/whatsapp/disconnect
   */
  async disconnect(ctx) {
    try {
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const result = await whatsappService.disconnect();
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Send a test message
   * POST /magic-mail/whatsapp/send-test
   */
  async sendTest(ctx) {
    try {
      const { phoneNumber, message } = ctx.request.body;
      
      if (!phoneNumber) {
        return ctx.badRequest('Phone number is required');
      }
      
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const testMessage = message || `[MagicMail Test] This is a test message sent at ${new Date().toLocaleString()}`;
      
      const result = await whatsappService.sendMessage(phoneNumber, testMessage);
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Send a message using a template
   * POST /magic-mail/whatsapp/send-template
   */
  async sendTemplateMessage(ctx) {
    try {
      const { phoneNumber, templateName, variables } = ctx.request.body;
      
      if (!phoneNumber || !templateName) {
        return ctx.badRequest('Phone number and template name are required');
      }
      
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const result = await whatsappService.sendTemplateMessage(phoneNumber, templateName, variables || {});
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Check if a phone number is on WhatsApp
   * POST /magic-mail/whatsapp/check-number
   */
  async checkNumber(ctx) {
    try {
      const { phoneNumber } = ctx.request.body;
      
      if (!phoneNumber) {
        return ctx.badRequest('Phone number is required');
      }
      
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const result = await whatsappService.checkNumber(phoneNumber);
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get all WhatsApp templates
   * GET /magic-mail/whatsapp/templates
   */
  async getTemplates(ctx) {
    try {
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const templates = await whatsappService.getTemplates();
      
      ctx.body = {
        success: true,
        data: templates,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Save a WhatsApp template
   * POST /magic-mail/whatsapp/templates
   */
  async saveTemplate(ctx) {
    try {
      const { templateName, templateContent } = ctx.request.body;
      
      if (!templateName || !templateContent) {
        return ctx.badRequest('Template name and content are required');
      }
      
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const result = await whatsappService.saveTemplate(templateName, templateContent);
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Delete a WhatsApp template
   * DELETE /magic-mail/whatsapp/templates/:templateName
   */
  async deleteTemplate(ctx) {
    try {
      const { templateName } = ctx.params;
      
      if (!templateName) {
        return ctx.badRequest('Template name is required');
      }
      
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const result = await whatsappService.deleteTemplate(templateName);
      
      ctx.body = {
        success: result.success,
        data: result,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get session info
   * GET /magic-mail/whatsapp/session
   */
  async getSession(ctx) {
    try {
      const whatsappService = strapi.plugin('magic-mail').service('whatsapp');
      const sessionInfo = await whatsappService.getSessionInfo();
      
      ctx.body = {
        success: true,
        data: sessionInfo,
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
};

