/**
 * Pure helpers for the Email Accounts view (filters, rule references,
 * test-send validation). Free of React so they can be tested under node:test.
 */
import { isValidEmailAddress } from '../../utils/emailValidation.mjs';

const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

/** @param {{documentId?: string, id?: string|number}} account */
export const getAccountKey = (account) => account?.documentId ?? account?.id;

/**
 * @param {Array<Record<string, any>>} accounts
 * @param {{query?: string, status?: string, provider?: string}} filters
 */
export const filterAccounts = (accounts, { query = '', status = 'all', provider = 'all' } = {}) => {
  const needle = lower(query.trim());
  return (Array.isArray(accounts) ? accounts : []).filter((account) => {
    const matchesSearch =
      !needle ||
      lower(account.name).includes(needle) ||
      lower(account.fromEmail).includes(needle) ||
      lower(account.provider).includes(needle);
    const matchesStatus =
      status === 'all' ||
      (status === 'active' && account.isActive === true) ||
      (status === 'inactive' && account.isActive !== true) ||
      (status === 'primary' && account.isPrimary === true);
    const matchesProvider = provider === 'all' || account.provider === provider;
    return matchesSearch && matchesStatus && matchesProvider;
  });
};

/** @param {Array<Record<string, any>>} accounts @returns {string[]} sorted provider values */
export const uniqueProviders = (accounts) =>
  [...new Set((Array.isArray(accounts) ? accounts : []).map((a) => a.provider).filter(Boolean))].sort();

/**
 * Routing rules that reference an account by name (primary or fallback).
 * Names are compared case-insensitively, like the router does for rules.
 *
 * @param {Array<Record<string, any>>|null} rules
 * @param {string} accountName
 * @returns {number|null} null when the rules are unknown
 */
export const countRulesForAccount = (rules, accountName) => {
  if (!Array.isArray(rules)) return null;
  const name = lower(accountName).trim();
  if (!name) return 0;
  return rules.filter(
    (rule) => lower(rule.accountName).trim() === name || lower(rule.fallbackAccountName).trim() === name
  ).length;
};

/** @returns {number} usage of the daily limit in percent (0 when unlimited) */
export const getUsagePercent = (account) => {
  const limit = Number(account?.dailyLimit) || 0;
  if (limit <= 0) return 0;
  return Math.round(((Number(account?.emailsSentToday) || 0) / limit) * 100);
};

/** Splits a comma/semicolon separated recipient list. */
export const splitRecipients = (value) =>
  (typeof value === 'string' ? value : '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);

export const MAX_TEST_CC = 50;

/**
 * Validates the test-send dialog.
 *
 * @param {{to: string, cc: string, mode: 'direct'|'strapi', emailType: string, unsubscribeUrl: string}} values
 * @returns {{to?: 'required'|'invalid', cc?: 'invalid'|'tooMany', unsubscribeUrl?: 'required'|'invalid'}}
 */
export const validateTestForm = ({ to = '', cc = '', mode = 'direct', emailType = 'transactional', unsubscribeUrl = '' }) => {
  const errors = {};
  const recipient = to.trim();
  if (!recipient) errors.to = 'required';
  else if (!isValidEmailAddress(recipient)) errors.to = 'invalid';

  const ccList = splitRecipients(cc);
  if (ccList.length > MAX_TEST_CC) errors.cc = 'tooMany';
  else if (ccList.some((address) => !isValidEmailAddress(address))) errors.cc = 'invalid';

  if (mode === 'direct' && emailType === 'marketing') {
    const url = unsubscribeUrl.trim();
    if (!url) errors.unsubscribeUrl = 'required';
    else if (!/^https?:\/\/[^\s]+$/i.test(url)) errors.unsubscribeUrl = 'invalid';
  }
  return errors;
};

/** CC value sent to the server (normalised, or undefined when empty). */
export const normaliseCc = (cc) => {
  const list = splitRecipients(cc);
  return list.length ? list.join(', ') : undefined;
};
