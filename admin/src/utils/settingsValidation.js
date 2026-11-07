/**
 * Pure helpers for the plugin settings form: normalisation, change detection
 * and client-side validation. The server (Zod schema pluginSettings.update)
 * stays authoritative; these checks only give early, field-level feedback.
 */
import { isValidEmailAddress } from './emailValidation.mjs';

/** Settings the form edits. Other stored settings are never sent. */
export const SETTINGS_DEFAULTS = Object.freeze({
  enableLinkTracking: true,
  enableOpenTracking: true,
  trackingBaseUrl: '',
  defaultFromName: '',
  defaultFromEmail: '',
  unsubscribeUrl: '',
  enableUnsubscribeHeader: true,
});

export const SETTINGS_KEYS = Object.freeze(Object.keys(SETTINGS_DEFAULTS));

const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 1000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Maps an API settings payload onto the form shape (booleans stay booleans, strings stay strings).
 * @param {Record<string, unknown>|null|undefined} data
 * @returns {typeof SETTINGS_DEFAULTS}
 */
export const normalizeSettings = (data) => {
  const source = data && typeof data === 'object' ? data : {};
  const result = {};
  for (const key of SETTINGS_KEYS) {
    const fallback = SETTINGS_DEFAULTS[key];
    const value = source[key];
    if (typeof fallback === 'boolean') {
      result[key] = typeof value === 'boolean' ? value : fallback;
    } else {
      result[key] = typeof value === 'string' ? value : '';
    }
  }
  return result;
};

/**
 * Returns only the keys whose value differs from the loaded snapshot, so a
 * save never overwrites settings the user did not touch.
 * @param {Record<string, unknown>} initial
 * @param {Record<string, unknown>} current
 * @returns {Record<string, unknown>}
 */
export const diffSettings = (initial, current) => {
  const changes = {};
  for (const key of SETTINGS_KEYS) {
    if (initial?.[key] !== current?.[key]) {
      const value = current?.[key];
      changes[key] = typeof value === 'string' ? value.trim() : value;
    }
  }
  return changes;
};

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

/**
 * @param {string} value
 * @returns {boolean} true for an http URL that does not point at the local machine
 */
export const isInsecureRemoteUrl = (value) => {
  const url = typeof value === 'string' ? parseUrl(value.trim()) : null;
  return Boolean(url && url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname));
};

/**
 * @param {string} value
 * @param {string[]} protocols
 * @returns {'invalidUrl'|'invalidProtocol'|null}
 */
const checkUrl = (value, protocols) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_URL_LENGTH || /\s/.test(trimmed)) return 'invalidUrl';
  // `{{email}}` is replaced per recipient when sending; validate a sample instead.
  const url = parseUrl(trimmed.split('{{email}}').join('user%40example.com'));
  if (!url) return 'invalidUrl';
  if (!protocols.includes(url.protocol)) return 'invalidProtocol';
  return null;
};

/**
 * Validates the editable settings.
 * @param {typeof SETTINGS_DEFAULTS} settings
 * @returns {Partial<Record<keyof typeof SETTINGS_DEFAULTS, 'invalidUrl'|'invalidProtocol'|'invalidEmail'|'invalidText'>>}
 *   error codes per field (empty object = valid)
 */
export const validateSettings = (settings) => {
  const errors = {};
  const trackingError = checkUrl(settings?.trackingBaseUrl ?? '', ['http:', 'https:']);
  if (trackingError) errors.trackingBaseUrl = trackingError;

  const unsubscribeError = checkUrl(settings?.unsubscribeUrl ?? '', ['http:', 'https:', 'mailto:']);
  if (unsubscribeError) errors.unsubscribeUrl = unsubscribeError;

  const email = (settings?.defaultFromEmail ?? '').trim();
  if (email && !isValidEmailAddress(email)) errors.defaultFromEmail = 'invalidEmail';

  const name = settings?.defaultFromName ?? '';
  if (name.length > MAX_NAME_LENGTH || /[\r\n]/.test(name)) errors.defaultFromName = 'invalidText';

  return errors;
};
