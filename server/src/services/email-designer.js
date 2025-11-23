/**
 * Email Designer Service
 * 
 * Handles email template creation, updates, versioning, and rendering
 * 
 * CRITICAL: Uses ONLY entityService for all database operations
 * This ensures proper relation handling in Strapi v5
 */

'use strict';

const Mustache = require('mustache');
const htmlToTextLib = require('html-to-text');
const decode = require('decode-html');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Safely convert HTML to plain text
 * Handles various html-to-text library versions
 */
const convertHtmlToText = (html, options = { wordwrap: 130 }) => {
  try {
    if (!html || typeof html !== 'string') {
      return '';
    }
    
    if (!htmlToTextLib) {
      return html.replace(/<[^>]*>/g, '');
    }
    
    // Try different API styles
    if (htmlToTextLib.htmlToText && typeof htmlToTextLib.htmlToText === 'function') {
      return htmlToTextLib.htmlToText(html, options);
    } else if (htmlToTextLib.convert && typeof htmlToTextLib.convert === 'function') {
      return htmlToTextLib.convert(html, options);
    } else if (typeof htmlToTextLib === 'function') {
      return htmlToTextLib(html, options);
    } else if (htmlToTextLib.default) {
      if (typeof htmlToTextLib.default.htmlToText === 'function') {
        return htmlToTextLib.default.htmlToText(html, options);
      } else if (typeof htmlToTextLib.default.convert === 'function') {
        return htmlToTextLib.default.convert(html, options);
      } else if (typeof htmlToTextLib.default === 'function') {
        return htmlToTextLib.default(html, options);
      }
    }
    
    // Fallback
    return html.replace(/<[^>]*>/g, '');
  } catch (error) {
    strapi.log.error('[magic-mail] Error converting HTML to text:', error);
    return (html || '').replace(/<[^>]*>/g, '');
  }
};

// ============================================================
// SERVICE
// ============================================================

module.exports = ({ strapi }) => ({
  
  // ============================================================
  // TEMPLATE CRUD OPERATIONS
  // ============================================================

  /**
   * Get all templates
   */
  async findAll(filters = {}) {
    return strapi.entityService.findMany('plugin::magic-mail.email-template', {
      filters,
      sort: { createdAt: 'desc' },
    });
  },

  /**
   * Get template by ID with populated versions
   */
  async findOne(id) {
    return strapi.entityService.findOne('plugin::magic-mail.email-template', id, {
      populate: ['versions'],
    });
  },

  /**
   * Get template by reference ID
   */
  async findByReferenceId(templateReferenceId) {
    const results = await strapi.entityService.findMany('plugin::magic-mail.email-template', {
      filters: { templateReferenceId },
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  },

  /**
   * Create new template with automatic initial version
   * 
   * Steps:
   * 1. Check license limits
   * 2. Validate reference ID is unique
   * 3. Create template
   * 4. Create initial version (if versioning enabled)
   */
  async create(data) {
    strapi.log.info('[magic-mail] 📝 Creating new template...');

    // 1. Check license limits
    const maxTemplates = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .getMaxEmailTemplates();

    const currentCount = await strapi.db
      .query('plugin::magic-mail.email-template')
      .count();

    if (maxTemplates !== -1 && currentCount >= maxTemplates) {
      throw new Error(
        `Template limit reached (${maxTemplates}). Upgrade your license to create more templates.`
      );
    }

    // 2. Validate reference ID is unique
    if (data.templateReferenceId) {
      const existing = await this.findByReferenceId(data.templateReferenceId);
      if (existing) {
        throw new Error(`Template with reference ID ${data.templateReferenceId} already exists`);
      }
    }

    // 3. Create template
    const template = await strapi.entityService.create('plugin::magic-mail.email-template', {
      data: {
        ...data,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });

    strapi.log.info(`[magic-mail] ✅ Template created: ID=${template.id}, name="${template.name}"`);

    // 4. Create initial version if versioning enabled
    const hasVersioning = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .hasFeature('email-designer-versioning');

    if (hasVersioning) {
      strapi.log.info('[magic-mail] 💾 Creating initial version...');
      
      await this.createVersion(template.id, {
        name: data.name,
        subject: data.subject,
        design: data.design,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        tags: data.tags,
      });
      
      strapi.log.info('[magic-mail] ✅ Initial version created');
    } else {
      strapi.log.info('[magic-mail] ⏭️  Versioning not enabled, skipping initial version');
    }

    return template;
  },

  /**
   * Update template with automatic version snapshot
   * 
   * Steps:
   * 1. Load existing template
   * 2. Create version snapshot of CURRENT state (before update)
   * 3. Update template with new data
   * 
   * IMPORTANT: Version is created BEFORE update to preserve old state!
   */
  async update(id, data) {
    strapi.log.info(`[magic-mail] 🔄 Updating template ID: ${id}`);
    
    // 1. Load existing template
    const template = await this.findOne(id);
    if (!template) {
      throw new Error('Template not found');
    }

    strapi.log.info(`[magic-mail] 📋 Found template: ID=${template.id}, name="${template.name}"`);

    // 2. Create version snapshot BEFORE update (if versioning enabled)
    const hasVersioning = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .hasFeature('email-designer-versioning');

    if (hasVersioning) {
      strapi.log.info('[magic-mail] 💾 Creating version snapshot before update...');
      
      // Save CURRENT state as new version
      await this.createVersion(template.id, {
        name: template.name,
        subject: template.subject,
        design: template.design,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        tags: template.tags,
      });
      
      strapi.log.info('[magic-mail] ✅ Version snapshot created');
    } else {
      strapi.log.info('[magic-mail] ⏭️  Versioning not enabled, skipping version snapshot');
    }

    // 3. Update template
    // CRITICAL: Do NOT pass versions in data, it would overwrite the relation!
    // Only update the fields that are explicitly provided
    const updateData = { ...data };
    
    // Remove any versions field if it exists (shouldn't, but be safe)
    if ('versions' in updateData) {
      delete updateData.versions;
      strapi.log.warn('[magic-mail] ⚠️  Removed versions field from update data to prevent relation overwrite');
    }
    
    const updated = await strapi.entityService.update('plugin::magic-mail.email-template', id, {
      data: updateData,
    });
    
    strapi.log.info(`[magic-mail] ✅ Template updated: ID=${updated.id}, versions preserved`);
    return updated;
  },

  /**
   * Delete template and all its versions
   * 
   * Uses Document Service for version deletion to ensure cascading delete
   */
  async delete(id) {
    strapi.log.info(`[magic-mail] 🗑️  Deleting template ID: ${id}`);
    
    // Get template first
      const template = await this.findOne(id);
      if (!template) {
        throw new Error('Template not found');
      }

    strapi.log.info(`[magic-mail] 🗑️  Template: ID=${template.id}, name="${template.name}"`);

    // Delete all versions using Document Service (supports documentId filtering)
      const allVersions = await strapi.documents('plugin::magic-mail.email-template-version').findMany({
        filters: {
          template: {
            documentId: template.documentId,
          },
        },
      });

      strapi.log.info(`[magic-mail] 🗑️  Found ${allVersions.length} versions to delete`);

    // Delete each version
      for (const version of allVersions) {
        try {
          await strapi
            .documents('plugin::magic-mail.email-template-version')
            .delete({ documentId: version.documentId });
        
        strapi.log.info(`[magic-mail] 🗑️  Deleted version #${version.versionNumber}`);
        } catch (versionError) {
          strapi.log.warn(`[magic-mail] ⚠️  Failed to delete version ${version.id}: ${versionError.message}`);
        }
      }

    // Delete template
      const result = await strapi.entityService.delete('plugin::magic-mail.email-template', id);
      
    strapi.log.info(`[magic-mail] ✅ Template "${template.name}" and ${allVersions.length} versions deleted`);
      
      return result;
  },

  /**
   * Duplicate template
   * 
   * Creates a copy of an existing template with " copy" suffix
   * Does NOT copy versions, starts fresh
   */
  async duplicate(id) {
    strapi.log.info(`[magic-mail] 📋 Duplicating template ID: ${id}`);

    // Get original template
    const original = await this.findOne(id);
    if (!original) {
      throw new Error('Template not found');
    }

    strapi.log.info(`[magic-mail] 📦 Original template: ID=${original.id}, name="${original.name}"`);

    // Prepare duplicate data (remove system fields)
    const duplicateData = {
      name: `${original.name} copy`,
      subject: original.subject,
      design: original.design,
      bodyHtml: original.bodyHtml,
      bodyText: original.bodyText,
      category: original.category,
      tags: original.tags,
      isActive: original.isActive,
      // Generate new templateReferenceId (unique ID)
      templateReferenceId: Date.now() + Math.floor(Math.random() * 1000),
    };

    // Create duplicate
    const duplicated = await this.create(duplicateData);

    strapi.log.info(`[magic-mail] ✅ Template duplicated: ID=${duplicated.id}, name="${duplicated.name}"`);

    return duplicated;
  },

  // ============================================================
  // VERSIONING OPERATIONS
  // ============================================================

  /**
   * Create a new version for a template
   * 
   * CRITICAL: This is THE ONLY function that creates versions!
   * 
   * Steps:
   * 1. Verify template exists
   * 2. Calculate next version number
   * 3. Create version WITH template relation
   * 
   * @param {number} templateId - Numeric ID of template
   * @param {object} data - Version data (name, subject, bodyHtml, etc)
   * @returns {object} Created version
   */
  async createVersion(templateId, data) {
    strapi.log.info(`[magic-mail] 📸 Creating version for template ID: ${templateId}`);

    // 1. Verify template exists
    const template = await strapi.entityService.findOne('plugin::magic-mail.email-template', templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    strapi.log.info(`[magic-mail] 📦 Template found: ID=${template.id}, name="${template.name}"`);

    // 2. Calculate next version number
    const existingVersions = await strapi.entityService.findMany('plugin::magic-mail.email-template-version', {
      filters: {
        template: {
          id: templateId, // Use numeric ID in filter
        },
      },
      sort: { versionNumber: 'desc' },
    });

    const versionNumber = existingVersions.length > 0 
      ? Math.max(...existingVersions.map(v => v.versionNumber || 0)) + 1
      : 1;

    strapi.log.info(`[magic-mail] 📊 Existing versions: ${existingVersions.length} → Next version: #${versionNumber}`);

    // 3. Create version WITH template relation
    // In Strapi v5, we need to use connect for relations!
    const createdVersion = await strapi.entityService.create('plugin::magic-mail.email-template-version', {
      data: {
        versionNumber,
        ...data,
        template: {
          connect: [templateId],  // ✅ Use connect array for Strapi v5!
        },
      },
    });

    strapi.log.info(`[magic-mail] 📝 Version created with connect: ID=${createdVersion.id}`);

    // 4. Verify the relation was created by loading with populate
    const verifiedVersion = await strapi.entityService.findOne(
      'plugin::magic-mail.email-template-version',
      createdVersion.id,
      {
        populate: ['template'],
      }
    );

    strapi.log.info(
      `[magic-mail] ✅ Version created successfully:\n` +
      `   - Version ID: ${createdVersion.id}\n` +
      `   - Version #: ${versionNumber}\n` +
      `   - Template ID: ${templateId}\n` +
      `   - Has template relation: ${!!verifiedVersion.template}\n` +
      `   - Template in DB: ${verifiedVersion.template?.id || 'NULL'}`
    );

    if (!verifiedVersion.template) {
      strapi.log.error(
        `[magic-mail] ❌ CRITICAL: Version ${createdVersion.id} was created but template relation was NOT set!\n` +
        `   This is a Strapi v5 relation bug. Investigating...`
    );
    }

    return verifiedVersion;
  },

  /**
   * Get all versions for a template
   */
  async getVersions(templateId) {
    strapi.log.info(`[magic-mail] 📜 Fetching versions for template ID: ${templateId}`);

    // Verify template exists
    const template = await strapi.entityService.findOne('plugin::magic-mail.email-template', templateId, {
      populate: ['versions'],
    });
    
    if (!template) {
      throw new Error('Template not found');
    }

    strapi.log.info(`[magic-mail] 📦 Template has ${template.versions?.length || 0} versions in relation`);

    // OPTION 1: Return versions from template populate (most reliable!)
    if (template.versions && template.versions.length > 0) {
      // Sort by version number
      const sortedVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
      
      strapi.log.info(`[magic-mail] ✅ Returning ${sortedVersions.length} versions from template populate`);
      return sortedVersions;
    }

    // OPTION 2: Fallback - try finding with filter (shouldn't be needed)
    strapi.log.warn(`[magic-mail] ⚠️  Template has no populated versions, trying filter...`);
    
    const versions = await strapi.entityService.findMany('plugin::magic-mail.email-template-version', {
      filters: {
        template: {
          id: templateId,
        },
      },
      sort: { versionNumber: 'desc' },
      populate: ['template'],
    });

    strapi.log.info(`[magic-mail] ✅ Found ${versions.length} versions via filter`);
    
    return versions;
  },

  /**
   * Restore template from a specific version
   * 
   * Updates the template with data from the version
   * This will create a NEW version snapshot (via update logic)
   */
  async restoreVersion(templateId, versionId) {
    strapi.log.info(`[magic-mail] 🔄 Restoring template ${templateId} from version ${versionId}`);

    // Get version
    const version = await strapi.entityService.findOne('plugin::magic-mail.email-template-version', versionId, {
      populate: ['template'],
    });

    if (!version) {
      throw new Error('Version not found');
    }

    strapi.log.info(`[magic-mail] 📦 Version found: ID=${version.id}, versionNumber=${version.versionNumber}, has template: ${!!version.template}`);

    // Verify version belongs to this template
    // For new versions (with relation): check template.id
    if (version.template?.id) {
      if (version.template.id !== parseInt(templateId)) {
        strapi.log.error(`[magic-mail] ❌ Version ${versionId} belongs to template ${version.template.id}, not ${templateId}`);
        throw new Error('Version does not belong to this template');
      }
      strapi.log.info(`[magic-mail] ✅ Version has correct template relation`);
    } else {
      // For old versions (without relation): verify via template's versions array
      strapi.log.warn(`[magic-mail] ⚠️  Version ${versionId} has no template relation, checking template's versions array...`);
      
      const template = await strapi.entityService.findOne('plugin::magic-mail.email-template', templateId, {
        populate: ['versions'],
      });
      
      const versionExists = template.versions && template.versions.some(v => v.id === parseInt(versionId));
      
      if (!versionExists) {
        strapi.log.error(`[magic-mail] ❌ Version ${versionId} not found in template ${templateId} versions array`);
      throw new Error('Version does not belong to this template');
    }

      strapi.log.info(`[magic-mail] ✅ Version ${versionId} found in template's versions array (old version without relation)`);
    }

    // Update template with version data
    // This will automatically create a snapshot version via update()
    const restored = await this.update(templateId, {
      name: version.name,
      subject: version.subject,
      design: version.design,
      bodyHtml: version.bodyHtml,
      bodyText: version.bodyText,
      tags: version.tags,
    });

    strapi.log.info(`[magic-mail] ✅ Template restored from version #${version.versionNumber}`);
    
    return restored;
  },

  /**
   * Delete a single version
   * 
   * @param {number} templateId - Template ID (for verification)
   * @param {number} versionId - Version ID to delete
   */
  async deleteVersion(templateId, versionId) {
    strapi.log.info(`[magic-mail] 🗑️  Deleting version ${versionId} from template ${templateId}`);

    // Get version
    const version = await strapi.entityService.findOne('plugin::magic-mail.email-template-version', versionId, {
      populate: ['template'],
    });

    if (!version) {
      throw new Error('Version not found');
    }

    // Verify version belongs to this template (same logic as restore)
    if (version.template?.id) {
      if (version.template.id !== parseInt(templateId)) {
        strapi.log.error(`[magic-mail] ❌ Version ${versionId} belongs to template ${version.template.id}, not ${templateId}`);
        throw new Error('Version does not belong to this template');
      }
      strapi.log.info(`[magic-mail] ✅ Version has correct template relation`);
    } else {
      // Check via template's versions array for old versions
      strapi.log.warn(`[magic-mail] ⚠️  Version ${versionId} has no template relation, checking template's versions array...`);
      
      const template = await strapi.entityService.findOne('plugin::magic-mail.email-template', templateId, {
        populate: ['versions'],
      });
      
      const versionExists = template.versions && template.versions.some(v => v.id === parseInt(versionId));
      if (!versionExists) {
        strapi.log.error(`[magic-mail] ❌ Version ${versionId} not found in template ${templateId} versions array`);
        throw new Error('Version does not belong to this template');
      }
      
      strapi.log.info(`[magic-mail] ✅ Version ${versionId} found in template's versions array`);
    }

    // Delete version
    await strapi.entityService.delete('plugin::magic-mail.email-template-version', versionId);

    strapi.log.info(`[magic-mail] ✅ Version ${versionId} (v${version.versionNumber}) deleted successfully`);

    return { success: true, message: 'Version deleted' };
  },

  /**
   * Delete all versions for a template
   * 
   * @param {number} templateId - Template ID
   */
  async deleteAllVersions(templateId) {
    strapi.log.info(`[magic-mail] 🗑️  Deleting all versions for template ${templateId}`);

    // Get template with versions
    const template = await strapi.entityService.findOne('plugin::magic-mail.email-template', templateId, {
      populate: ['versions'],
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const versionCount = template.versions?.length || 0;
    strapi.log.info(`[magic-mail] 📊 Found ${versionCount} versions to delete`);

    if (versionCount === 0) {
      return { success: true, message: 'No versions to delete', deletedCount: 0 };
    }

    // Delete each version
    let deletedCount = 0;
    const errors = [];
    
    for (const version of template.versions) {
      try {
        await strapi.entityService.delete('plugin::magic-mail.email-template-version', version.id);
        deletedCount++;
        strapi.log.info(`[magic-mail] 🗑️  Deleted version #${version.versionNumber} (ID: ${version.id})`);
      } catch (error) {
        strapi.log.error(`[magic-mail] ❌ Failed to delete version ${version.id}: ${error.message}`);
        errors.push({ versionId: version.id, error: error.message });
      }
    }

    strapi.log.info(`[magic-mail] ✅ Deleted ${deletedCount}/${versionCount} versions`);

    return { 
      success: true, 
      message: `Deleted ${deletedCount} of ${versionCount} versions`, 
      deletedCount,
      failedCount: versionCount - deletedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  },

  // ============================================================
  // RENDERING
  // ============================================================

  /**
   * Render template with dynamic data using Mustache
   * 
   * @param {number} templateReferenceId - Template reference ID
   * @param {object} data - Dynamic data for Mustache
   * @returns {object} Rendered HTML, text, and subject
   */
  async renderTemplate(templateReferenceId, data = {}) {
    const template = await this.findByReferenceId(templateReferenceId);

    if (!template) {
      throw new Error(`Template with reference ID ${templateReferenceId} not found`);
    }

    if (!template.isActive) {
      throw new Error(`Template ${template.name} is inactive`);
    }

    let { bodyHtml = '', bodyText = '', subject = '' } = template;

    // Convert <% %> to {{ }} for Mustache (backward compatibility)
    bodyHtml = bodyHtml.replace(/<%/g, '{{').replace(/%>/g, '}}');
    bodyText = bodyText.replace(/<%/g, '{{').replace(/%>/g, '}}');
    subject = subject.replace(/<%/g, '{{').replace(/%>/g, '}}');

    // Generate text version from HTML if not provided
    if ((!bodyText || !bodyText.length) && bodyHtml && bodyHtml.length) {
      bodyText = convertHtmlToText(bodyHtml, { wordwrap: 130 });
    }

    // Decode HTML entities
    const decodedHtml = decode(bodyHtml);
    const decodedText = decode(bodyText);
    const decodedSubject = decode(subject);

    // Render with Mustache
    const renderedHtml = Mustache.render(decodedHtml, data);
    const renderedText = Mustache.render(decodedText, data);
    const renderedSubject = Mustache.render(decodedSubject, data);

    return {
      html: renderedHtml,
      text: renderedText,
      subject: renderedSubject,
      templateName: template.name,
      category: template.category,
    };
  },

  // ============================================================
  // IMPORT/EXPORT (Advanced+ License)
  // ============================================================

  /**
   * Export templates as JSON
   */
  async exportTemplates(templateIds = []) {
    strapi.log.info('[magic-mail] 📤 Exporting templates...');

    let templates;
    if (templateIds.length > 0) {
      templates = await strapi.entityService.findMany('plugin::magic-mail.email-template', {
        filters: { id: { $in: templateIds } },
      });
    } else {
      templates = await this.findAll();
    }

    const exported = templates.map((template) => ({
      templateReferenceId: template.templateReferenceId,
      name: template.name,
      subject: template.subject,
      design: template.design,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      category: template.category,
      tags: template.tags,
    }));

    strapi.log.info(`[magic-mail] ✅ Exported ${exported.length} templates`);
    return exported;
  },

  /**
   * Import templates from JSON
   */
  async importTemplates(templates) {
    strapi.log.info(`[magic-mail] 📥 Importing ${templates.length} templates...`);

    const results = [];

    for (const templateData of templates) {
      try {
        const existing = await this.findByReferenceId(templateData.templateReferenceId);

        if (existing) {
          // Update existing
          const updated = await this.update(existing.id, templateData);
          results.push({ success: true, action: 'updated', template: updated });
          strapi.log.info(`[magic-mail] ✅ Updated template: ${templateData.name}`);
        } else {
          // Create new
          const created = await this.create(templateData);
          results.push({ success: true, action: 'created', template: created });
          strapi.log.info(`[magic-mail] ✅ Created template: ${templateData.name}`);
        }
      } catch (error) {
        results.push({
          success: false,
          action: 'failed',
          error: error.message,
          templateName: templateData.name,
        });
        strapi.log.error(`[magic-mail] ❌ Failed to import ${templateData.name}: ${error.message}`);
      }
    }

    const successful = results.filter(r => r.success).length;
    strapi.log.info(`[magic-mail] ✅ Import completed: ${successful}/${templates.length} templates`);

    return results;
  },

  // ============================================================
  // STATISTICS
  // ============================================================

  /**
   * Get template statistics
   */
  async getStats() {
    const allTemplates = await strapi.entityService.findMany('plugin::magic-mail.email-template', {
      fields: ['isActive', 'category'],
    });
    
    const total = allTemplates.length;
    const active = allTemplates.filter(t => t.isActive === true).length;

    // Group by category
    const categoryMap = allTemplates.reduce((acc, template) => {
      const category = template.category || 'custom';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    const byCategory = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));

    const maxTemplates = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .getMaxEmailTemplates();

    return {
      total,
      active,
      inactive: total - active,
      byCategory,
      maxTemplates,
      remaining: maxTemplates === -1 ? -1 : Math.max(0, maxTemplates - total),
    };
  },

  // ============================================================
  // STRAPI CORE EMAIL TEMPLATES
  // ============================================================

  /**
   * Get Strapi core email template (reset-password, email-confirmation)
   * 
   * These are stored in users-permissions plugin store
   */
  async getCoreTemplate(coreEmailType) {
    // Validate type
      if (!['reset-password', 'email-confirmation'].includes(coreEmailType)) {
        throw new Error('Invalid core email type');
      }

      const pluginStoreEmailKey =
        coreEmailType === 'email-confirmation' ? 'email_confirmation' : 'reset_password';

      const pluginStore = await strapi.store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
      });

    // Get email config
      const emailConfig = await pluginStore.get({ key: 'email' });
      
      let data = null;
      if (emailConfig && emailConfig[pluginStoreEmailKey]) {
        data = emailConfig[pluginStoreEmailKey];
      }

    // Convert <%= %> to {{ }} for Mustache
      const messageConverted = data && data.options && data.options.message
        ? data.options.message.replace(/<%|&#x3C;%/g, '{{').replace(/%>|%&#x3E;/g, '}}')
        : '';
      
      const subjectConverted = data && data.options && data.options.object
        ? data.options.object.replace(/<%|&#x3C;%/g, '{{').replace(/%>|%&#x3E;/g, '}}')
        : '';

    return {
        from: data?.options?.from || null,
        message: messageConverted || '',
        subject: subjectConverted || '',
        bodyHtml: messageConverted || '',
        bodyText: messageConverted ? convertHtmlToText(messageConverted, { wordwrap: 130 }) : '',
        coreEmailType,
        design: data?.design || null,
      };
  },

  /**
   * Update Strapi core email template
   */
  async updateCoreTemplate(coreEmailType, data) {
    // Validate type
      if (!['reset-password', 'email-confirmation'].includes(coreEmailType)) {
        throw new Error('Invalid core email type');
      }

      const pluginStoreEmailKey =
        coreEmailType === 'email-confirmation' ? 'email_confirmation' : 'reset_password';

      const pluginStore = await strapi.store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
      });

      const emailsConfig = await pluginStore.get({ key: 'email' });

    // Convert {{ }} back to <%= %> for Strapi
      emailsConfig[pluginStoreEmailKey] = {
        ...emailsConfig[pluginStoreEmailKey],
        options: {
          ...(emailsConfig[pluginStoreEmailKey] ? emailsConfig[pluginStoreEmailKey].options : {}),
          message: data.message.replace(/{{/g, '<%').replace(/}}/g, '%>'),
          object: data.subject.replace(/{{/g, '<%').replace(/}}/g, '%>'),
        },
        design: data.design,
      };

      await pluginStore.set({ key: 'email', value: emailsConfig });

      strapi.log.info(`[magic-mail] ✅ Core email template updated: ${pluginStoreEmailKey}`);

      return { message: 'Saved' };
  },
});
