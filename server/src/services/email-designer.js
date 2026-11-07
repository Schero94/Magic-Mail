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
const { errors } = require('@strapi/utils');
const coordination = require('../utils/coordination');

// Content Type UIDs
const EMAIL_TEMPLATE_UID = 'plugin::magic-mail.email-template';
const EMAIL_TEMPLATE_VERSION_UID = 'plugin::magic-mail.email-template-version';

/** Template fields that make up a version snapshot. */
const VERSION_FIELDS = ['name', 'subject', 'design', 'bodyHtml', 'bodyText', 'tags'];

/** Simple list filters accepted by findAll() (no relations, no operators). */
const LIST_FILTER_FIELDS = {
  category: (value) => ['transactional', 'marketing', 'notification', 'custom'].includes(value),
  isActive: (value) => typeof value === 'boolean',
  templateReferenceId: (value) => Number.isInteger(value) && value > 0,
};

/**
 * users-permissions email template placeholders. Same allowlist as the
 * users-permissions settings controller (isValidEmailTemplate).
 */
const CORE_TEMPLATE_KEYS = [
  'URL',
  'ADMIN_URL',
  'SERVER_URL',
  'CODE',
  'USER',
  'USER.email',
  'USER.username',
  'TOKEN',
];
const CORE_TEMPLATE_STORE_KEYS = {
  'reset-password': 'reset_password',
  'email-confirmation': 'email_confirmation',
};

/**
 * Serialises version numbering per template across processes (database
 * lease, see utils/coordination) so concurrent saves on different replicas
 * or pm2 workers never get the same number.
 *
 * @template T
 * @param {object} strapi
 * @param {string} key - template documentId
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
const withVersionLock = (strapi, key, task) =>
  coordination.withLease(strapi, `template-version:${key}`, task, {
    ttlMs: 30_000,
    waitMs: 15_000,
  });

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

/**
 * Decodes the basic named and numeric HTML entities.
 * @param {string} value
 * @returns {string}
 */
const decodeHtmlEntities = (value) => {
  if (typeof value !== 'string' || !value.includes('&')) return value || '';
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });
};

/**
 * Decodes entities only inside Mustache tags (`{{ ... }}`), which rich-text
 * editors entity-encode. Literal escaped text elsewhere in the HTML stays
 * escaped.
 * @param {string} html
 * @returns {string}
 */
const decodeMustacheTags = (html) => {
  if (typeof html !== 'string') return '';
  return html.replace(/\{\{\{?[\s\S]*?\}?\}\}/g, (tag) => decodeHtmlEntities(tag));
};

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

/**
 * Converts a users-permissions template (`<%= KEY %>`) to the editor's
 * placeholder form (`{{ KEY }}`). Only interpolations are converted;
 * anything else stays as stored (and is rejected again on save).
 *
 * @param {string} value
 * @returns {string}
 */
const coreToEditor = (value) =>
  (typeof value === 'string' ? value : '').replace(
    /(?:<|&lt;|&#x3C;|&#60;)%=\s*([\w.]+)\s*%(?:>|&gt;|&#x3E;|&#62;)/gi,
    '{{ $1 }}'
  );

/**
 * Converts editor placeholders to the users-permissions interpolation form
 * and validates the result with the users-permissions rules: only
 * `<%= KEY %>` for allowlisted keys; no `<% %>` evaluation blocks, no
 * `${...}`, and no unknown `{{ }}` placeholders (they would reach the
 * recipient literally).
 *
 * @param {string} value - Subject or HTML from the editor
 * @param {string} field - 'subject' | 'message' (for the error details)
 * @returns {string}
 * @throws {errors.ValidationError}
 */
const editorToCore = (value, field) => {
  const input = typeof value === 'string' ? decodeMustacheTags(value) : '';
  const problems = [];

  const converted = input.replace(/\{\{\{?\s*=?\s*([^{}]*?)\s*\}?\}\}/g, (match, key) => {
    if (CORE_TEMPLATE_KEYS.includes(key)) return `<%= ${key} %>`;
    problems.push(`Unknown placeholder ${match.slice(0, 60)}`);
    return match;
  });

  if (/<%(?!=)/.test(converted)) problems.push('Evaluation blocks (<% %>) are not allowed');
  if (/(?<!\$)\$\{[^{}]*\}/.test(converted)) problems.push('${...} expressions are not allowed');
  for (const [, key] of converted.matchAll(/<%=\s*([\s\S]+?)\s*%>/g)) {
    if (!CORE_TEMPLATE_KEYS.includes(key.trim()))
      problems.push(`Unknown placeholder ${key.trim().slice(0, 60)}`);
  }

  if (problems.length > 0) {
    throw new errors.ValidationError(
      `Invalid ${field}: only ${CORE_TEMPLATE_KEYS.map((key) => `{{ ${key} }}`).join(', ')} are supported`,
      { [field]: [...new Set(problems)] }
    );
  }
  return converted;
};

/**
 * Builds a safe Document Service filter from a list query. Unknown keys,
 * operators and relation filters are dropped (SEC-16).
 *
 * @param {unknown} filters
 * @returns {object}
 */
const toListFilters = (filters) => {
  const out = {};
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return out;
  for (const [key, check] of Object.entries(LIST_FILTER_FIELDS)) {
    if (!(key in filters)) continue;
    let value = filters[key];
    if (key === 'isActive' && (value === 'true' || value === 'false')) value = value === 'true';
    if (key === 'templateReferenceId' && typeof value === 'string' && /^\d+$/.test(value))
      value = Number(value);
    if (check(value)) out[key] = value;
  }
  return out;
};

/**
 * True when two version snapshots have the same content.
 *
 * @param {object|null} a
 * @param {object|null} b
 * @returns {boolean}
 */
const sameSnapshot = (a, b) => {
  if (!a || !b) return false;
  return VERSION_FIELDS.every(
    (field) => JSON.stringify(a[field] ?? null) === JSON.stringify(b[field] ?? null)
  );
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
      filters: toListFilters(filters),
      sort: [{ createdAt: 'desc' }],
    });
  },

  /**
   * Get template by ID (numeric id or documentId) with populated versions.
   *
   * Numeric IDs are interpreted as `templateReferenceId` first (this is the
   * app-wide convention — see findById() below), then as legacy DB id.
   * Non-numeric strings are treated as Strapi v5 `documentId`s.
   */
  async findOne(idOrDocumentId) {
    const isNumericId = /^\d+$/.test(String(idOrDocumentId));

    if (isNumericId) {
      const result = await this.findById(Number(idOrDocumentId));
      if (result) return result;
    }

    return strapi.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: String(idOrDocumentId),
      populate: { versions: true },
    });
  },

  /**
   * Get template by numeric ID.
   *
   * CONTRACT — every HTTP route that carries `:id` (admin UI, REST callers,
   * magic-link's `magic_mail_template_id`, Strapi's own test-send) refers to
   * the user-visible `templateReferenceId`. That is what `TemplateList`
   * navigates with, what `EditorPage` reads from `useParams()`, and what the
   * `findAll()` response surfaces as `templateReferenceId` (alongside `.id`).
   *
   * So: we resolve the reference id FIRST. The DB id is only kept as a
   * best-effort fallback for very old installs that might have persisted
   * the Strapi primary key as their template key before the reference id
   * was introduced. Collisions between the two ID spaces are prevented on
   * create() (refId uniqueness is enforced there).
   *
   * We intentionally do NOT spam warn-logs in the success path: the
   * reference-id lookup IS the primary path.
   */
  async findById(id) {
    const numericId = Number(id);
    strapi.log.info(`[magic-mail] [LOOKUP] Finding template by ID: ${numericId}`);

    // 1. Primary: templateReferenceId. Every admin-UI route and every
    //    known external caller (magic-link, test-send, etc.) passes this.
    const byRefId = await strapi.documents(EMAIL_TEMPLATE_UID).findMany({
      filters: { templateReferenceId: numericId },
      limit: 1,
      populate: { versions: true },
    });

    if (byRefId.length > 0) {
      strapi.log.info(
        `[magic-mail] [SUCCESS] Found template by templateReferenceId ${numericId}: documentId=${byRefId[0].documentId}, name="${byRefId[0].name}"`
      );
      return byRefId[0];
    }

    // 2. Legacy fallback: internal Strapi DB id. Kept for pre-ref-id
    //    installs only. Emits INFO (not WARN) because this path is rare
    //    but valid; we want it visible without looking like an error.
    let byInternalId = null;
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      byInternalId = await strapi.db.query(EMAIL_TEMPLATE_UID).findOne({
        where: { id: numericId },
        populate: { versions: true },
      });
    }

    if (byInternalId) {
      strapi.log.info(
        `[magic-mail] [LEGACY-LOOKUP] No templateReferenceId=${numericId}; resolved via internal DB id=${numericId} → "${byInternalId.name}" (documentId=${byInternalId.documentId}). ` +
          `Consider storing the template's templateReferenceId (${byInternalId.templateReferenceId ?? 'none set'}) instead of its DB id to keep callers stable across migrations.`
      );
      return byInternalId;
    }

    strapi.log.warn(
      `[magic-mail] [WARNING] Template with ID ${numericId} not found (tried templateReferenceId and internal DB id)`
    );
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
   * First tries documentId, then falls back to the internal database id (Query Engine)
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
        strapi.log.info(
          `[magic-mail] [SUCCESS] Found version by documentId: ${version.documentId}`
        );
        return version;
      }
    }

    // Fallback: internal database id (Query Engine; the Document Service
    // only addresses documentIds).
    const numericId = Number(idOrDocumentId);
    if (isNumericId && Number.isSafeInteger(numericId) && numericId > 0) {
      strapi.log.info(`[magic-mail] [FALLBACK] Trying internal db id for version: ${numericId}`);
      const version = await strapi.db.query(EMAIL_TEMPLATE_VERSION_UID).findOne({
        where: { id: numericId },
        populate: { template: true },
      });
      if (version) {
        strapi.log.info(
          `[magic-mail] [SUCCESS] Found version by internal id ${numericId}: documentId=${version.documentId}`
        );
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

    // Resolve `templateReferenceId`.
    //
    // The content-type schema marks this field `required: true` and
    // `unique: true`, so every row MUST have an integer reference id.
    // Historically `create()` only validated when the caller passed one
    // and never auto-generated, which meant any UI/API request without
    // an explicit id (the wizard's default flow) failed at insert time
    // with a schema validation error. The validation layer also accepts
    // string OR number (see validation.js#emailDesigner.create) for
    // wizard compatibility, but the DB column is `integer` — so we coerce
    // here too. `_generateUniqueTemplateReferenceId()` already exists for
    // exactly this case (used by `duplicate()`); we just call it from the
    // standard creation path as well.
    let templateReferenceId;

    if (
      data.templateReferenceId !== undefined &&
      data.templateReferenceId !== null &&
      data.templateReferenceId !== ''
    ) {
      const parsed = parseInt(data.templateReferenceId, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(
          `Invalid templateReferenceId: '${data.templateReferenceId}' is not a positive integer`
        );
      }

      templateReferenceId = parsed;
    }

    // Check and insert under one database lease: the schema's `unique` is
    // checked by the application only, so two processes could otherwise
    // both pass the check and insert the same reference id.
    const template = await coordination.withLease(
      strapi,
      'template-reference-id',
      async () => {
        if (templateReferenceId !== undefined) {
          const existing = await this.findByReferenceId(templateReferenceId);
          if (existing) {
            throw new Error(`Template with reference ID ${templateReferenceId} already exists`);
          }
        } else {
          templateReferenceId = await this._generateUniqueTemplateReferenceId();
          strapi.log.info(
            `[magic-mail] [INFO] Auto-generated templateReferenceId=${templateReferenceId}`
          );
        }
        return strapi.documents(EMAIL_TEMPLATE_UID).create({
          data: {
            ...data,
            templateReferenceId,
            isActive: data.isActive !== undefined ? data.isActive : true,
          },
        });
      },
      { ttlMs: 30_000, waitMs: 15_000 }
    );

    strapi.log.info(
      `[magic-mail] [SUCCESS] Template created: documentId=${template.documentId}, name="${template.name}"`
    );

    // Version 1 is the created content.
    await this.snapshotVersion(template.documentId, template);

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
    strapi.log.info(
      `[magic-mail] [INFO] Found template: documentId=${actualDocumentId}, name="${template.name}"`
    );

    // 2. Update, then snapshot the saved content. Versions are the history
    //    of saved states: v1 = created content, every later version = one
    //    content change. Snapshotting the OLD content before the update
    //    duplicated v1 on the first save (FUN-23).
    const updateData = { ...data };
    delete updateData.versions;

    // Pre-4.0 histories hold the content before each save; make sure the
    // current (pre-update) state is not lost when it was never snapshotted.
    await this.snapshotVersion(actualDocumentId, template);

    const updated = await strapi.documents(EMAIL_TEMPLATE_UID).update({
      documentId: actualDocumentId,
      data: updateData,
    });

    await this.snapshotVersion(actualDocumentId, updated);

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
    strapi.log.info(
      `[magic-mail] [DELETE] Template: documentId=${actualDocumentId}, name="${template.name}"`
    );

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
          documentId: version.documentId,
        });
        strapi.log.info(`[magic-mail] [DELETE] Deleted version #${version.versionNumber}`);
      } catch (versionError) {
        strapi.log.warn(`[magic-mail] [WARNING] Failed to delete version: ${versionError.message}`);
      }
    }

    // Delete template using the actual documentId
    const result = await strapi.documents(EMAIL_TEMPLATE_UID).delete({
      documentId: actualDocumentId,
    });

    strapi.log.info(
      `[magic-mail] [SUCCESS] Template "${template.name}" and ${allVersions.length} versions deleted`
    );
    return result;
  },

  /**
   * Generate a new `templateReferenceId` guaranteed to fit in PostgreSQL's
   * `integer` column (max 2_147_483_647). We retry a few times to dodge
   * the astronomically unlikely collision with an already-used reference
   * id — the schema declares `unique: true`, so picking a duplicate here
   * would otherwise fail at insert time.
   *
   * Previous implementation used `Date.now()` which overflows the int4
   * range (13 digits vs. 10-digit max), producing a "value is out of range
   * for type integer" error on every duplicate call.
   *
   * @returns {Promise<number>}
   * @throws {Error} if no unique id can be found after MAX_ATTEMPTS tries
   */
  async _generateUniqueTemplateReferenceId() {
    const MAX_ATTEMPTS = 5;
    // Upper bound 2_000_000_000 leaves headroom under int4 max (~2.147B).
    const UPPER_BOUND = 2_000_000_000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidate = Math.floor(Math.random() * UPPER_BOUND) + 1;
      const existing = await this.findByReferenceId(candidate);
      if (!existing) return candidate;
      strapi.log.warn(
        `[magic-mail] [DUPLICATE] templateReferenceId collision on ${candidate} (attempt ${attempt + 1}/${MAX_ATTEMPTS}); retrying`
      );
    }

    throw new Error(
      `Could not generate a unique templateReferenceId after ${MAX_ATTEMPTS} attempts`
    );
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

    strapi.log.info(
      `[magic-mail] [PACKAGE] Original template: documentId=${original.documentId}, name="${original.name}"`
    );

    const newRefId = await this._generateUniqueTemplateReferenceId();

    const duplicateData = {
      name: `${original.name} copy`,
      subject: original.subject,
      design: original.design,
      bodyHtml: original.bodyHtml,
      bodyText: original.bodyText,
      category: original.category,
      tags: original.tags,
      isActive: original.isActive,
      templateReferenceId: newRefId,
    };

    const duplicated = await this.create(duplicateData);

    strapi.log.info(
      `[magic-mail] [SUCCESS] Template duplicated: documentId=${duplicated.documentId}, newRefId=${newRefId}`
    );
    return duplicated;
  },

  // ============================================================
  // VERSIONING OPERATIONS
  // ============================================================

  /**
   * Stores `content` as a new version unless it equals the latest version
   * (e.g. only isActive or the category changed).
   *
   * @param {string} templateDocumentId
   * @param {object} content - Template record or data with VERSION_FIELDS
   * @returns {Promise<object|null>} The new version, or null when unchanged
   */
  async snapshotVersion(templateDocumentId, content) {
    const snapshot = {};
    for (const field of VERSION_FIELDS) {
      if (content && content[field] !== undefined) snapshot[field] = content[field];
    }
    return this.createVersion(templateDocumentId, snapshot, { skipIfUnchanged: true });
  },

  /**
   * Create a new version for a template. Version numbers are assigned under
   * a per-template lock, so concurrent saves never share a number.
   *
   * @param {string} templateDocumentId
   * @param {object} data - Snapshot fields
   * @param {{skipIfUnchanged?: boolean}} [options]
   * @returns {Promise<object|null>}
   */
  async createVersion(templateDocumentId, data, { skipIfUnchanged = false } = {}) {
    return withVersionLock(strapi, String(templateDocumentId), () =>
      this._createVersionLocked(templateDocumentId, data, skipIfUnchanged)
    );
  },

  /** @private */
  async _createVersionLocked(templateDocumentId, data, skipIfUnchanged) {
    strapi.log.info(
      `[magic-mail] [SNAPSHOT] Creating version for template documentId: ${templateDocumentId}`
    );

    // 1. Verify template exists
    const template = await strapi.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: templateDocumentId,
    });
    if (!template) {
      throw new Error(`Template ${templateDocumentId} not found`);
    }

    strapi.log.info(
      `[magic-mail] [PACKAGE] Template found: documentId=${template.documentId}, name="${template.name}"`
    );

    // 2. Calculate next version number
    const existingVersions = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: templateDocumentId,
        },
      },
      sort: [{ versionNumber: 'desc' }],
    });

    if (skipIfUnchanged && existingVersions.length > 0) {
      const latest = existingVersions.reduce((a, b) =>
        (b.versionNumber || 0) > (a.versionNumber || 0) ? b : a
      );
      if (sameSnapshot(latest, data)) {
        return null;
      }
    }

    const versionNumber =
      existingVersions.length > 0
        ? Math.max(...existingVersions.map((v) => v.versionNumber || 0)) + 1
        : 1;

    strapi.log.info(
      `[magic-mail] [STATS] Existing versions: ${existingVersions.length} → Next version: #${versionNumber}`
    );

    // 3. Create version WITH template relation
    const createdVersion = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID).create({
      data: {
        versionNumber,
        ...data,
        template: templateDocumentId, // Document Service handles relations with documentId
      },
    });

    strapi.log.info(
      `[magic-mail] [SUCCESS] Version created: documentId=${createdVersion.documentId}, v${versionNumber}`
    );
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
    strapi.log.info(
      `[magic-mail] [PACKAGE] Template has ${template.versions?.length || 0} versions`
    );

    if (template.versions && template.versions.length > 0) {
      const sortedVersions = [...template.versions].sort(
        (a, b) => b.versionNumber - a.versionNumber
      );
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
    strapi.log.info(
      `[magic-mail] [RESTORE] Restoring template ${templateIdOrDocumentId} from version ${versionIdOrDocumentId}`
    );

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

    strapi.log.info(
      `[magic-mail] [SUCCESS] Template restored from version #${version.versionNumber}`
    );
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
      documentId: version.documentId,
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
          documentId: version.documentId,
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

    // Only Mustache tags are entity-decoded (editors store `{{ a &amp;&amp; b }}`
    // or `{{ x.&quot;y&quot; }}`). Decoding the whole body turned literal
    // escaped text such as `&lt;b&gt;` into real markup.
    const decodedHtml = decodeMustacheTags(bodyHtml);
    // Text body and subject are not HTML, so stored entities are decoded.
    const decodedText = decodeHtmlEntities(bodyText);
    const decodedSubject = decodeHtmlEntities(subject);

    // HTML body keeps Mustache's default HTML escaping. Plain text and the
    // subject line are NOT HTML, so escaping there corrupts values (e.g.
    // "Tom & Jerry" -> "Tom &amp; Jerry"). Render those with escaping disabled.
    const renderedHtml = Mustache.render(decodedHtml, data);

    const previousEscape = Mustache.escape;
    Mustache.escape = (value) => value;
    let renderedText;
    let renderedSubject;
    try {
      renderedText = Mustache.render(decodedText, data);
      renderedSubject = Mustache.render(decodedSubject, data);
    } finally {
      Mustache.escape = previousEscape;
    }

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
      isActive: template.isActive !== false,
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

        // Assign an int4-safe unique reference id when the import omitted one.
        if (!templateData.templateReferenceId) {
          templateData.templateReferenceId = await this._generateUniqueTemplateReferenceId();
        }

        strapi.log.info(
          `[magic-mail] [IMPORT] Processing: "${templateData.name}" (ref: ${templateData.templateReferenceId})`
        );

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
        strapi.log.error(
          `[magic-mail] [ERROR] Import failed for "${rawData.name}": ${error.message}`
        );
        results.push({
          success: false,
          action: 'failed',
          error: error.message,
          templateName: rawData.name,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    strapi.log.info(`[magic-mail] [IMPORT] Complete: ${successful} successful, ${failed} failed`);

    return results;
  },

  /**
   * Normalize import data from different export formats
   * Supports: magic-mail, strapi-plugin-email-designer-5, and generic formats
   */
  normalizeImportData(rawData) {
    // Map 'enabled' to 'isActive' (strapi-plugin-email-designer-5 format)
    const isActive =
      rawData.isActive !== undefined
        ? rawData.isActive
        : rawData.enabled !== undefined
          ? rawData.enabled
          : true;

    // Only carry an explicitly provided reference id here. A missing id is
    // filled in by the importer via _generateUniqueTemplateReferenceId(), which
    // guarantees an int4-safe unique value — Date.now() overflowed PostgreSQL's
    // integer column and broke every id-less import.
    const templateReferenceId = rawData.templateReferenceId || rawData.referenceId || null;

    // Determine category (default to 'custom' if not specified)
    const category = rawData.category || 'custom';

    // Parse tags if string
    let tags = rawData.tags;
    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
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
    const active = allTemplates.filter((t) => t.isActive === true).length;

    const categoryMap = allTemplates.reduce((acc, template) => {
      const category = template.category || 'custom';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const byCategory = Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count,
    }));

    // All features are free: templates are unlimited (-1).
    return {
      total,
      active,
      inactive: total - active,
      byCategory,
      maxTemplates: -1,
      remaining: -1,
    };
  },

  // ============================================================
  // STRAPI CORE EMAIL TEMPLATES
  // ============================================================

  /**
   * Returns the users-permissions plugin store, or throws when the plugin
   * is not installed (STR-08/STR-M04).
   *
   * @param {string} coreEmailType
   * @returns {Promise<{store: object, storeKey: string}>}
   * @throws {errors.ValidationError|errors.NotFoundError}
   */
  async _coreTemplateStore(coreEmailType) {
    const storeKey = CORE_TEMPLATE_STORE_KEYS[coreEmailType];
    if (!storeKey) {
      throw new errors.ValidationError('Invalid core email type');
    }
    if (typeof strapi.plugin !== 'function' || !strapi.plugin('users-permissions')) {
      throw new errors.NotFoundError('The Users & Permissions plugin is not installed');
    }
    const store = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });
    return { store, storeKey };
  },

  /**
   * Returns a users-permissions email template for the editor
   * (`<%= KEY %>` shown as `{{ KEY }}`).
   *
   * @param {'reset-password'|'email-confirmation'} coreEmailType
   * @returns {Promise<object>}
   */
  async getCoreTemplate(coreEmailType) {
    const { store, storeKey } = await this._coreTemplateStore(coreEmailType);
    const emailConfig = (await store.get({ key: 'email' })) || {};
    const data = emailConfig[storeKey] || null;

    const message = coreToEditor(data?.options?.message);
    const subject = coreToEditor(data?.options?.object);

    return {
      from: data?.options?.from || null,
      message,
      subject,
      bodyHtml: message,
      bodyText: message ? convertHtmlToText(message, { wordwrap: 130 }) : '',
      coreEmailType,
      design: data?.design || null,
      placeholders: CORE_TEMPLATE_KEYS,
    };
  },

  /**
   * Saves a users-permissions email template. Placeholders are converted to
   * `<%= KEY %>` and validated with the users-permissions rules before the
   * store is written (SEC-11, FUN-13, STR-02).
   *
   * @param {'reset-password'|'email-confirmation'} coreEmailType
   * @param {{message: string, subject: string, design?: object|null}} data
   * @returns {Promise<{message: string}>}
   * @throws {errors.ValidationError} For invalid placeholders or expressions
   */
  async updateCoreTemplate(coreEmailType, data) {
    const { storeKey } = await this._coreTemplateStore(coreEmailType);

    const message = editorToCore(data.message, 'message');
    const object = editorToCore(data.subject, 'subject');

    // The `email` key holds both users-permissions templates. A
    // compare-and-set update keeps a concurrent save of the other template
    // (another admin, another replica) instead of overwriting it.
    await coordination.updateStoreValue(
      strapi,
      { type: 'plugin', name: 'users-permissions', key: 'email' },
      (stored) => {
        const emailsConfig =
          stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
        const current = emailsConfig[storeKey] || {};
        emailsConfig[storeKey] = {
          ...current,
          options: {
            ...(current.options || {}),
            message,
            object,
          },
          design: data.design ?? current.design ?? null,
        };
        return emailsConfig;
      }
    );

    strapi.log.info(`[magic-mail] [SUCCESS] Core email template updated: ${storeKey}`);
    return { message: 'Saved' };
  },
});
