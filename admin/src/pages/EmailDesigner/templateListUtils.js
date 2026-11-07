/**
 * Pure helpers for the template list (search, pagination, test-send input).
 * Kept free of React so they can be unit tested in node.
 */
import { isValidEmailAddress } from '../../utils/emailValidation.mjs';

/**
 * The DS table cell (RawCell, DS 2.2.4) prevents the default of every key when
 * it holds several buttons (its grid navigation). That blocks native
 * Enter/Space activation and Tab. Those keys stay with the buttons; arrow keys
 * still move through the grid.
 */
const NATIVE_BUTTON_KEYS = new Set(['Enter', ' ', 'Tab']);

/** @param {KeyboardEvent} event */
export const keepNativeButtonKeys = (event) => {
  if (NATIVE_BUTTON_KEYS.has(event.key)) event.stopPropagation();
};

export const PAGE_SIZE_OPTIONS = Object.freeze([5, 10, 25, 50]);

/**
 * Case-insensitive search over name, subject and reference id.
 * Tolerates records with missing fields instead of throwing.
 *
 * @param {Array<object>} templates
 * @param {string} term
 * @returns {Array<object>}
 */
export const filterTemplates = (templates, term) => {
  const list = Array.isArray(templates) ? templates : [];
  const needle = String(term ?? '')
    .trim()
    .toLowerCase();
  if (!needle) return list;
  return list.filter((template) => {
    const name = String(template?.name ?? '').toLowerCase();
    const subject = String(template?.subject ?? '').toLowerCase();
    const reference = String(template?.templateReferenceId ?? '');
    return name.includes(needle) || subject.includes(needle) || reference.includes(needle);
  });
};

/**
 * Number of pages for a list (at least 1, so an empty list has page 1).
 * @param {number} itemCount
 * @param {number} pageSize
 * @returns {number}
 */
export const countPages = (itemCount, pageSize) => {
  const size = Number(pageSize) > 0 ? Number(pageSize) : 1;
  return Math.max(1, Math.ceil(Math.max(0, Number(itemCount) || 0) / size));
};

/**
 * Keeps the current page inside 1..totalPages (after deletes, filtering or a
 * page-size change).
 * @param {number} page
 * @param {number} totalPages
 * @returns {number}
 */
export const clampPage = (page, totalPages) => {
  const max = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = Math.floor(Number(page) || 1);
  return Math.min(Math.max(1, current), max);
};

/**
 * Up to `size` page numbers centred on the current page.
 * @param {number} currentPage
 * @param {number} totalPages
 * @param {number} [size=5]
 * @returns {number[]}
 */
export const getPageWindow = (currentPage, totalPages, size = 5) => {
  const total = Math.max(1, Math.floor(Number(totalPages) || 1));
  const count = Math.min(size, total);
  const current = clampPage(currentPage, total);
  let start = current - Math.floor(count / 2);
  start = Math.max(1, Math.min(start, total - count + 1));
  return Array.from({ length: count }, (_, index) => start + index);
};

/**
 * Splits a comma or semicolon separated recipient list.
 * @param {string} value
 * @returns {string[]}
 */
export const parseRecipientList = (value) =>
  String(value ?? '')
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Validates the template test-send form.
 *
 * @param {{to: string, cc: string}} input
 * @returns {{valid: boolean, errors: {to?: 'required'|'invalid', cc?: 'invalid'}, to: string, cc: string[]}}
 */
export const validateTestSendInput = ({ to, cc } = {}) => {
  const errors = {};
  const recipient = String(to ?? '').trim();
  if (!recipient) {
    errors.to = 'required';
  } else if (!isValidEmailAddress(recipient)) {
    errors.to = 'invalid';
  }

  const ccList = parseRecipientList(cc);
  if (ccList.some((address) => !isValidEmailAddress(address))) {
    errors.cc = 'invalid';
  }

  return { valid: Object.keys(errors).length === 0, errors, to: recipient, cc: ccList };
};

/**
 * Accepts only positive safe integers (template reference ids).
 * @param {unknown} value
 * @returns {number|null}
 */
export const toPositiveTemplateId = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\s*\d+\s*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Category -> DS 2 Badge variant (STR-11: never pass colour names as backgroundColor).
 */
export const CATEGORY_BADGE_VARIANTS = Object.freeze({
  transactional: 'primary',
  marketing: 'success',
  notification: 'secondary',
  custom: 'neutral',
});

/**
 * @param {string} category
 * @returns {'primary'|'success'|'secondary'|'neutral'}
 */
export const getCategoryVariant = (category) =>
  CATEGORY_BADGE_VARIANTS[category] ?? CATEGORY_BADGE_VARIANTS.custom;

/**
 * DS Badge props for a category. The DS 2.2.4 dark theme draws the `primary`
 * variant as primary700 (#7b79ff) on primary200 (#4a4a6a), 2.4:1. That badge
 * uses the primary100/primary600 pair instead (>= 4.5:1 in both schemes).
 *
 * @param {string} category
 * @returns {{variant: string}|{backgroundColor: string, textColor: string}}
 */
export const getCategoryBadgeProps = (category) => {
  const variant = getCategoryVariant(category);
  return variant === 'primary'
    ? { backgroundColor: 'primary100', textColor: 'primary600' }
    : { variant };
};

/**
 * Base URL of the Strapi server for copyable cURL examples. Uses the backend
 * URL the admin was built with, then the current origin. Never localhost.
 *
 * @param {Window|undefined} [win]
 * @returns {string}
 */
export const getBackendBaseUrl = (win = typeof window === 'undefined' ? undefined : window) => {
  const candidates = [win?.strapi?.backendURL, win?.location?.origin];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
      }
    } catch {
      // try the next candidate
    }
  }
  return 'https://your-strapi.example.com';
};
