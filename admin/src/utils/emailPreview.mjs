/**
 * Pure helpers of the email detail view (Analytics row click): preview
 * state messages, variable rows and the per-row tracking presentation.
 * No React, so `node --test` covers them directly.
 */

/** Text that the server stores in place of a masked value. */
export const MASK = '••••••';

/** Characters of a long value shown before "Show more". */
export const VALUE_PREVIEW_LENGTH = 160;

/** Preview widths of the Desktop / Mobile toggle (CSS px). */
export const PREVIEW_WIDTHS = Object.freeze({ desktop: 640, mobile: 375 });

/**
 * Notice for each preview state: translation key, English default and tone.
 * `null` means no notice.
 */
export const PREVIEW_STATE_NOTICES = Object.freeze({
  notStored: [
    'analytics.detail.preview.notStored',
    'No preview was stored for this email. Emails sent before Magic Mail 4.11 have none.',
    'neutral',
  ],
  templateMissing: [
    'analytics.detail.preview.templateMissing',
    'The template version used for this email no longer exists, so it can not be shown. The subject and the variables are still available.',
    'warning',
  ],
  noTemplate: [
    'analytics.detail.preview.noTemplate',
    'This email was sent without a template. To see emails like this, turn on "Store a copy of sent emails" in the settings.',
    'neutral',
  ],
  copyTooLarge: [
    'analytics.detail.preview.copyTooLarge',
    'This email was too large to store a copy.',
    'neutral',
  ],
});

/**
 * True when a value is the masked placeholder.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export const isMasked = (value) => value === MASK;

/**
 * Kind of a variable value for display.
 *
 * @param {unknown} value
 * @returns {'masked'|'object'|'array'|'text'|'number'|'boolean'|'empty'}
 */
export const valueKind = (value) => {
  if (value === null || value === undefined || value === '') return 'empty';
  if (isMasked(value)) return 'masked';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
};

/**
 * Child entries of an object or array value, as [label, value] pairs.
 * Arrays use their index; the label is shown as `[0]`.
 *
 * @param {object|Array} value
 * @returns {Array<[string, unknown]>}
 */
export const childEntries = (value) => {
  if (Array.isArray(value)) return value.map((item, index) => [`[${index}]`, item]);
  if (value && typeof value === 'object') return Object.entries(value);
  return [];
};

/**
 * Splits a long text into the visible part and whether it was shortened.
 *
 * @param {string} text
 * @param {number} [max]
 * @returns {{text: string, truncated: boolean}}
 */
export const truncateValue = (text, max = VALUE_PREVIEW_LENGTH) => {
  const value = String(text ?? '');
  if (value.length <= max) return { text: value, truncated: false };
  return { text: `${value.slice(0, max).trimEnd()}…`, truncated: true };
};

/**
 * Counts the variables (leaf values) of a stored variables object.
 *
 * @param {unknown} variables
 * @returns {number}
 */
export const countVariables = (variables) => {
  if (!variables || typeof variables !== 'object') return 0;
  let count = 0;
  const walk = (value, depth) => {
    if (depth > 10) return;
    const kind = valueKind(value);
    if (kind === 'object' || kind === 'array') {
      for (const [, child] of childEntries(value)) walk(child, depth + 1);
    } else count += 1;
  };
  for (const [, child] of childEntries(variables)) walk(child, 0);
  return count;
};

/**
 * Presentation of the Opened / Clicked cell of a log row.
 *
 * `metadata.trackingApplied` (4.11+) records whether Magic Mail added the
 * open pixel and rewrote links for this email. When it did not, a zero is
 * not "not opened" but "not tracked". Rows without the field (older logs)
 * keep the plain count.
 *
 * @param {{openCount?: number, clickCount?: number, metadata?: object, providerTracking?: boolean}} log
 * @param {'opens'|'clicks'} kind
 * @returns {'count'|'notTracked'}
 */
export const trackingCell = (log, kind) => {
  const count = kind === 'opens' ? log?.openCount : log?.clickCount;
  if (count > 0) return 'count';
  if (log?.providerTracking === true) return 'count';
  const applied = log?.metadata?.trackingApplied;
  if (applied && typeof applied === 'object' && applied[kind] === false) return 'notTracked';
  return 'count';
};

/**
 * Global tracking hint for the analytics page, from the stats response.
 *
 * @param {{openTracking?: boolean, linkTracking?: boolean, publicUrl?: boolean}|null|undefined} tracking
 * @returns {'off'|'noPublicUrl'|null}
 */
export const trackingHint = (tracking) => {
  if (!tracking || typeof tracking !== 'object') return null;
  if (tracking.openTracking === false && tracking.linkTracking === false) return 'off';
  if (tracking.publicUrl === false) return 'noPublicUrl';
  return null;
};

/**
 * Shortens a template name for the table cell; the full name goes to the
 * tooltip.
 *
 * @param {string|null|undefined} name
 * @param {number} [max]
 * @returns {{text: string, full: string, shortened: boolean}}
 */
export const shortTemplateName = (name, max = 28) => {
  const full = typeof name === 'string' ? name.trim() : '';
  if (full.length <= max) return { text: full, full, shortened: false };
  return { text: `${full.slice(0, max - 1).trimEnd()}…`, full, shortened: true };
};
