/**
 * Email Designer Service
 * 
 * Handles email template creation, updates, versioning, and rendering
 * 
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

'use strict';

const Mustache = require('mustache');
const htmlToTextLib = require('html-to-text');
const decode = require('decode-html');

// Content Type UIDs
const EMAIL_TEMPLATE_UID = 'plugin::magic-mail.email-template';
const EMAIL_TEMPLATE_VERSION_UID = 'plugin::magic-mail.email-template-version';

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
    console.error('[magic-mail] Error converting HTML to text:', error.message);
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
    return strapi.documents(EMAIL_TEMPLATE_UID).findMany({
      filters,
      sort: [{ createdAt: 'desc' }],
    });
  },

  /**
   * Get template by ID (documentId or numeric id) with populated versions
   * Supports both documentId (string) and numeric id for backward compatibility
   */
  async findOne(idOrDocumentId) {
    // Check if it's a numeric ID (backward compatibility)
    const isNumericId = /^\d+$/.test(String(idOrDocumentId));
    
    if (isNumericId) {
      // Try to find by numeric id first
      const result = await this.findById(Number(idOrDocumentId));
      if (result) return result;
    }
    
    // Try as documentId (Strapi v5 standard)
    return strapi.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: String(idOrDocumentId),
      populate: { versions: true },
    });
  },

  /**
   * Get template by numeric ID (supports both templateReferenceId and internal db id)
   * First tries templateReferenceId, then falls back to internal database id via entityService
   */
  async findById(id) {
    const numericId = Number(id);
    strapi.log.info(`[magic-mail] [LOOKUP] Finding template by numeric ID: ${numericId}`);
    
    // 1. First try: Filter by templateReferenceId (unique integer field) - Document Service
    const byRefId = await strapi.documents(EMAIL_TEMPLATE_UID).findMany({
      filters: { templateReferenceId: numericId },
      limit: 1,
      populate: { versions: true },
    });
    
    if (byRefId.length > 0) {
      strapi.log.info(`[magic-mail] [SUCCESS] Found template by templateReferenceId ${numericId}: documentId=${byRefId[0].documentId}, name="${byRefId[0].name}"`);
      return byRefId[0];
    }
    
    // 2. Fallback: Try internal database id via entityService (for backward compatibility)
    // NOTE: entityService is deprecated in Strapi v5, but required here for numeric ID lookups
    // Document Service API only supports documentId (string), not numeric database IDs
    strapi.log.info(`[magic-mail] [FALLBACK] templateReferenceId not found, trying internal db id: ${numericId}`);
    const byInternalId = await strapi.entityService.findOne(EMAIL_TEMPLATE_UID, numericId, {
      populate: { versions: true },
    });
    
    if (byInternalId) {
      strapi.log.info(`[magic-mail] [SUCCESS] Found template by internal id ${numericId}: documentId=${byInternalId.documentId}, name="${byInternalId.name}"`);
      return byInternalId;
    }
    
    strapi.log.warn(`[magic-mail] [WARNING] Template with ID ${numericId} not found (tried templateReferenceId and internal id)`);
    return null;
  },

  /**
   * Get template by reference ID
   */
  async findByReferenceId(templateReferenceId) {
    const results = await strapi.documents(EMAIL_TEMPLATE_UID).findMany({
      filters: { templateReferenceId },
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  },

  /**
   * Get version by numeric ID or documentId
   * First tries documentId, then falls back to internal database id via entityService
   */
  async findVersionById(idOrDocumentId) {
    strapi.log.info(`[magic-mail] [LOOKUP] Finding version by ID: ${idOrDocumentId}`);
    
    // Check if it looks like a documentId (alphanumeric string) or numeric id
    const isNumericId = /^\d+$/.test(String(idOrDocumentId));
    
    if (!isNumericId) {
      // Try as documentId first (Strapi v5 standard)
      const version = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findOne({
        documentId: String(idOrDocumentId),
        populate: { template: true },
      });
      if (version) {
        strapi.log.info(`[magic-mail] [SUCCESS] Found version by documentId: ${version.documentId}`);
        return version;
      }
    }
    
    // Fallback: Try internal database id via entityService
    // NOTE: entityService is deprecated in Strapi v5, but required here for numeric ID lookups
    // Document Service API only supports documentId (string), not numeric database IDs
    const numericId = Number(idOrDocumentId);
    if (!isNaN(numericId)) {
      strapi.log.info(`[magic-mail] [FALLBACK] Trying internal db id for version: ${numericId}`);
      const version = await strapi.entityService.findOne(EMAIL_TEMPLATE_VERSION_UID, numericId, {
        populate: { template: true },
      });
      if (version) {
        strapi.log.info(`[magic-mail] [SUCCESS] Found version by internal id ${numericId}: documentId=${version.documentId}`);
        return version;
      }
    }
    
    strapi.log.warn(`[magic-mail] [WARNING] Version with ID ${idOrDocumentId} not found`);
    return null;
  },

  /**
   * Create new template with automatic initial version
   */
  async create(data) {
    strapi.log.info('[magic-mail] [TEST] Creating new template...');

    // 1. Check license limits
    const maxTemplates = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .getMaxEmailTemplates();

    // Use native count() method for efficiency
    const currentCount = await strapi.documents(EMAIL_TEMPLATE_UID).count();

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
    const template = await strapi.documents(EMAIL_TEMPLATE_UID).create({
      data: {
        ...data,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Template created: documentId=${template.documentId}, name="${template.name}"`);

    // 4. Create initial version if versioning enabled
    const hasVersioning = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .hasFeature('email-designer-versioning');

    if (hasVersioning) {
      strapi.log.info('[magic-mail] [SAVE] Creating initial version...');
      
      await this.createVersion(template.documentId, {
        name: data.name,
        subject: data.subject,
        design: data.design,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        tags: data.tags,
      });
      
      strapi.log.info('[magic-mail] [SUCCESS] Initial version created');
    } else {
      strapi.log.info('[magic-mail] [SKIP] Versioning not enabled, skipping initial version');
    }

    return template;
  },

  /**
   * Update template with automatic version snapshot
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   * @param {Object} data - Update data
   */
  async update(idOrDocumentId, data) {
    strapi.log.info(`[magic-mail] [UPDATE] Updating template: ${idOrDocumentId}`);
    
    // 1. Load existing template (supports both numeric id and documentId)
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Use the actual documentId from the found template
    const actualDocumentId = template.documentId;
    strapi.log.info(`[magic-mail] [INFO] Found template: documentId=${actualDocumentId}, name="${template.name}"`);

    // 2. Create version snapshot BEFORE update (if versioning enabled)
    const hasVersioning = await strapi
      .plugin('magic-mail')
      .service('license-guard')
      .hasFeature('email-designer-versioning');

    if (hasVersioning) {
      strapi.log.info('[magic-mail] [SAVE] Creating version snapshot before update...');
      
      await this.createVersion(actualDocumentId, {
        name: template.name,
        subject: template.subject,
        design: template.design,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        tags: template.tags,
      });
      
      strapi.log.info('[magic-mail] [SUCCESS] Version snapshot created');
    }

    // 3. Update template using the actual documentId
    const updateData = { ...data };
    if ('versions' in updateData) {
      delete updateData.versions;
      strapi.log.warn('[magic-mail] [WARNING]  Removed versions field from update data');
    }
    
    const updated = await strapi.documents(EMAIL_TEMPLATE_UID).update({
      documentId: actualDocumentId,
      data: updateData,
    });
    
    strapi.log.info(`[magic-mail] [SUCCESS] Template updated: documentId=${updated.documentId}`);
    return updated;
  },

  /**
   * Delete template and all its versions
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async delete(idOrDocumentId) {
    strapi.log.info(`[magic-mail] [DELETE] Deleting template: ${idOrDocumentId}`);
    
    // Find template (supports both numeric id and documentId)
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Use the actual documentId from the found template
    const actualDocumentId = template.documentId;
    strapi.log.info(`[magic-mail] [DELETE] Template: documentId=${actualDocumentId}, name="${template.name}"`);

    // Delete all versions
    const allVersions = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: actualDocumentId,
        },
      },
    });

    strapi.log.info(`[magic-mail] [DELETE] Found ${allVersions.length} versions to delete`);

    for (const version of allVersions) {
      try {
        await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).delete({ 
          documentId: version.documentId 
        });
        strapi.log.info(`[magic-mail] [DELETE] Deleted version #${version.versionNumber}`);
      } catch (versionError) {
        strapi.log.warn(`[magic-mail] [WARNING] Failed to delete version: ${versionError.message}`);
      }
    }

    // Delete template using the actual documentId
    const result = await strapi.documents(EMAIL_TEMPLATE_UID).delete({ 
      documentId: actualDocumentId 
    });
      
    strapi.log.info(`[magic-mail] [SUCCESS] Template "${template.name}" and ${allVersions.length} versions deleted`);
    return result;
  },

  /**
   * Duplicate template
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async duplicate(idOrDocumentId) {
    strapi.log.info(`[magic-mail] [INFO] Duplicating template: ${idOrDocumentId}`);

    const original = await this.findOne(idOrDocumentId);
    if (!original) {
      throw new Error('Template not found');
    }

    strapi.log.info(`[magic-mail] [PACKAGE] Original template: documentId=${original.documentId}, name="${original.name}"`);

    const duplicateData = {
      name: `${original.name} copy`,
      subject: original.subject,
      design: original.design,
      bodyHtml: original.bodyHtml,
      bodyText: original.bodyText,
      category: original.category,
      tags: original.tags,
      isActive: original.isActive,
      templateReferenceId: Date.now() + Math.floor(Math.random() * 1000),
    };

    const duplicated = await this.create(duplicateData);

    strapi.log.info(`[magic-mail] [SUCCESS] Template duplicated: documentId=${duplicated.documentId}`);
    return duplicated;
  },

  // ============================================================
  // VERSIONING OPERATIONS
  // ============================================================

  /**
   * Create a new version for a template
   */
  async createVersion(templateDocumentId, data) {
    strapi.log.info(`[magic-mail] [SNAPSHOT] Creating version for template documentId: ${templateDocumentId}`);

    // 1. Verify template exists
    const template = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: templateDocumentId,
    });
    if (!template) {
      throw new Error(`Template ${templateDocumentId} not found`);
    }

    strapi.log.info(`[magic-mail] [PACKAGE] Template found: documentId=${template.documentId}, name="${template.name}"`);

    // 2. Calculate next version number
    const existingVersions = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: templateDocumentId,
        },
      },
      sort: [{ versionNumber: 'desc' }],
    });

    const versionNumber = existingVersions.length > 0 
      ? Math.max(...existingVersions.map(v => v.versionNumber || 0)) + 1
      : 1;

    strapi.log.info(`[magic-mail] [STATS] Existing versions: ${existingVersions.length} → Next version: #${versionNumber}`);

    // 3. Create version WITH template relation
    const createdVersion = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).create({
      data: {
        versionNumber,
        ...data,
        template: templateDocumentId, // Document Service handles relations with documentId
      },
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Version created: documentId=${createdVersion.documentId}, v${versionNumber}`);
    return createdVersion;
  },

  /**
   * Get all versions for a template
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async getVersions(idOrDocumentId) {
    strapi.log.info(`[magic-mail] [VERSION] Fetching versions for template: ${idOrDocumentId}`);

    // Find template first (supports both numeric id and documentId)
    const template = await this.findOne(idOrDocumentId);
    
    if (!template) {
      throw new Error('Template not found');
    }

    const actualDocumentId = template.documentId;
    strapi.log.info(`[magic-mail] [PACKAGE] Template has ${template.versions?.length || 0} versions`);

    if (template.versions && template.versions.length > 0) {
      const sortedVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
      return sortedVersions;
    }

    // Fallback: find via filter using actual documentId
    const versions = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: actualDocumentId,
        },
      },
      sort: [{ versionNumber: 'desc' }],
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Found ${versions.length} versions`);
    return versions;
  },

  /**
   * Restore template from a specific version
   * @param {string|number} templateIdOrDocumentId - Either numeric id or documentId of template
   * @param {string|number} versionIdOrDocumentId - Either numeric id or documentId of version
   */
  async restoreVersion(templateIdOrDocumentId, versionIdOrDocumentId) {
    strapi.log.info(`[magic-mail] [RESTORE] Restoring template ${templateIdOrDocumentId} from version ${versionIdOrDocumentId}`);

    // Find template first (supports both numeric id and documentId)
    const template = await this.findOne(templateIdOrDocumentId);
    if (!template) {
      throw new Error('Template not found');
    }
    const actualTemplateDocumentId = template.documentId;

    // Find version (supports both numeric id and documentId)
    const version = await this.findVersionById(versionIdOrDocumentId);
    if (!version) {
      throw new Error('Version not found');
    }

    // Verify version belongs to this template
    if (version.template?.documentId !== actualTemplateDocumentId) {
      throw new Error('Version does not belong to this template');
    }

    // Update template with version data (creates new version via update)
    const restored = await this.update(actualTemplateDocumentId, {
      name: version.name,
      subject: version.subject,
      design: version.design,
      bodyHtml: version.bodyHtml,
      bodyText: version.bodyText,
      tags: version.tags,
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Template restored from version #${version.versionNumber}`);
    return restored;
  },

  /**
   * Delete a single version
   * @param {string|number} templateIdOrDocumentId - Either numeric id or documentId of template
   * @param {string|number} versionIdOrDocumentId - Either numeric id or documentId of version
   */
  async deleteVersion(templateIdOrDocumentId, versionIdOrDocumentId) {
    strapi.log.info(`[magic-mail] [DELETE] Deleting version ${versionIdOrDocumentId}`);

    // Find template first (supports both numeric id and documentId)
    const template = await this.findOne(templateIdOrDocumentId);
    if (!template) {
      throw new Error('Template not found');
    }
    const actualTemplateDocumentId = template.documentId;

    // Find version (supports both numeric id and documentId)
    const version = await this.findVersionById(versionIdOrDocumentId);

    if (!version) {
      throw new Error('Version not found');
    }

    if (version.template?.documentId !== actualTemplateDocumentId) {
      throw new Error('Version does not belong to this template');
    }

    await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).delete({ 
      documentId: version.documentId 
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Version v${version.versionNumber} deleted`);
    return { success: true, message: 'Version deleted' };
  },

  /**
   * Delete all versions for a template
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async deleteAllVersions(idOrDocumentId) {
    strapi.log.info(`[magic-mail] [DELETE] Deleting all versions for template ${idOrDocumentId}`);

    // Find template first (supports both numeric id and documentId)
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error('Template not found');
    }

    const versionCount = template.versions?.length || 0;
    if (versionCount === 0) {
      return { success: true, message: 'No versions to delete', deletedCount: 0 };
    }

    let deletedCount = 0;
    for (const version of template.versions) {
      try {
        await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).delete({ 
          documentId: version.documentId 
        });
        deletedCount++;
      } catch (error) {
        strapi.log.error(`[magic-mail] [ERROR] Failed to delete version: ${error.message}`);
      }
    }

    strapi.log.info(`[magic-mail] [SUCCESS] Deleted ${deletedCount}/${versionCount} versions`);
    return { success: true, deletedCount };
  },

  // ============================================================
  // RENDERING
  // ============================================================

  /**
   * Render template with dynamic data using Mustache
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

    // Convert <% %> to {{ }} for Mustache
    bodyHtml = bodyHtml.replace(/<%/g, '{{').replace(/%>/g, '}}');
    bodyText = bodyText.replace(/<%/g, '{{').replace(/%>/g, '}}');
    subject = subject.replace(/<%/g, '{{').replace(/%>/g, '}}');

    if ((!bodyText || !bodyText.length) && bodyHtml && bodyHtml.length) {
      bodyText = convertHtmlToText(bodyHtml, { wordwrap: 130 });
    }

    const decodedHtml = decode(bodyHtml);
    const decodedText = decode(bodyText);
    const decodedSubject = decode(subject);

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
  // IMPORT/EXPORT
  // ============================================================

  /**
   * Export templates as JSON
   */
  async exportTemplates(templateDocumentIds = []) {
    strapi.log.info('[magic-mail] [EXPORT] Exporting templates...');

    let templates;
    if (templateDocumentIds.length > 0) {
      templates = await strapi.documents(EMAIL_TEMPLATE_UID).findMany({
        filters: { documentId: { $in: templateDocumentIds } },
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

    strapi.log.info(`[magic-mail] [SUCCESS] Exported ${exported.length} templates`);
    return exported;
  },

  /**
   * Import templates from JSON
   * Supports both magic-mail export format and strapi-plugin-email-designer-5 format
   */
  async importTemplates(templates) {
    strapi.log.info(`[magic-mail] [IMPORT] Importing ${templates.length} templates...`);

    const results = [];

    for (const rawData of templates) {
      try {
        // Normalize template data - support different export formats
        const templateData = this.normalizeImportData(rawData);
        
        strapi.log.info(`[magic-mail] [IMPORT] Processing: "${templateData.name}" (ref: ${templateData.templateReferenceId})`);

        const existing = await this.findByReferenceId(templateData.templateReferenceId);

        if (existing) {
          const updated = await this.update(existing.documentId, templateData);
          results.push({ success: true, action: 'updated', template: updated });
          strapi.log.info(`[magic-mail] [SUCCESS] Updated: "${templateData.name}"`);
        } else {
          const created = await this.create(templateData);
          results.push({ success: true, action: 'created', template: created });
          strapi.log.info(`[magic-mail] [SUCCESS] Created: "${templateData.name}"`);
        }
      } catch (error) {
        strapi.log.error(`[magic-mail] [ERROR] Import failed for "${rawData.name}": ${error.message}`);
        results.push({
          success: false,
          action: 'failed',
          error: error.message,
          templateName: rawData.name,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    strapi.log.info(`[magic-mail] [IMPORT] Complete: ${successful} successful, ${failed} failed`);

    return results;
  },

  /**
   * Normalize import data from different export formats
   * Supports: magic-mail, strapi-plugin-email-designer-5, and generic formats
   */
  normalizeImportData(rawData) {
    // Map 'enabled' to 'isActive' (strapi-plugin-email-designer-5 format)
    const isActive = rawData.isActive !== undefined 
      ? rawData.isActive 
      : (rawData.enabled !== undefined ? rawData.enabled : true);

    // Generate reference ID if missing
    const templateReferenceId = rawData.templateReferenceId 
      || rawData.referenceId 
      || Date.now() + Math.floor(Math.random() * 1000);

    // Determine category (default to 'custom' if not specified)
    const category = rawData.category || 'custom';

    // Parse tags if string
    let tags = rawData.tags;
    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch (e) {
        tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }
    if (!Array.isArray(tags)) {
      tags = [];
    }

    return {
      templateReferenceId,
      name: rawData.name || 'Imported Template',
      subject: rawData.subject || '',
      design: rawData.design || null,
      bodyHtml: rawData.bodyHtml || rawData.message || '',
      bodyText: rawData.bodyText || '',
      category,
      tags,
      isActive,
    };
  },

  // ============================================================
  // STATISTICS
  // ============================================================

  /**
   * Get template statistics
   */
  async getStats() {
    const allTemplates = await strapi.documents(EMAIL_TEMPLATE_UID).findMany({
      fields: ['isActive', 'category'],
    });
    
    const total = allTemplates.length;
    const active = allTemplates.filter(t => t.isActive === true).length;

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
   * Get Strapi core email template
   */
  async getCoreTemplate(coreEmailType) {
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

      const emailConfig = await pluginStore.get({ key: 'email' });
      
      let data = null;
      if (emailConfig && emailConfig[pluginStoreEmailKey]) {
        data = emailConfig[pluginStoreEmailKey];
      }

    const messageConverted = data?.options?.message
        ? data.options.message.replace(/<%|&#x3C;%/g, '{{').replace(/%>|%&#x3E;/g, '}}')
        : '';
      
    const subjectConverted = data?.options?.object
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

      emailsConfig[pluginStoreEmailKey] = {
        ...emailsConfig[pluginStoreEmailKey],
        options: {
        ...(emailsConfig[pluginStoreEmailKey]?.options || {}),
          message: data.message.replace(/{{/g, '<%').replace(/}}/g, '%>'),
          object: data.subject.replace(/{{/g, '<%').replace(/}}/g, '%>'),
        },
        design: data.design,
      };

      await pluginStore.set({ key: 'email', value: emailsConfig });

      strapi.log.info(`[magic-mail] [SUCCESS] Core email template updated: ${pluginStoreEmailKey}`);
      return { message: 'Saved' };
  },
});
