/**
 * Pure helpers for the routing-rules view (no React, unit-tested in
 * tests/admin-routing-ui.test.js).
 */

/** Priority range accepted by the server (validation.js routingRules.*). */
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 1_000_000;
export const DEFAULT_PRIORITY = 1;

/** Rules at or above this priority count as "high priority" in the stats. */
export const HIGH_PRIORITY_THRESHOLD = 5;

/** Match types supported by the server, in the order shown in the form. */
export const MATCH_TYPES = ['emailType', 'recipient', 'subject', 'template', 'custom'];

/**
 * Translated label for a match type. Unknown values fall back to the raw value
 * so a rule with an unexpected type is never shown with an empty badge.
 * @param {string} matchType
 * @param {(key: string, defaultMessage: string, values?: object) => string} t
 * @returns {string}
 */
export const getMatchTypeLabel = (matchType, t) => {
  switch (matchType) {
    case 'emailType':
      return t('routing.matchType.emailType', 'Email Type');
    case 'recipient':
      return t('routing.matchType.recipient', 'Recipient');
    case 'subject':
      return t('routing.matchType.subject', 'Subject');
    case 'template':
      return t('routing.matchType.template', 'Template');
    case 'custom':
      return t('routing.matchType.custom', 'Custom Field');
    default:
      return String(matchType ?? '');
  }
};

/**
 * Orders rules the way the email router evaluates them: highest priority
 * first. Rules with equal priority keep their server order (stable sort).
 * @param {Array<{priority?: number}>} rules
 * @returns {Array}
 */
export const sortRulesByEvaluationOrder = (rules) =>
  (Array.isArray(rules) ? rules : [])
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => {
      const pa = Number.isFinite(Number(a.rule?.priority)) ? Number(a.rule.priority) : 0;
      const pb = Number.isFinite(Number(b.rule?.priority)) ? Number(b.rule.priority) : 0;
      return pb - pa || a.index - b.index;
    })
    .map(({ rule }) => rule);

/**
 * Applies the search text and the status / match-type filters.
 * @param {Array<object>} rules
 * @param {{search?: string, status?: 'all'|'active'|'inactive', matchType?: string}} filters
 * @returns {Array<object>}
 */
export const filterRules = (rules, { search = '', status = 'all', matchType = 'all' } = {}) => {
  const query = String(search ?? '')
    .trim()
    .toLowerCase();
  return (Array.isArray(rules) ? rules : []).filter((rule) => {
    const haystack = [
      rule?.name,
      rule?.description,
      rule?.matchValue,
      rule?.accountName,
      rule?.fallbackAccountName,
    ].map((value) => String(value ?? '').toLowerCase());
    const matchesSearch = !query || haystack.some((value) => value.includes(query));
    const matchesStatus =
      status === 'all' ||
      (status === 'active' && Boolean(rule?.isActive)) ||
      (status === 'inactive' && !rule?.isActive);
    const matchesType = matchType === 'all' || rule?.matchType === matchType;
    return matchesSearch && matchesStatus && matchesType;
  });
};

/**
 * State of an account referenced by name from a rule.
 * @param {string|null|undefined} name
 * @param {Array<{name: string, isActive?: boolean}>} accounts
 * @returns {'none'|'active'|'inactive'|'missing'}
 */
export const getAccountStatus = (name, accounts) => {
  if (!name) return 'none';
  const account = (Array.isArray(accounts) ? accounts : []).find((item) => item?.name === name);
  if (!account) return 'missing';
  return account.isActive ? 'active' : 'inactive';
};

/**
 * Whether a rule targets (or falls back to) an account that is missing or
 * inactive. Only meaningful when the account list loaded successfully.
 * @param {{accountName?: string, fallbackAccountName?: string}} rule
 * @param {Array<object>} accounts
 * @returns {boolean}
 */
export const hasBrokenAccountReference = (rule, accounts) => {
  const target = getAccountStatus(rule?.accountName, accounts);
  const fallback = getAccountStatus(rule?.fallbackAccountName, accounts);
  return (
    target === 'missing' ||
    target === 'inactive' ||
    target === 'none' ||
    fallback === 'missing' ||
    fallback === 'inactive'
  );
};

/**
 * Select options for the target / fallback account. Active accounts are
 * offered; the currently stored value is always included (flagged as inactive
 * or missing) so the select never looks empty while a stale value is kept.
 * @param {Array<{name: string, provider?: string, isActive?: boolean}>} accounts
 * @param {string} currentValue
 * @param {{exclude?: string}} [options]
 * @returns {Array<{value: string, name: string, provider?: string, status: 'active'|'inactive'|'missing'}>}
 */
export const buildAccountOptions = (accounts, currentValue, { exclude } = {}) => {
  const list = Array.isArray(accounts) ? accounts : [];
  const options = list
    .filter((account) => account?.isActive && account.name !== exclude)
    .map((account) => ({
      value: account.name,
      name: account.name,
      provider: account.provider,
      status: 'active',
    }));

  if (currentValue && !options.some((option) => option.value === currentValue)) {
    const stored = list.find((account) => account?.name === currentValue);
    options.unshift({
      value: currentValue,
      name: currentValue,
      provider: stored?.provider,
      status: stored ? (stored.isActive ? 'active' : 'inactive') : 'missing',
    });
  }
  return options;
};

/**
 * Parses the priority field. Returns null for empty or invalid input.
 * @param {unknown} value
 * @returns {number|null}
 */
export const parsePriority = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < PRIORITY_MIN || number > PRIORITY_MAX) return null;
  return number;
};

/**
 * Initial form state for create / edit. Uses `??` so stored values are kept.
 * @param {object|null|undefined} rule
 */
export const getInitialFormData = (rule) => ({
  name: rule?.name ?? '',
  description: rule?.description ?? '',
  isActive: rule?.isActive ?? true,
  priority: rule?.priority ?? DEFAULT_PRIORITY,
  matchType: rule?.matchType ?? 'emailType',
  matchValue: rule?.matchValue ?? '',
  accountName: rule?.accountName ?? '',
  fallbackAccountName: rule?.fallbackAccountName ?? '',
});

/**
 * Validates the rule form against the loaded accounts.
 * @param {ReturnType<typeof getInitialFormData>} formData
 * @param {Array<object>} accounts
 * @returns {{name?: string, matchType?: string, matchValue?: string, accountName?: string, fallbackAccountName?: string, priority?: string}}
 *   error codes per field: 'required' | 'inactive' | 'missing' | 'sameAsTarget' | 'range'
 */
export const validateRuleForm = (formData, accounts) => {
  const errors = {};
  if (!String(formData?.name ?? '').trim()) errors.name = 'required';
  if (!MATCH_TYPES.includes(formData?.matchType)) errors.matchType = 'required';
  if (!String(formData?.matchValue ?? '').trim()) errors.matchValue = 'required';

  const target = getAccountStatus(formData?.accountName, accounts);
  if (target === 'none') errors.accountName = 'required';
  else if (target !== 'active') errors.accountName = target;

  const fallback = getAccountStatus(formData?.fallbackAccountName, accounts);
  if (fallback === 'inactive' || fallback === 'missing') errors.fallbackAccountName = fallback;
  else if (fallback === 'active' && formData.fallbackAccountName === formData.accountName) {
    errors.fallbackAccountName = 'sameAsTarget';
  }

  if (parsePriority(formData?.priority) === null) errors.priority = 'range';
  return errors;
};

/**
 * Request body for create / update (the server schema is strict).
 * @param {ReturnType<typeof getInitialFormData>} formData
 */
export const toRulePayload = (formData) => ({
  name: String(formData.name ?? '').trim(),
  description: formData.description ? String(formData.description) : null,
  isActive: Boolean(formData.isActive),
  priority: parsePriority(formData.priority) ?? DEFAULT_PRIORITY,
  matchType: formData.matchType,
  matchValue: String(formData.matchValue ?? '').trim(),
  accountName: formData.accountName,
  fallbackAccountName: formData.fallbackAccountName || null,
});

/**
 * Shallow equality of two form states (used for the unsaved-changes guard).
 * @param {object} a
 * @param {object} b
 */
export const isSameFormData = (a, b) =>
  Object.keys({ ...a, ...b }).every((key) => String(a?.[key] ?? '') === String(b?.[key] ?? ''));
