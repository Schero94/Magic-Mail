'use strict';

/**
 * Source guards shared by the admin UI tests.
 * Each function returns the offending snippets (empty array = clean).
 */

/** CSS custom properties that Strapi DS 2 never defines. */
function findCssVarTokens(source) {
  return source.match(/var\(--colors-[^)]*\)/g) ?? [];
}

/**
 * rem font sizes that render below 12px. DS sets html { font-size: 62.5% },
 * so 1rem = 10px and anything under 1.2rem is too small for body text.
 * Matches CSS (`font-size: 0.875rem`) and inline styles (`fontSize: '1rem'`).
 */
function findTinyRemFontSizes(source) {
  const hits = [];
  const pattern = /font-?size\s*:\s*['"`]?\s*([0-9]*\.?[0-9]+)rem/gi;
  for (const match of source.matchAll(pattern)) {
    if (Number(match[1]) < 1.2) hits.push(match[0]);
  }
  return hits;
}

/** Pictographic emoji (text symbols such as arrows or the en dash are allowed). */
function findEmoji(source) {
  return (
    source.match(/[\p{Extended_Pictographic}\u{FE0F}]/gu)?.filter((ch) => !/[©®™]/.test(ch)) ?? []
  );
}

module.exports = { findCssVarTokens, findTinyRemFontSizes, findEmoji };
