/**
 * Pure helpers for the provider template screens (status mapping, labels,
 * variable checks). No React, so node --test can load them.
 */

/** Display names of the template providers (brand names, not translated). */
export const PROVIDER_NAMES = Object.freeze({
  sendgrid: 'SendGrid',
  mailgun: 'Mailgun',
  brevo: 'Brevo',
  ses: 'Amazon SES',
});

/** Account providers whose templates Magic Mail syncs (server: providers/index.js). */
export const TEMPLATE_PROVIDERS = Object.freeze(['sendgrid', 'mailgun', 'brevo', 'ses']);

/**
 * @param {Array<{provider?: string}>} accounts
 * @returns {boolean} true when at least one account can have provider templates
 */
export const hasTemplateProviderAccount = (accounts) =>
  Array.isArray(accounts) &&
  accounts.some((account) => TEMPLATE_PROVIDERS.includes(account?.provider));

const LOCALE_SHAPE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,3}$/;

/**
 * Canonical language tag (same rule as server/src/utils/locale.js), or null.
 *
 * @param {unknown} value - e.g. 'de', 'pt_br'
 * @returns {string|null} e.g. 'de', 'pt-BR'
 */
export const canonicalLocaleTag = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/_/g, '-');
  if (!trimmed || trimmed.length > 35 || !LOCALE_SHAPE.test(trimmed)) return null;
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null;
  } catch {
    return null;
  }
};

/**
 * Templates that can become a language version of `detail`: same provider,
 * not the template itself, not already used for a language, without
 * language versions of their own and not a version of another template.
 *
 * @param {{key: string, provider: string, locales?: {key: string}[]}} detail
 * @param {Array<{key: string, provider: string, locales?: object[], localeVariantOf?: string|null}>} templates
 * @returns {Array<{key: string, name: string}>}
 */
export const languageVersionCandidates = (detail, templates) => {
  const used = new Set((detail?.locales ?? []).map((entry) => entry.key));
  return (templates ?? []).filter(
    (template) =>
      template.provider === detail?.provider &&
      template.key !== detail?.key &&
      !used.has(template.key) &&
      !(template.locales ?? []).length &&
      (!template.localeVariantOf || template.localeVariantOf === detail?.key)
  );
};

/**
 * One status mapping for every provider template screen: badge tone, label
 * id and English default, and whether sending works.
 *
 * - ok: ready to send
 * - matchedByName: ready; found by name after its id changed (other environment)
 * - unpublished: the template has no active version at the provider
 * - missing: the template was deleted at the provider (or not found on sync)
 */
export const PROVIDER_STATUS = Object.freeze({
  ok: { tone: 'success', id: 'templates.provider.status.ok', label: 'Ready', usable: true },
  matchedByName: {
    tone: 'secondary',
    id: 'templates.provider.status.matchedByName',
    label: 'Matched by name',
    usable: true,
  },
  unpublished: {
    tone: 'warning',
    id: 'templates.provider.status.unpublished',
    label: 'No active version',
    usable: false,
  },
  missing: {
    tone: 'danger',
    id: 'templates.provider.status.missing',
    label: 'Deleted at provider',
    usable: false,
  },
});

/**
 * @param {string} status
 * @returns {{tone: string, id: string, label: string, usable: boolean}}
 */
export const statusInfo = (status) => PROVIDER_STATUS[status] ?? PROVIDER_STATUS.missing;

/**
 * @param {string} provider
 * @returns {string} Brand name, or the raw value for an unknown provider
 */
export const providerName = (provider) => PROVIDER_NAMES[provider] ?? String(provider ?? '');

/**
 * Plain-language messages for the conversion warning codes reported by the
 * server (utils/template-syntax.js).
 */
export const CONVERSION_WARNINGS = Object.freeze({
  SECTION_AMBIGUOUS: {
    id: 'templates.provider.warning.sectionAmbiguous',
    label: 'A Mustache section became an "if" block. Use "each" instead if the value is a list.',
  },
  HELPER_UNSUPPORTED: {
    id: 'templates.provider.warning.helperUnsupported',
    label: 'A helper such as "equal" has no Mustache version. The tag was kept; edit it by hand.',
  },
  ELSE_IF_UNSUPPORTED: {
    id: 'templates.provider.warning.elseIfUnsupported',
    label: '"else if" has no Mustache version. The block was kept; edit it by hand.',
  },
  DATA_VARIABLE_UNSUPPORTED: {
    id: 'templates.provider.warning.dataVariableUnsupported',
    label: 'Loop variables such as @index or ../ have no Mustache version.',
  },
  EACH_ELSE_UNSUPPORTED: {
    id: 'templates.provider.warning.eachElseUnsupported',
    label: '"else" inside a loop has no Mustache version. The block was kept.',
  },
  UNBALANCED_BLOCK: {
    id: 'templates.provider.warning.unbalanced',
    label: 'A block is not closed correctly. It was copied unchanged.',
  },
  UNBALANCED_SECTION: {
    id: 'templates.provider.warning.unbalanced',
    label: 'A block is not closed correctly. It was copied unchanged.',
  },
  PARTIAL_UNSUPPORTED: {
    id: 'templates.provider.warning.partialUnsupported',
    label: 'Partials are not supported. The tag was kept.',
  },
  DELIMITER_UNSUPPORTED: {
    id: 'templates.provider.warning.delimiterUnsupported',
    label: 'Changed delimiters are not supported. The rest was copied unchanged.',
  },
  PATH_UNSUPPORTED: {
    id: 'templates.provider.warning.pathUnsupported',
    label: 'A variable name with special characters was kept unchanged.',
  },
  UNSUPPORTED_TAG: {
    id: 'templates.provider.warning.unsupportedTag',
    label: 'A tag could not be converted and was kept unchanged.',
  },
  TOO_LARGE: {
    id: 'templates.provider.warning.tooLarge',
    label: 'The template is too large to check completely.',
  },
});

/**
 * @param {string} code
 * @returns {{id: string, label: string}}
 */
export const conversionWarning = (code) =>
  CONVERSION_WARNINGS[code] ?? CONVERSION_WARNINGS.UNSUPPORTED_TAG;

/**
 * Variables a template expects that Magic Mail does not send for a core mail.
 * Scoped variables (inside each/with) are relative and never reported.
 *
 * @param {Array<{path: string, root: string, scoped?: boolean}>} templateVariables
 * @param {string[]} sentNames - Names Magic Mail sends (`USER.email`, `url`, ...)
 * @returns {string[]} Missing paths, sorted
 */
export const missingCoreVariables = (templateVariables, sentNames) => {
  const sent = new Set(sentNames || []);
  const roots = new Set((sentNames || []).map((name) => name.split('.')[0]));
  return (templateVariables || [])
    .filter((variable) => !variable.scoped)
    .filter((variable) => {
      if (sent.has(variable.path)) return false;
      // `USER` and `user` are objects: a known root with an unknown field is missing.
      if (variable.path === variable.root) return !roots.has(variable.root);
      return true;
    })
    .map((variable) => variable.path)
    .sort();
};

/**
 * True when the last sync is older than ten minutes (or never ran).
 *
 * @param {string|null|undefined} lastSyncedAt
 * @param {number} [now]
 * @returns {boolean}
 */
export const isSyncStale = (lastSyncedAt, now = Date.now()) => {
  const time = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN;
  return !Number.isFinite(time) || now - time > 10 * 60 * 1000;
};
