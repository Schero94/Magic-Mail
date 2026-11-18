'use strict';

/**
 * Best-effort conversion between Mustache 4.2 (local Magic Mail templates) and
 * Handlebars (SendGrid and Mailgun provider templates).
 *
 * Both directions only rewrite tags they understand exactly. Everything else
 * stays as written and is reported in `warnings`, so the admin can review it
 * before the template is used. The scan is linear (see tokenizeTemplate).
 *
 * Syntax references:
 * - Mustache 4.2: node_modules/mustache/README.md
 * - Handlebars: https://handlebarsjs.com/guide/expressions.html and
 *   https://handlebarsjs.com/guide/builtin-helpers.html
 */

const {
  tokenizeTemplate,
  splitExpression,
  parsePath,
  BlockStack,
} = require('./template-variables');

/** Largest source, in characters, that is converted. */
const MAX_CONVERT_SOURCE_LENGTH = 1_000_000;

const MAX_TAG_TEXT = 80;

/**
 * @typedef {object} ConversionWarning
 * @property {string} code machine-readable reason, e.g. `SECTION_AMBIGUOUS`
 * @property {number} line 1-based line of the tag in the input
 * @property {string} tag original tag text, at most 80 characters
 */

/**
 * @typedef {object} ConversionResult
 * @property {string} output converted template
 * @property {ConversionWarning[]} warnings tags that need a manual check, sorted by line
 * @property {boolean} changed true when `output` differs from the input
 */

/**
 * Validates the input and returns it as a string.
 *
 * @param {unknown} source
 * @returns {string}
 */
const checkSource = (source) => {
  const text = typeof source === 'string' ? source : '';
  if (text.length > MAX_CONVERT_SOURCE_LENGTH) {
    throw new RangeError('Template is too large to convert');
  }
  return text;
};

/**
 * Creates a warning collector bound to a result list.
 *
 * @param {ConversionWarning[]} warnings
 * @returns {(code: string, token: { line: number, raw: string }) => void}
 */
const warner = (warnings) => (code, token) => {
  warnings.push({ code, line: token.line, tag: token.raw.slice(0, MAX_TAG_TEXT) });
};

/**
 * Builds the result object with warnings in line order.
 *
 * @param {string} source
 * @param {string[]} parts
 * @param {ConversionWarning[]} warnings
 * @returns {ConversionResult}
 */
const finish = (source, parts, warnings) => {
  const output = parts.join('');
  const sorted = warnings
    .map((warning, index) => ({ warning, index }))
    .sort((a, b) => a.warning.line - b.warning.line || a.index - b.index)
    .map((entry) => entry.warning);
  return { output, warnings: sorted, changed: output !== source };
};

/**
 * Returns the single path of a tag body when it is a plain variable path.
 *
 * @param {string} body
 * @returns {string|null}
 */
const singlePath = (body) => {
  const parts = splitExpression(body);
  if (parts.length !== 1 || parts[0].kind !== 'word') return null;
  return parts[0].text;
};

/**
 * Tests whether a name is a simple dotted variable path (no data variables,
 * parent or root references and no literal segments).
 *
 * @param {string} name
 * @returns {boolean}
 */
const isSimplePath = (name) => {
  const parsed = parsePath(name);
  return Boolean(parsed) && !parsed.unscoped && parsed.path === name && !name.includes('[');
};

/**
 * Converts a local Mustache template to Handlebars for SendGrid or Mailgun.
 *
 * - `{{#x}}..{{/x}}` becomes `{{#if x}}..{{/if}}` followed by a Handlebars
 *   comment, with warning `SECTION_AMBIGUOUS` (a section is either a condition
 *   or a loop; use `{{#each x}}` when `x` is a list).
 * - `{{^x}}..{{/x}}` becomes `{{#unless x}}..{{/unless}}`.
 * - `{{& x}}` becomes `{{{x}}}`, `{{.}}` becomes `{{this}}`.
 * - `{{x}}`, `{{{x}}}` and comments stay unchanged.
 * - Partials stay unchanged (`PARTIAL_UNSUPPORTED`). A set-delimiter tag stops
 *   the conversion and the rest is kept as written (`DELIMITER_UNSUPPORTED`).
 * - Unpaired or crossed sections stay unchanged (`UNBALANCED_SECTION`); section
 *   names that are not simple paths stay unchanged (`UNSUPPORTED_TAG`).
 *
 * @param {unknown} source Mustache source; any non-string is converted as ''
 * @returns {ConversionResult} the converted template and the tags that need review
 * @throws {RangeError} when the source is longer than MAX_CONVERT_SOURCE_LENGTH characters
 */
const mustacheToHandlebars = (source) => {
  const text = checkSource(source);
  const parts = [];
  const warnings = [];
  const warn = warner(warnings);
  const stack = new BlockStack();

  const tokens = tokenizeTemplate(text, { mustache: true });
  for (let t = 0; t < tokens.length; t += 1) {
    const token = tokens[t];
    if (token.type !== 'tag' || token.comment) {
      parts.push(token.raw);
      continue;
    }
    const inner = token.inner;
    const sigil = inner[0];

    if (token.triple) {
      parts.push(inner === '.' ? '{{{this}}}' : token.raw);
      continue;
    }

    if (sigil === '=') {
      warn('DELIMITER_UNSUPPORTED', token);
      parts.push(text.slice(token.start));
      break;
    }

    if (sigil === '>') {
      warn('PARTIAL_UNSUPPORTED', token);
      parts.push(token.raw);
      continue;
    }

    if (sigil === '&') {
      const name = inner.slice(1).trim();
      parts.push(name === '.' ? '{{{this}}}' : `{{{${name}}}}`);
      continue;
    }

    if (sigil === '#' || sigil === '^') {
      const name = inner.slice(1).trim();
      const ok = isSimplePath(name);
      if (!ok) warn('UNSUPPORTED_TAG', token);
      stack.push({ key: name, kind: sigil, index: parts.length, token, ok });
      parts.push(token.raw);
      continue;
    }

    if (sigil === '/') {
      const name = inner.slice(1).trim();
      const frame = stack.closeTo(name, (open) => warn('UNBALANCED_SECTION', open.token));
      if (!frame) {
        warn('UNBALANCED_SECTION', token);
        parts.push(token.raw);
        continue;
      }
      if (!frame.ok) {
        parts.push(token.raw);
        continue;
      }
      if (frame.kind === '#') {
        parts[frame.index] =
          `{{#if ${name}}}{{!-- magic-mail: check this block: use #each if "${name}" is a list --}}`;
        warn('SECTION_AMBIGUOUS', frame.token);
        parts.push('{{/if}}');
      } else {
        parts[frame.index] = `{{#unless ${name}}}`;
        parts.push('{{/unless}}');
      }
      continue;
    }

    parts.push(inner === '.' ? '{{this}}' : token.raw);
  }

  // Sections still open stay as written. After a set-delimiter tag the rest
  // was copied verbatim and its closers are not visible here.
  const stopped = warnings.some((w) => w.code === 'DELIMITER_UNSUPPORTED');
  if (!stopped) for (const frame of stack.items) warn('UNBALANCED_SECTION', frame.token);

  return finish(text, parts, warnings);
};

/**
 * Converts a Mustache-compatible path of a Handlebars expression.
 *
 * @param {string} word
 * @returns {{ path: string|null, code: string|null }} the Mustache path, or a warning code
 */
const toMustachePath = (word) => {
  if (word === 'this' || word === '.') return { path: '.', code: null };
  if (word[0] === '@' || word.startsWith('../')) {
    return { path: null, code: 'DATA_VARIABLE_UNSUPPORTED' };
  }
  let rest = word;
  if (rest.startsWith('this.')) rest = rest.slice(5);
  else if (rest.startsWith('./')) rest = rest.slice(2);
  if (!isSimplePath(rest)) return { path: null, code: 'PATH_UNSUPPORTED' };
  return { path: rest, code: null };
};

/**
 * Converts a SendGrid or Mailgun Handlebars template to Mustache.
 *
 * - `{{#if x}}`/`{{else}}`/`{{/if}}` become `{{#x}}`/`{{/x}}{{^x}}`/`{{/x}}`.
 * - `{{#unless x}}`/`{{else}}`/`{{/unless}}` become `{{^x}}`/`{{/x}}{{#x}}`/`{{/x}}`.
 * - `{{#each x}}` and `{{#with x}}` become `{{#x}}`; their closers `{{/x}}`.
 *   `{{this}}` becomes `{{.}}`, `{{this.foo}}` becomes `{{foo}}`, `{{{this}}}`
 *   becomes `{{{.}}}`.
 * - `{{!-- c --}}` becomes `{{! c }}` with every `}` removed from the comment.
 * - `~` whitespace-control markers are removed from converted tags.
 *
 * Left unchanged with a warning: `{{else if}}` (`ELSE_IF_UNSUPPORTED`, the
 * whole if block stays as written), other block helpers and inline helper
 * calls (`HELPER_UNSUPPORTED`), `@index`/`@root`/`../` (`DATA_VARIABLE_UNSUPPORTED`),
 * `{{else}}` in each (`EACH_ELSE_UNSUPPORTED`), unpaired blocks
 * (`UNBALANCED_BLOCK`), partials (`PARTIAL_UNSUPPORTED`) and literal path
 * segments such as `[a b]` (`PATH_UNSUPPORTED`).
 *
 * @param {unknown} source Handlebars source; any non-string is converted as ''
 * @returns {ConversionResult} the converted template and the tags that need review
 * @throws {RangeError} when the source is longer than MAX_CONVERT_SOURCE_LENGTH characters
 */
const handlebarsToMustache = (source) => {
  const text = checkSource(source);
  const parts = [];
  const warnings = [];
  const warn = warner(warnings);
  const stack = new BlockStack();

  const revert = (frame) => {
    for (const entry of frame.rewritten) parts[entry.index] = entry.raw;
    frame.rewritten = [];
    frame.ok = false;
  };

  const emit = (frame, token, converted) => {
    if (frame && frame.ok) frame.rewritten.push({ index: parts.length, raw: token.raw });
    parts.push(converted);
  };

  for (const token of tokenizeTemplate(text)) {
    if (token.type !== 'tag') {
      parts.push(token.raw);
      continue;
    }
    const top = stack.top();

    if (token.comment) {
      if (token.raw.startsWith('{{!') && !token.raw.startsWith('{{!--')) {
        parts.push(token.raw);
      } else {
        const body = token.inner.split('}').join('');
        parts.push(body ? `{{! ${body} }}` : '{{!}}');
      }
      continue;
    }

    const inner = token.inner;
    const sigil = inner[0];

    if (token.triple || sigil === '&') {
      const body = token.triple ? inner : inner.slice(1);
      const word = singlePath(body);
      if (!word) {
        warn('HELPER_UNSUPPORTED', token);
        parts.push(token.raw);
        continue;
      }
      const { path, code } = toMustachePath(word);
      if (code) {
        warn(code, token);
        parts.push(token.raw);
        continue;
      }
      parts.push(token.triple ? `{{{${path}}}}` : `{{&${path}}}`);
      continue;
    }

    if (sigil === '>') {
      warn('PARTIAL_UNSUPPORTED', token);
      parts.push(token.raw);
      continue;
    }

    if (sigil === '#' || (sigil === '^' && inner.length > 1)) {
      const expr = splitExpression(inner.slice(1));
      const helper = expr.length > 0 ? expr[0].text : '';
      const frame = { key: helper, name: null, ok: false, sawElse: false, token, rewritten: [] };
      stack.push(frame);

      const builtin = ['if', 'unless', 'each', 'with'].includes(helper) && sigil === '#';
      if (!builtin && expr.length === 1 && expr[0].kind === 'word') {
        // A Mustache-compatible section `{{#x}}` / `{{^x}}`.
        const { path, code } = toMustachePath(helper);
        if (code) {
          warn(code, token);
          parts.push(token.raw);
          continue;
        }
        frame.ok = true;
        frame.name = path;
        emit(frame, token, `{{${sigil}${path}}}`);
        continue;
      }
      if (!builtin) {
        warn('HELPER_UNSUPPORTED', token);
        parts.push(token.raw);
        continue;
      }
      if (expr.length !== 2 || expr[1].kind !== 'word') {
        warn('HELPER_UNSUPPORTED', token);
        parts.push(token.raw);
        continue;
      }
      const { path, code } = toMustachePath(expr[1].text);
      if (code) {
        warn(code, token);
        parts.push(token.raw);
        continue;
      }
      frame.ok = true;
      frame.name = path;
      emit(frame, token, helper === 'unless' ? `{{^${path}}}` : `{{#${path}}}`);
      continue;
    }

    if (sigil === '/') {
      const helper = inner.slice(1).trim();
      const frame = stack.closeTo(helper, (open) => {
        revert(open);
        warn('UNBALANCED_BLOCK', open.token);
      });
      if (!frame) {
        warn('UNBALANCED_BLOCK', token);
        parts.push(token.raw);
        continue;
      }
      parts.push(frame.ok ? `{{/${frame.name}}}` : token.raw);
      continue;
    }

    const expr = splitExpression(sigil === '^' ? 'else' : inner);
    if (expr.length > 0 && expr[0].kind === 'word' && expr[0].text === 'else') {
      if (!top) {
        warn('UNBALANCED_BLOCK', token);
        parts.push(token.raw);
        continue;
      }
      if (expr.length > 1) {
        warn('ELSE_IF_UNSUPPORTED', token);
        revert(top);
        parts.push(token.raw);
        continue;
      }
      if (!top.ok) {
        parts.push(token.raw);
        continue;
      }
      if (top.key === 'each') {
        warn('EACH_ELSE_UNSUPPORTED', token);
        parts.push(token.raw);
        continue;
      }
      if (top.sawElse) {
        warn('UNBALANCED_BLOCK', token);
        revert(top);
        parts.push(token.raw);
        continue;
      }
      top.sawElse = true;
      const inverse = top.key === 'unless' || top.token.inner[0] === '^';
      emit(
        top,
        token,
        inverse ? `{{/${top.name}}}{{#${top.name}}}` : `{{/${top.name}}}{{^${top.name}}}`
      );
      continue;
    }

    if (expr.length === 1 && expr[0].kind === 'word') {
      const { path, code } = toMustachePath(expr[0].text);
      if (code) {
        warn(code, token);
        parts.push(token.raw);
        continue;
      }
      parts.push(`{{${path}}}`);
      continue;
    }

    if (inner === '') {
      parts.push(token.raw);
      continue;
    }
    warn('HELPER_UNSUPPORTED', token);
    parts.push(token.raw);
  }

  for (const frame of stack.items) {
    revert(frame);
    warn('UNBALANCED_BLOCK', frame.token);
  }

  return finish(text, parts, warnings);
};

module.exports = {
  MAX_CONVERT_SOURCE_LENGTH,
  mustacheToHandlebars,
  handlebarsToMustache,
};
