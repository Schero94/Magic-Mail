'use strict';

/**
 * Email content service: what the admin preview of a sent email is built
 * from.
 *
 * On send (`record`), one row per delivery log keeps the data needed to
 * re-render the email: the template (documentId plus a hash of the exact
 * content that was rendered), the template data and the `{{system.*}}` tags.
 * Every value is masked at store time (utils/content-privacy), so the
 * database never holds passwords, tokens, one-time codes or auth links.
 * Optionally (setting "Store a copy of sent emails", off by default) the
 * final HTML and text are kept as well, masked the same way and Brotli
 * compressed with a size cap.
 *
 * The preview (`preview`) re-renders with the same Mustache function and the
 * same outbound sanitiser as sending, or uses the stored copy, and returns a
 * sandbox-safe document without tracking pixels or live links
 * (utils/email-preview).
 *
 * Rows follow `emailContentRetentionDays` (default 30) and never outlive
 * their log (`tracking.logRetentionDays`, "Clear all", single delete).
 */

const sanitizeHtml = require('sanitize-html');
const contentPrivacy = require('../utils/content-privacy');
const emailPreview = require('../utils/email-preview');
const { renderTemplateContent } = require('./email-designer');
const { HTML_SANITIZE_OPTIONS } = require('./email-router');

const EMAIL_CONTENT_UID = 'plugin::magic-mail.email-content';
const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const MAX_TEXT_PREVIEW = 200 * 1024;
const TRACKING_ID = /^[a-f0-9]{32}$/;

/**
 * Effective preview settings with defaults for rows saved before 4.11
 * (new columns are null there).
 *
 * @param {object} [settings] - Plugin settings
 * @returns {{storeVariables: boolean, storeFull: boolean, retentionDays: number,
 *   denylist: string[], allowlist: string[]}}
 */
const contentSettings = (settings = {}) => {
  const days = Number(settings?.emailContentRetentionDays);
  return {
    storeVariables: settings?.storeEmailVariables !== false,
    storeFull: settings?.storeFullEmail === true,
    retentionDays:
      Number.isInteger(days) && days >= 1 && days <= 365 ? days : DEFAULT_RETENTION_DAYS,
    denylist: Array.isArray(settings?.variableDenylist) ? settings.variableDenylist : [],
    allowlist: Array.isArray(settings?.variableAllowlist) ? settings.variableAllowlist : [],
  };
};

/**
 * Retention in days, capped by the log retention (a content row never
 * outlives its log).
 *
 * @param {object} strapi
 * @param {object} settings
 * @returns {number}
 */
const effectiveRetentionDays = (strapi, settings) => {
  const { retentionDays } = contentSettings(settings);
  let logDays;
  try {
    logDays = Number(strapi.config.get('plugin::magic-mail.tracking.logRetentionDays', 0)) || 0;
  } catch {
    logDays = 0;
  }
  return logDays > 0 ? Math.min(retentionDays, logDays) : retentionDays;
};

/**
 * Whether the admin's Content-Security-Policy lets the preview iframe load
 * remote images. A `srcdoc` iframe inherits the admin page's CSP, so with
 * Strapi's default `img-src` ('self', data:, blob:, ...) "Load images" can
 * not show images from other hosts.
 *
 * @param {object} strapi
 * @returns {'all'|'some'|'none'} all: `https:`/`http:`/`*` allowed; some:
 *   specific hosts allowed; none: no remote host allowed
 */
const remoteImagesAllowedByCsp = (strapi) => {
  let middlewares;
  try {
    middlewares = strapi.config.get('middlewares', []);
  } catch {
    middlewares = [];
  }
  const entry = (Array.isArray(middlewares) ? middlewares : []).find(
    (item) =>
      item &&
      typeof item === 'object' &&
      (item.name === 'strapi::security' || item.resolve === 'strapi::security')
  );
  const directives = entry?.config?.contentSecurityPolicy?.directives || {};
  const img = directives['img-src'] ?? directives.imgSrc;
  if (!Array.isArray(img)) return 'none';
  const values = img.filter((value) => typeof value === 'string').map((v) => v.trim());
  if (values.some((value) => ['https:', 'http:', '*'].includes(value))) return 'all';
  const remote = values.filter(
    (value) =>
      !/^'/.test(value) && !['data:', 'blob:'].includes(value) && !/strapi\.io$/.test(value)
  );
  return remote.length > 0 ? 'some' : 'none';
};

module.exports = ({ strapi }) => ({
  contentSettings,

  /**
   * Stores the masked re-render data (and, when enabled, the masked copy)
   * of one send. Never throws: a failure only means no preview.
   *
   * @param {object} input
   * @param {{emailId: string}} input.emailLog - Delivery log of this send
   * @param {{html?: string, text?: string}} input.data - Working copy after
   *   sanitising, before tracking was added
   * @param {{templateDocumentId?: string, contentHash?: string, templateName?: string,
   *   renderData?: {variables?: object, system?: object}}|null} [input.renderedTemplate]
   * @param {object|null} [input.templateData] - Caller data when no template was rendered
   * @param {object} [input.settings] - Plugin settings
   * @returns {Promise<object|null>} The stored row, or null on failure
   * @sideeffect Creates one `email-content` row. Secrets are masked before
   *   the write; the raw values are never stored or logged.
   */
  async record({ emailLog, data, renderedTemplate = null, templateData = null, settings = {} }) {
    try {
      if (!emailLog || typeof emailLog.emailId !== 'string') return null;
      const cfg = contentSettings(settings);
      const lists = { denylist: cfg.denylist, allowlist: cfg.allowlist };

      const source =
        renderedTemplate?.renderData?.variables &&
        typeof renderedTemplate.renderData.variables === 'object'
          ? renderedTemplate.renderData.variables
          : templateData && typeof templateData === 'object' && !Array.isArray(templateData)
            ? templateData
            : null;

      const masked = contentPrivacy.maskVariables(source || {}, lists);
      const system = contentPrivacy.maskVariables(
        renderedTemplate?.renderData?.system || {},
        lists
      );
      const secrets = [...masked.secrets, ...system.secrets];

      const hasTemplate =
        typeof renderedTemplate?.templateDocumentId === 'string' &&
        typeof renderedTemplate?.contentHash === 'string';
      const hasVariables = source !== null && Object.keys(source).length > 0;

      let variablesState = 'none';
      if (!cfg.storeVariables) variablesState = 'disabled';
      else if (masked.tooLarge) variablesState = 'tooLarge';
      else if (hasVariables) variablesState = 'stored';

      let copyState = 'none';
      let htmlCopy = null;
      let textCopy = null;
      if (cfg.storeFull && (data?.html || data?.text)) {
        const html = contentPrivacy.maskStoredBody(data.html || '', secrets);
        const text = contentPrivacy.maskStoredBody(data.text || '', secrets);
        htmlCopy = html ? emailPreview.compressCopy(html) : null;
        textCopy = text ? emailPreview.compressCopy(text) : null;
        copyState =
          (html && !htmlCopy) || (text && !textCopy)
            ? 'tooLarge'
            : htmlCopy || textCopy
              ? 'stored'
              : 'none';
        if (copyState === 'tooLarge') {
          htmlCopy = null;
          textCopy = null;
        }
      }

      // A row is written for every send (also without template or data), so
      // the preview can say why it has nothing to show; "notStored" then only
      // means the mail predates 4.11.
      return await strapi.db.query(EMAIL_CONTENT_UID).create({
        data: {
          emailId: emailLog.emailId,
          templateDocumentId: hasTemplate ? renderedTemplate.templateDocumentId : null,
          templateHash: hasTemplate ? renderedTemplate.contentHash : null,
          templateName: renderedTemplate?.templateName
            ? String(renderedTemplate.templateName).slice(0, 255)
            : null,
          variablesState,
          variables: variablesState === 'stored' ? masked.variables : null,
          maskedPaths: variablesState === 'stored' ? masked.maskedPaths : null,
          systemTags: cfg.storeVariables && hasTemplate ? system.variables : null,
          copyState,
          htmlCopy,
          textCopy,
        },
      });
    } catch (error) {
      strapi.log.warn(
        `[magic-mail] Email preview data could not be stored: ${error?.name || 'Error'}`
      );
      return null;
    }
  },

  /**
   * Builds the preview of one sent email.
   *
   * States: `copy` (stored exact copy), `rerendered` (template re-rendered
   * from the stored data), `templateMissing` (the template version no
   * longer exists: subject and variables only), `noTemplate` (sent without
   * a template and no copy stored), `notStored` (no preview data, e.g. sent
   * before 4.11).
   *
   * @param {object} emailLog - email-log row (emailId, subject)
   * @param {{allowImages?: boolean}} [options]
   * @returns {Promise<object>} Preview DTO (no raw secrets: all stored data is masked)
   */
  async preview(emailLog, { allowImages = false } = {}) {
    const row = TRACKING_ID.test(emailLog?.emailId || '')
      ? await strapi.db.query(EMAIL_CONTENT_UID).findOne({ where: { emailId: emailLog.emailId } })
      : null;

    const base = {
      subject: emailLog?.subject || '',
      state: 'notStored',
      exactCopy: false,
      html: null,
      text: null,
      images: {
        allowed: Boolean(allowImages),
        blocked: 0,
        adminCsp: remoteImagesAllowedByCsp(strapi),
      },
      template: null,
      variables: null,
      maskedPaths: [],
      variablesState: 'none',
      variablesComplete: true,
    };
    if (!row) return base;

    const dto = {
      ...base,
      variablesState: row.variablesState || 'none',
      variables: row.variablesState === 'stored' ? row.variables || {} : null,
      maskedPaths: Array.isArray(row.maskedPaths) ? row.maskedPaths : [],
      template: row.templateName ? { name: row.templateName, versionNumber: null } : null,
    };

    let html = null;
    let text = null;
    if (row.copyState === 'stored') {
      html = emailPreview.decompressCopy(row.htmlCopy);
      text = emailPreview.decompressCopy(row.textCopy);
      dto.state = 'copy';
      dto.exactCopy = true;
    } else if (row.templateDocumentId && row.templateHash) {
      const rendered = await this.rerender(row);
      if (rendered) {
        html = rendered.html;
        text = rendered.text;
        dto.state = 'rerendered';
        dto.variablesComplete = row.variablesState === 'stored' || row.variablesState === 'none';
        dto.template = {
          name: row.templateName || rendered.content.name || null,
          versionNumber: rendered.content.versionNumber ?? null,
          current: rendered.content.source === 'current',
        };
      } else {
        dto.state = 'templateMissing';
      }
    } else if (row.copyState === 'tooLarge') {
      dto.state = 'copyTooLarge';
    } else {
      dto.state = 'noTemplate';
    }

    if (html !== null) {
      const doc = emailPreview.toPreviewDocument(html, { allowImages });
      dto.html = doc.html;
      dto.images = { ...dto.images, blocked: doc.blockedImages };
    }
    if (typeof text === 'string') dto.text = text.slice(0, MAX_TEXT_PREVIEW);
    return dto;
  },

  /**
   * Re-renders a stored email from its template version and masked data
   * with the send path's Mustache function and outbound sanitiser. For data
   * without masked values the result equals the HTML and text that were
   * handed to tracking and the provider.
   *
   * @param {object} row - email-content row
   * @returns {Promise<{html: string, text: string, subject: string, content: object}|null>}
   *   null when the template version no longer exists
   */
  async rerender(row) {
    if (!row?.templateDocumentId || !row?.templateHash) return null;
    const designer = strapi.plugin('magic-mail').service('email-designer');
    const content = await designer.findRenderedContent(row.templateDocumentId, row.templateHash);
    if (!content) return null;
    const variables = row.variablesState === 'stored' ? row.variables || {} : {};
    const rendered = renderTemplateContent(content, { ...variables, system: row.systemTags || {} });
    return {
      // Same outbound sanitiser as the send path (validateEmailSecurity).
      html: rendered.html ? sanitizeHtml(rendered.html, HTML_SANITIZE_OPTIONS) : '',
      text: rendered.text,
      subject: rendered.subject,
      content,
    };
  },

  /**
   * Account facts for the detail view (name and provider type only).
   *
   * @param {string|null} accountId - documentId stored on the log
   * @returns {Promise<{name: string, provider: string}|null>}
   */
  async accountSummary(accountId) {
    if (typeof accountId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(accountId)) return null;
    try {
      const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({
        documentId: accountId,
        fields: ['name', 'provider'],
      });
      return account ? { name: account.name, provider: account.provider } : null;
    } catch {
      return null;
    }
  },

  /**
   * Deletes the content rows of the given email ids (log deletion).
   *
   * @param {string[]} emailIds
   * @returns {Promise<number>}
   */
  async deleteForEmailIds(emailIds) {
    const ids = (emailIds || []).filter((id) => typeof id === 'string' && TRACKING_ID.test(id));
    if (ids.length === 0) return 0;
    let removed = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const result = await strapi.db
        .query(EMAIL_CONTENT_UID)
        .deleteMany({ where: { emailId: { $in: ids.slice(i, i + 500) } } });
      removed += typeof result?.count === 'number' ? result.count : 0;
    }
    return removed;
  },

  /**
   * Retention: deletes rows older than `emailContentRetentionDays` (capped by
   * the log retention), in batches by id.
   *
   * @param {Date} [now]
   * @returns {Promise<number>} Rows removed
   */
  async purgeExpired(now = new Date()) {
    let settings;
    try {
      settings = (await strapi.plugin('magic-mail').service('plugin-settings').getSettings()) || {};
    } catch {
      settings = {};
    }
    const days = effectiveRetentionDays(strapi, settings);
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const query = strapi.db.query(EMAIL_CONTENT_UID);
    let removed = 0;
    for (let guard = 0; guard < 1000; guard += 1) {
      const rows = await query.findMany({
        select: ['id'],
        where: { createdAt: { $lt: cutoff } },
        limit: 1000,
      });
      if (!rows || rows.length === 0) break;
      await query.deleteMany({ where: { id: { $in: rows.map((row) => row.id) } } });
      removed += rows.length;
      if (rows.length < 1000) break;
    }
    return removed;
  },
});

module.exports.contentSettings = contentSettings;
module.exports.remoteImagesAllowedByCsp = remoteImagesAllowedByCsp;
module.exports.effectiveRetentionDays = effectiveRetentionDays;
module.exports.EMAIL_CONTENT_UID = EMAIL_CONTENT_UID;
