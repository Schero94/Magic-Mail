'use strict';

/**
 * Provider templates: read-only copies of SendGrid dynamic templates and
 * Mailgun templates, synced into Magic Mail so they can be previewed, tested,
 * sent with `send({ providerTemplate })` and used for the core mails.
 *
 * - Sync is server-side and read-only at the provider, with the stored,
 *   encrypted account key. One row per (account, template).
 * - A template is identified in Magic Mail by its key `<provider>:<slug>`,
 *   derived from the provider-side name, so the same key works in every
 *   environment. A raw provider id is never accepted from callers.
 * - When a remote id disappears but the account has a template with the same
 *   name (a database promoted to another environment), the row is matched by
 *   name and marked `matchedByName`.
 * - Settings (fallback template per key, core-mail design choice) live in
 *   the plugin store `provider-templates`.
 */

const crypto = require('crypto');
const { errors } = require('@strapi/utils');
const coordination = require('../utils/coordination');
const { decryptCredentials } = require('../utils/encryption');
const { resolveMailgunRegion } = require('../utils/mailgun-region');
const {
  ProviderApiError,
  listMailgunTemplates,
  listSendGridTemplates,
  resolveSendGridRegion,
} = require('../utils/provider-api');
const { detectTemplateVariables } = require('../utils/template-variables');
const { handlebarsToMustache, mustacheToHandlebars } = require('../utils/template-syntax');
const { buildHtmlDesign } = require('../utils/html-design');
const {
  CORE_EMAIL_TYPES,
  buildCoreMailPayload,
  coreMailVariableNames,
} = require('../utils/core-mail-payload');

const PROVIDER_TEMPLATE_UID = 'plugin::magic-mail.provider-template';
const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';
const TEMPLATE_PROVIDERS = Object.freeze(['sendgrid', 'mailgun']);
const STORE = Object.freeze({ type: 'plugin', name: 'magic-mail', key: 'provider-templates' });
const STALE_AFTER_MS = 10 * 60 * 1000;
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_ROWS = 2000;
const USABLE_STATUSES = Object.freeze(['ok', 'matchedByName']);
const KEY_PATTERN = /^(sendgrid|mailgun):[a-z0-9][a-z0-9-]{0,99}$/;

/** Sample values for test sends; the same values local template tests use. */
const SAMPLE_DATA = Object.freeze({ name: 'Test User' });

/**
 * Turns a provider template name into the key slug: lower case ASCII letters,
 * digits and single dashes, at most 80 characters ('template' when empty).
 *
 * @param {unknown} name
 * @returns {string}
 */
function slugify(name) {
  const ascii = String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  let out = '';
  let dash = false;
  for (const char of ascii) {
    if ((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')) {
      out += char;
      dash = false;
    } else if (!dash && out.length > 0) {
      out += '-';
      dash = true;
    }
    if (out.length >= 80) break;
  }
  out = out.replace(/-+$/, '');
  return out || 'template';
}

/**
 * Validates the shape of a provider template key.
 *
 * @param {unknown} key
 * @returns {boolean}
 */
const isProviderTemplateKey = (key) => typeof key === 'string' && KEY_PATTERN.test(key);

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/**
 * Error with a stable `code` for provider-template sends and admin routes.
 *
 * @param {string} message - Client-safe message (names the template key only)
 * @param {string} code
 * @returns {Error}
 */
function templateError(message, code) {
  const error = new errors.ApplicationError(message);
  error.code = code;
  return error;
}

/**
 * Detects variables of one template; never throws.
 *
 * @param {{subject: string, html: string, text: string}} remote
 * @returns {{detected: object[], truncated: boolean}}
 */
function analyseVariables(remote) {
  try {
    const { variables, truncated } = detectTemplateVariables(
      [remote.subject, remote.html, remote.text].filter(Boolean).join('\n')
    );
    return { detected: variables, truncated };
  } catch {
    return { detected: [], truncated: true };
  }
}

/** Status order for a group: the best usable status wins. */
const STATUS_RANK = { ok: 0, matchedByName: 1, unpublished: 2, missing: 3 };

module.exports = ({ strapi }) => ({
  /**
   * The plugin-store state (fallbacks, core-mail designs, sync bookkeeping).
   *
   * @returns {Promise<{fallbacks: object, coreMails: object, accounts: object, lastSyncedAt: string|null}>}
   */
  async getState() {
    const store = await strapi.store({ type: STORE.type, name: STORE.name });
    const value = (await store.get({ key: STORE.key })) || {};
    return {
      fallbacks: value.fallbacks && typeof value.fallbacks === 'object' ? value.fallbacks : {},
      coreMails: value.coreMails && typeof value.coreMails === 'object' ? value.coreMails : {},
      accounts: value.accounts && typeof value.accounts === 'object' ? value.accounts : {},
      lastSyncedAt: typeof value.lastSyncedAt === 'string' ? value.lastSyncedAt : null,
    };
  },

  /**
   * Compare-and-set update of the plugin-store state.
   *
   * @param {(state: object) => object} mutate - Returns the new state
   * @returns {Promise<object>}
   * @sideeffect Writes the plugin store key `provider-templates`.
   */
  async updateState(mutate) {
    return coordination.updateStoreValue(strapi, STORE, (stored) => {
      const current = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
      return mutate({
        fallbacks: { ...(current.fallbacks || {}) },
        coreMails: { ...(current.coreMails || {}) },
        accounts: { ...(current.accounts || {}) },
        lastSyncedAt: current.lastSyncedAt || null,
      });
    });
  },

  /**
   * SendGrid and Mailgun accounts (active or not). Provider templates are
   * hidden in the admin while this list is empty.
   *
   * @returns {Promise<Array<{documentId: string, name: string, provider: string, isActive: boolean, config: unknown}>>}
   */
  async templateAccounts() {
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { provider: { $in: TEMPLATE_PROVIDERS } },
      sort: [{ priority: 'desc' }, { name: 'asc' }],
      limit: 200,
    });
    return Array.isArray(accounts) ? accounts : [];
  },

  /**
   * All synced rows.
   *
   * @returns {Promise<object[]>}
   */
  async rows() {
    const rows = await strapi.documents(PROVIDER_TEMPLATE_UID).findMany({
      sort: [{ name: 'asc' }],
      limit: MAX_ROWS,
    });
    return Array.isArray(rows) ? rows : [];
  },

  /**
   * Reads the templates of one account from its provider.
   *
   * @param {object} account
   * @returns {Promise<{templates: object[], warning: string|null}>}
   * @throws {ProviderApiError|Error} With a `code` (CREDENTIALS, AUTH, RATE_LIMITED, ...)
   */
  async fetchRemote(account) {
    let config;
    try {
      config = decryptCredentials(account.config) || {};
    } catch {
      throw new ProviderApiError('CREDENTIALS');
    }
    if (!config.apiKey) throw new ProviderApiError('CREDENTIALS');
    if (account.provider === 'sendgrid') {
      if (!resolveSendGridRegion(config.region)) throw new ProviderApiError('CREDENTIALS');
      return { templates: await listSendGridTemplates(config), warning: null };
    }
    const region = resolveMailgunRegion(config.region);
    if (!region || !config.domain) throw new ProviderApiError('CREDENTIALS');
    const { templates, accountScopeError } = await listMailgunTemplates(config, region);
    return {
      templates,
      warning: accountScopeError && accountScopeError !== 'AUTH' ? accountScopeError : null,
    };
  },

  /**
   * Syncs every SendGrid/Mailgun account. Concurrent calls (other admins,
   * other replicas) wait for the running sync instead of starting another.
   * An account whose provider call fails keeps its previous rows and reports
   * the error code; rows are only marked missing after a successful read.
   *
   * @param {{force?: boolean}} [options] - Without force, a sync finished in
   *   the last 10 minutes is reused
   * @returns {Promise<object>} The overview (see overview())
   * @sideeffect Calls the provider APIs (read-only); creates, updates and
   *   deletes provider-template rows; writes the plugin store.
   */
  async sync({ force = false } = {}) {
    const started = Date.now();
    await coordination.withLease(
      strapi,
      'provider-templates:sync',
      async () => {
        const state = await this.getState();
        const last = state.lastSyncedAt ? Date.parse(state.lastSyncedAt) : 0;
        // Another process finished a sync while this one waited.
        if (!force && last && last >= started - 1000) return;
        if (!force && last && Date.now() - last < STALE_AFTER_MS) return;
        await this.runSync();
      },
      { ttlMs: 5 * 60 * 1000, waitMs: 2 * 60 * 1000 }
    );
    return this.overview();
  },

  /**
   * The sync itself (called under the sync lease).
   *
   * @returns {Promise<void>}
   */
  async runSync() {
    const accounts = await this.templateAccounts();
    const accountIds = new Set(accounts.map((account) => account.documentId));
    const rows = await this.rows();
    const now = new Date().toISOString();
    const accountResults = {};

    // Rows of deleted accounts or of accounts that changed provider.
    for (const row of rows) {
      const account = accounts.find((a) => a.documentId === row.accountDocumentId);
      if (!accountIds.has(row.accountDocumentId) || account?.provider !== row.provider) {
        await strapi.documents(PROVIDER_TEMPLATE_UID).delete({ documentId: row.documentId });
      }
    }
    const liveRows = rows.filter((row) => {
      const account = accounts.find((a) => a.documentId === row.accountDocumentId);
      return account && account.provider === row.provider;
    });

    // Keys already in use per provider: existing keys never change.
    const keyOwners = new Map();
    for (const row of liveRows) keyOwners.set(row.key, row.name);
    const keyFor = (provider, name) => {
      const existing = liveRows.find((row) => row.provider === provider && row.name === name);
      if (existing) return existing.key;
      let key = `${provider}:${slugify(name)}`;
      if (keyOwners.has(key) && keyOwners.get(key) !== name) {
        key = `${provider}:${slugify(name).slice(0, 72)}-${hash(name).slice(0, 6)}`;
      }
      keyOwners.set(key, name);
      return key;
    };

    for (const account of accounts) {
      let remote;
      try {
        remote = await this.fetchRemote(account);
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : 'UNAVAILABLE';
        accountResults[account.documentId] = { lastSyncedAt: null, error: code, warning: null };
        strapi.log.warn(`[magic-mail] Provider template sync failed for one account (${code})`);
        continue;
      }
      const own = liveRows.filter((row) => row.accountDocumentId === account.documentId);
      const matchedRowIds = new Set();
      const remoteIds = new Set(remote.templates.map((t) => t.remoteId));

      for (const template of remote.templates) {
        let row = own.find((r) => r.remoteId === template.remoteId);
        let status = template.activeVersion ? 'ok' : 'unpublished';
        if (!row) {
          // The stored id vanished (other environment): match by exact name.
          row = own.find(
            (r) =>
              !matchedRowIds.has(r.documentId) &&
              !remoteIds.has(r.remoteId) &&
              r.name === template.name
          );
          if (row && status === 'ok') status = 'matchedByName';
        } else if (row.status === 'matchedByName' && status === 'ok') {
          status = 'matchedByName';
        }
        const previewTooLarge = Buffer.byteLength(template.html || '') > MAX_PREVIEW_BYTES;
        const variables = analyseVariables(template);
        const data = {
          provider: account.provider,
          accountDocumentId: account.documentId,
          remoteScope: template.scope,
          remoteId: template.remoteId,
          name: template.name,
          activeVersion: template.activeVersion,
          subject: template.subject,
          updatedAtProvider: template.updatedAt,
          variables: { ...variables, previewTooLarge },
          previewHtml: previewTooLarge ? '' : template.html,
          previewText: (template.text || '').slice(0, MAX_PREVIEW_BYTES),
          lastSyncedAt: now,
          status,
        };
        if (row) {
          matchedRowIds.add(row.documentId);
          await strapi
            .documents(PROVIDER_TEMPLATE_UID)
            .update({ documentId: row.documentId, data });
        } else {
          await strapi.documents(PROVIDER_TEMPLATE_UID).create({
            data: { ...data, key: keyFor(account.provider, template.name) },
          });
        }
      }

      for (const row of own) {
        if (matchedRowIds.has(row.documentId)) continue;
        if (row.status !== 'missing') {
          await strapi.documents(PROVIDER_TEMPLATE_UID).update({
            documentId: row.documentId,
            data: { status: 'missing', lastSyncedAt: now },
          });
        }
      }
      accountResults[account.documentId] = {
        lastSyncedAt: now,
        error: null,
        warning: remote.warning,
      };
    }

    await this.updateState((state) => ({
      ...state,
      accounts: accountResults,
      lastSyncedAt: now,
    }));
    strapi.log.info('[magic-mail] Provider templates synced');
  },

  /**
   * Groups rows by key for the admin list.
   *
   * @param {object[]} rows
   * @param {Map<string, object>} accountsById
   * @param {object} state
   * @returns {object[]}
   */
  groupRows(rows, accountsById, state) {
    const groups = new Map();
    for (const row of rows) {
      const account = accountsById.get(row.accountDocumentId);
      if (!account) continue;
      const group = groups.get(row.key) || { key: row.key, provider: row.provider, rows: [] };
      group.rows.push({ row, account });
      groups.set(row.key, group);
    }
    const coreUsage = (key) =>
      CORE_EMAIL_TYPES.filter((type) => state.coreMails?.[type]?.providerTemplate === key);

    return [...groups.values()]
      .map(({ key, provider, rows: members }) => {
        const usable = members.filter(
          ({ row, account }) => USABLE_STATUSES.includes(row.status) && account.isActive !== false
        );
        const best = [...members].sort(
          (a, b) =>
            STATUS_RANK[a.row.status] - STATUS_RANK[b.row.status] ||
            String(b.row.updatedAtProvider || '').localeCompare(
              String(a.row.updatedAtProvider || '')
            )
        )[0].row;
        const status =
          usable.length > 0
            ? best.status
            : members.some((m) => m.row.status === 'unpublished')
              ? 'unpublished'
              : 'missing';
        const updatedAtProvider = members
          .map((m) => m.row.updatedAtProvider)
          .filter(Boolean)
          .sort()
          .pop();
        const fallback = state.fallbacks?.[key];
        return {
          key,
          provider,
          name: best.name,
          subject: best.subject || '',
          status,
          usable: usable.length > 0,
          updatedAtProvider: updatedAtProvider ? new Date(updatedAtProvider).toISOString() : null,
          accounts: members.map(({ row, account }) => ({
            documentId: account.documentId,
            name: account.name,
            isActive: account.isActive !== false,
            status: row.status,
          })),
          variableCount: Array.isArray(best.variables?.detected)
            ? best.variables.detected.length
            : 0,
          fallbackTemplateReferenceId: Number.isInteger(fallback) ? fallback : null,
          usedByCoreMails: coreUsage(key),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * The admin overview: provider accounts, grouped templates and sync state.
   *
   * @returns {Promise<{enabled: boolean, accounts: object[], templates: object[], lastSyncedAt: string|null, stale: boolean}>}
   */
  async overview() {
    const [accounts, rows, state] = await Promise.all([
      this.templateAccounts(),
      this.rows(),
      this.getState(),
    ]);
    const accountsById = new Map(accounts.map((a) => [a.documentId, a]));
    const lastSyncedAt = state.lastSyncedAt;
    return {
      enabled: accounts.length > 0,
      accounts: accounts.map((account) => ({
        documentId: account.documentId,
        name: account.name,
        provider: account.provider,
        isActive: account.isActive !== false,
        lastSyncedAt: state.accounts?.[account.documentId]?.lastSyncedAt || null,
        error: state.accounts?.[account.documentId]?.error || null,
        warning: state.accounts?.[account.documentId]?.warning || null,
      })),
      templates: this.groupRows(rows, accountsById, state),
      lastSyncedAt,
      stale:
        accounts.length > 0 &&
        (!lastSyncedAt || Date.now() - Date.parse(lastSyncedAt) > STALE_AFTER_MS),
    };
  },

  /**
   * Details of one template for the preview dialog.
   *
   * @param {string} key - Provider template key
   * @returns {Promise<object>}
   * @throws {errors.NotFoundError} When no synced template has this key
   */
  async detail(key) {
    if (!isProviderTemplateKey(key)) throw new errors.NotFoundError('Provider template not found');
    const overview = await this.overview();
    const group = overview.templates.find((t) => t.key === key);
    if (!group) throw new errors.NotFoundError('Provider template not found');
    const rows = (await this.rows()).filter((row) => row.key === key);
    const best =
      rows.find((r) => r.status === 'ok') ||
      rows.find((r) => r.status === 'matchedByName') ||
      rows[0];
    const detected = Array.isArray(best?.variables?.detected) ? best.variables.detected : [];
    let toMustacheWarnings;
    try {
      toMustacheWarnings = [
        ...handlebarsToMustache(best?.subject || '').warnings,
        ...handlebarsToMustache(best?.previewHtml || '').warnings,
      ];
    } catch {
      toMustacheWarnings = [{ code: 'TOO_LARGE', line: 0, tag: '' }];
    }
    const sample = this.sampleData(group, 'admin@example.test');
    const provided = new Set(Object.keys(sample));
    return {
      ...group,
      previewHtml: best?.previewHtml || '',
      previewText: best?.previewText || '',
      previewTooLarge: best?.variables?.previewTooLarge === true,
      variables: detected.map((variable) => ({
        path: variable.path,
        root: variable.root,
        raw: variable.raw === true,
        scoped: variable.scoped === true,
        inSample: variable.scoped === true || provided.has(variable.root),
      })),
      variablesTruncated: best?.variables?.truncated === true,
      sampleData: sample,
      coreMailVariables: group.usedByCoreMails.length
        ? coreMailVariableNames(group.usedByCoreMails[0])
        : [],
      copyWarnings: toMustacheWarnings.slice(0, 50),
      usage: `await strapi.plugin('magic-mail').service('email-router').send({\n  to: 'user@example.com',\n  providerTemplate: '${key}',\n  data: { name: 'Ada' },\n});`,
    };
  },

  /**
   * Sample template data for test sends: the local-template sample values,
   * plus core-mail sample data when a core mail uses the template.
   *
   * @param {{key: string, usedByCoreMails: string[]}} group
   * @param {string} to - Test recipient
   * @returns {object}
   */
  sampleData(group, to) {
    const base = { ...SAMPLE_DATA, email: to };
    const coreType = group.usedByCoreMails?.[0];
    if (!coreType) return base;
    return {
      ...base,
      ...buildCoreMailPayload(
        coreType,
        {
          URL: 'https://app.example.test/auth',
          SERVER_URL: 'https://api.example.test',
          ADMIN_URL: 'https://api.example.test/admin',
          USER: { id: 1, email: to, username: 'test.user' },
          TOKEN: 'sample-token',
          CODE: 'sample-code',
        },
        { templateKey: group.key }
      ),
    };
  },

  /**
   * Rows that may send a key: usable status on an active account.
   *
   * @param {string} key
   * @returns {Promise<{rows: object[], known: boolean, name: string|null, fallbackTemplateReferenceId: number|null}>}
   */
  async resolveForSend(key) {
    if (!isProviderTemplateKey(key)) {
      return { rows: [], known: false, name: null, fallbackTemplateReferenceId: null };
    }
    const rows = await strapi.documents(PROVIDER_TEMPLATE_UID).findMany({
      filters: { key },
      limit: 200,
    });
    const state = await this.getState();
    const fallback = state.fallbacks?.[key];
    const all = Array.isArray(rows) ? rows : [];
    return {
      rows: all.filter((row) => USABLE_STATUSES.includes(row.status)),
      known: all.length > 0,
      name: all[0]?.name || null,
      fallbackTemplateReferenceId: Number.isInteger(fallback) ? fallback : null,
    };
  },

  /**
   * Sets or clears the local fallback template of a key.
   *
   * @param {string} key
   * @param {number|null} templateReferenceId - Local template, null to clear
   * @returns {Promise<{fallbackTemplateReferenceId: number|null}>}
   * @throws {errors.NotFoundError|errors.ValidationError}
   * @sideeffect Writes the plugin store.
   */
  async setFallback(key, templateReferenceId) {
    await this.detail(key);
    if (templateReferenceId !== null) {
      const local = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .findByReferenceId(templateReferenceId);
      if (!local) {
        throw new errors.ValidationError('The fallback template does not exist', {
          fallbackTemplateReferenceId: ['Unknown template'],
        });
      }
    }
    await this.updateState((state) => {
      const fallbacks = { ...state.fallbacks };
      if (templateReferenceId === null) delete fallbacks[key];
      else fallbacks[key] = templateReferenceId;
      return { ...state, fallbacks };
    });
    return { fallbackTemplateReferenceId: templateReferenceId };
  },

  /**
   * Creates a local Magic Mail template from a provider template (HTML-only
   * copy; Handlebars blocks converted to Mustache where possible).
   *
   * @param {string} key
   * @returns {Promise<{templateReferenceId: number, name: string, warnings: object[]}>}
   * @throws {errors.NotFoundError} Unknown key
   * @throws {errors.ValidationError} When the template has no content to copy
   * @sideeffect Creates a template (and its first version).
   */
  async copyAsLocal(key) {
    const detail = await this.detail(key);
    if (!detail.previewHtml) {
      throw new errors.ValidationError('This template has no content to copy', {
        key: ['No active version with HTML content'],
      });
    }
    const html = handlebarsToMustache(detail.previewHtml);
    const subject = handlebarsToMustache(detail.subject || '');
    const created = await strapi
      .plugin('magic-mail')
      .service('email-designer')
      .create({
        name: `${detail.name} (copy)`.slice(0, 200),
        subject: (subject.output || detail.name).slice(0, 255),
        bodyHtml: html.output,
        bodyText: '',
        design: buildHtmlDesign(html.output),
        category: 'transactional',
        isActive: true,
        tags: ['provider-copy'],
      });
    return {
      templateReferenceId: created.templateReferenceId,
      name: created.name,
      warnings: [...subject.warnings, ...html.warnings].slice(0, 50),
    };
  },

  /**
   * Converts a local template's Mustache logic to Handlebars for upload at
   * the provider ("Convert for provider"). Read-only.
   *
   * @param {number|string} idOrReferenceId
   * @returns {Promise<{name: string, subject: string, html: string, warnings: object[]}>}
   * @throws {errors.NotFoundError}
   */
  async convertLocalForProvider(idOrReferenceId) {
    const designer = strapi.plugin('magic-mail').service('email-designer');
    const template =
      (await designer.findByReferenceId(idOrReferenceId)) ||
      (await designer.findOne(idOrReferenceId));
    if (!template) throw new errors.NotFoundError('Template not found');
    const html = mustacheToHandlebars(template.bodyHtml || '');
    const subject = mustacheToHandlebars(template.subject || '');
    return {
      name: template.name,
      subject: subject.output,
      html: html.output,
      warnings: [...subject.warnings, ...html.warnings].slice(0, 50),
    };
  },

  /**
   * Core-mail design choices with the state of the chosen template.
   *
   * @returns {Promise<Record<string, object>>}
   */
  async coreDesigns() {
    const [state, overview] = await Promise.all([this.getState(), this.overview()]);
    const out = {};
    for (const type of CORE_EMAIL_TYPES) {
      const choice = state.coreMails?.[type] || {};
      const key = isProviderTemplateKey(choice.providerTemplate) ? choice.providerTemplate : null;
      const group = key ? overview.templates.find((t) => t.key === key) : null;
      out[type] = {
        mode: key ? 'provider' : 'designer',
        providerTemplate: key,
        templateName: group?.name || null,
        provider: group?.provider || (key ? key.split(':')[0] : null),
        status: key ? (group ? group.status : 'missing') : null,
        usable: key ? Boolean(group?.usable) : true,
        fallbackToDesigner: choice.fallbackToDesigner === true,
        updatedAt: choice.updatedAt || null,
        variables: coreMailVariableNames(type),
      };
    }
    return out;
  },

  /**
   * Sets the design of a core mail: the Magic Mail designer (providerTemplate
   * null) or a synced provider template.
   *
   * @param {'reset-password'|'email-confirmation'} coreEmailType
   * @param {{providerTemplate: string|null, fallbackToDesigner?: boolean}} input
   * @param {{id?: number|string}|undefined} adminUser - The admin making the change
   * @returns {Promise<object>} The new design entry (see coreDesigns())
   * @throws {errors.ValidationError} Unknown core type or template
   * @sideeffect Writes the plugin store; logs the change (without personal data).
   */
  async setCoreDesign(coreEmailType, input, adminUser) {
    if (!CORE_EMAIL_TYPES.includes(coreEmailType)) {
      throw new errors.ValidationError('Invalid core email type');
    }
    const key = input.providerTemplate ?? null;
    if (key !== null) {
      const overview = await this.overview();
      const group = overview.templates.find((t) => t.key === key);
      if (!group) {
        throw new errors.ValidationError('This provider template is not synced', {
          providerTemplate: ['Unknown provider template'],
        });
      }
    }
    await this.updateState((state) => {
      const coreMails = { ...state.coreMails };
      if (key === null) {
        delete coreMails[coreEmailType];
      } else {
        coreMails[coreEmailType] = {
          providerTemplate: key,
          fallbackToDesigner: input.fallbackToDesigner === true,
          updatedAt: new Date().toISOString(),
          updatedBy: adminUser?.id ?? null,
        };
      }
      return { ...state, coreMails };
    });
    // Change record for operators. No personal data: key and type only.
    strapi.log.info(
      `[magic-mail] [AUDIT] Core email design changed: ${coreEmailType} -> ${key ? key : 'designer'}`
    );
    try {
      strapi.eventHub?.emit?.('magic-mail.core-email.design.update', {
        coreEmailType,
        providerTemplate: key,
        fallbackToDesigner: input.fallbackToDesigner === true,
        adminUserId: adminUser?.id ?? null,
      });
    } catch {
      // Listeners must not break the save.
    }
    return (await this.coreDesigns())[coreEmailType];
  },

  /**
   * The design entry used when a core mail is sent (no overview, one store read).
   *
   * @param {string} coreEmailType
   * @returns {Promise<{providerTemplate: string, fallbackToDesigner: boolean}|null>}
   */
  async coreDesignFor(coreEmailType) {
    const state = await this.getState();
    const choice = state.coreMails?.[coreEmailType];
    if (!choice || !isProviderTemplateKey(choice.providerTemplate)) return null;
    return {
      providerTemplate: choice.providerTemplate,
      fallbackToDesigner: choice.fallbackToDesigner === true,
    };
  },
});

module.exports.isProviderTemplateKey = isProviderTemplateKey;
module.exports.slugify = slugify;
module.exports.templateError = templateError;
module.exports.STALE_AFTER_MS = STALE_AFTER_MS;
module.exports.SAMPLE_DATA = SAMPLE_DATA;
