/**
 * Pure helpers for the template list (search, categories, test-send input).
 * Kept free of React so they can be unit tested in node.
 */
import { isValidEmailAddress } from '../../utils/emailValidation.mjs';

/** Page sizes of the template list (the shared table layer pages the rows). */
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
 * Category -> StatusBadge tone of the shared table layer (Magic Link tints,
 * >= 4.5:1 in light and dark mode).
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
