'use strict';

/**
 * Locale helpers for per-locale provider templates.
 *
 * A locale is a BCP 47 language tag such as `de`, `de-AT` or `pt-BR`,
 * canonicalised with `Intl.getCanonicalLocales` (so `DE-at` and `de-AT`
 * are the same key). Selection falls back from the exact tag to its
 * language and then to the template itself:
 *
 *   de-AT -> de-AT, de -> (default template)
 */

const MAX_LOCALE_LENGTH = 35;
/** Shape check before Intl (bounded, no nested quantifiers). */
const LOCALE_SHAPE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,3}$/;

/**
 * Canonical form of a language tag, or null when it is not one.
 *
 * @param {unknown} value
 * @returns {string|null} e.g. 'de-AT'
 */
function canonicalLocale(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/_/g, '-');
  if (!trimmed || trimmed.length > MAX_LOCALE_LENGTH || !LOCALE_SHAPE.test(trimmed)) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed);
    return typeof canonical === 'string' ? canonical : null;
  } catch {
    return null;
  }
}

/**
 * Lookup order for a locale: the exact tag, then its language subtag.
 *
 * @param {unknown} value
 * @returns {string[]} e.g. ['de-AT', 'de']; [] for no or an invalid locale
 */
function localeCandidates(value) {
  const canonical = canonicalLocale(value);
  if (!canonical) return [];
  const language = canonical.split('-')[0];
  return language === canonical ? [canonical] : [canonical, language];
}

module.exports = { MAX_LOCALE_LENGTH, canonicalLocale, localeCandidates };
