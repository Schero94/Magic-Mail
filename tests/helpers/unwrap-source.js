'use strict';

/**
 * Joins the line breaks Prettier inserts into long calls, objects and JSX so a
 * source contract can be written as one logical line, independent of where the
 * formatter wraps it.
 *
 * - `(` or `[` followed by a line break: the break is removed.
 * - A line break (and an optional trailing comma) before `)` or `]`: removed.
 * - `{` / `}` around a wrapped object or JSX expression: kept as one space.
 * - A line break after a JSX tag (`>`, not `=>`) or before a closing tag (`</`): removed.
 * - Any other line break with its indentation: one space.
 *
 * @param {string} source Source text as read from disk.
 * @returns {string} The same tokens with Prettier's line wrapping undone.
 */
const unwrapSource = (source) =>
  source
    .replace(/([([])\s*\n\s*/g, '$1')
    .replace(/,?\s*\n\s*([)\]])/g, '$1')
    .replace(/\{\s*\n\s*/g, '{ ')
    .replace(/,?\s*\n\s*\}/g, ' }')
    .replace(/([^=])>\s*\n\s*/g, '$1>')
    .replace(/\s*\n\s*<\//g, '</')
    .replace(/\s*\n\s*/g, ' ');

module.exports = { unwrapSource };
