const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks a sender or reply address before the account wizard advances.
 * Server-side Zod validation remains authoritative when the account is saved.
 *
 * @param {unknown} value - Email value from an admin form field
 * @returns {boolean} Whether the value is a bounded, single email address
 */
export function isValidEmailAddress(value) {
  return (
    typeof value === 'string' &&
    value.length <= MAX_EMAIL_LENGTH &&
    value === value.trim() &&
    EMAIL_PATTERN.test(value)
  );
}

/**
 * Checks an optional email field, accepting blank input and validating a value.
 *
 * @param {unknown} value - Optional email value from an admin form field
 * @returns {boolean} Whether the field is blank or contains a valid address
 */
export function isOptionalEmailAddressValid(value) {
  return typeof value === 'string' && (value.trim() === '' || isValidEmailAddress(value));
}
