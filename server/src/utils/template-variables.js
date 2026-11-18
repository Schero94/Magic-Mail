'use strict';

/**
 * Template tag scanning and variable detection for local Mustache templates and
 * provider templates (SendGrid and Mailgun use Handlebars).
 *
 * The scanner uses `indexOf` only, never a regular expression over the whole
 * source, and caches every closer search so the total work stays linear in the
 * length of the input, also for adversarial input such as `{{#` repeated or
 * unclosed tags.
 *
 * Syntax references:
 * - Mustache 4.2: node_modules/mustache/README.md
 * - Handlebars: https://handlebarsjs.com/guide/expressions.html
 * - Mailgun: https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-templates
 * - SendGrid: https://www.twilio.com/docs/sendgrid/for-developers/sending-email/using-handlebars
 */

/** Largest template source, in characters, that is analysed. */
const MAX_TEMPLATE_SOURCE_LENGTH = 1_000_000;

/** Longest variable path that is reported. Longer paths are skipped. */
const MAX_PATH_LENGTH = 128;

const DEFAULT_MAX_VARIABLES = 200;

/** Handlebars block helpers whose body is evaluated with a new context. */
const SCOPING_HELPERS = new Set(['each', 'with']);

/** Block helpers known from Handlebars, SendGrid and Mailgun. */
const KNOWN_BLOCK_HELPERS = new Set(['if', 'unless', 'each', 'with', 'equal', 'equals']);

const LITERAL_WORDS = new Set(['true', 'false', 'null', 'undefined']);

const SIMPLE_SEGMENT = /^[A-Za-z0-9_$-]+$/;
const NUMBER_LITERAL = /^-?[0-9]+(?:\.[0-9]+)?$/;

/**
 * Returns an `indexOf` wrapper that remembers the last result per pattern.
 * A repeated search from a later position reuses the cached result when it is
 * still valid, so a pattern that does not occur is never searched twice and
 * scanned ranges do not overlap.
 *
 * @param {string} source
 * @returns {(pattern: string, from: number) => number}
 */
const createFinder = (source) => {
  const cache = new Map();
  return (pattern, from) => {
    const hit = cache.get(pattern);
    if (hit && hit.from <= from && (hit.at === -1 || hit.at >= from)) return hit.at;
    const at = source.indexOf(pattern, from);
    cache.set(pattern, { from, at });
    return at;
  };
};

/**
 * Returns the earliest non-negative index of two search results.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number} the smaller index, or -1 when both are -1
 */
const earliest = (a, b) => {
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
};

/**
 * @typedef {object} TemplateToken
 * @property {'text'|'tag'} type
 * @property {number} start index of the first character in the source
 * @property {number} end index after the last character in the source
 * @property {string} raw the token text exactly as in the source
 * @property {string} inner tag content without delimiters, `~` markers and outer whitespace
 * @property {boolean} triple true for `{{{x}}}` tags
 * @property {boolean} comment true for `{{! }}` and `{{!-- --}}` tags
 * @property {number} line 1-based line of the token start
 */

/**
 * Splits a template into text and tag tokens in one linear pass.
 *
 * In Handlebars mode (default) `~` whitespace-control markers are removed from
 * `inner` and `{{!-- --}}` comments end at `--}}`, so they may contain `}}`. In
 * Mustache mode a comment ends at the first `}}` and `~` is kept as written.
 * A tag without a closer ends tokenizing: the rest of the source becomes one
 * text token, exactly like the renderers treat it as an error or as text.
 *
 * @param {string} source template source; the caller enforces the length cap
 * @param {{ mustache?: boolean }} [options] `mustache: true` selects Mustache rules
 * @returns {TemplateToken[]} tokens in source order; concatenating `raw` gives the source
 */
const tokenizeTemplate = (source, { mustache = false } = {}) => {
  const tokens = [];
  const find = createFinder(source);
  const length = source.length;
  let pos = 0;
  let line = 1;
  let nextNewline = source.indexOf('\n');

  // Token starts only grow, so each newline is visited once.
  const lineAt = (index) => {
    while (nextNewline !== -1 && nextNewline < index) {
      line += 1;
      nextNewline = source.indexOf('\n', nextNewline + 1);
    }
    return line;
  };

  const pushText = (start, end) => {
    if (end > start) {
      tokens.push({
        type: 'text',
        start,
        end,
        raw: source.slice(start, end),
        inner: '',
        triple: false,
        comment: false,
        line: lineAt(start),
      });
    }
  };

  while (pos < length) {
    const open = find('{{', pos);
    if (open === -1) break;

    let q = open + 2;
    if (!mustache && source[q] === '~') q += 1;

    let innerStart = q;
    let innerEnd;
    let end = -1;
    let triple = false;
    let comment = false;

    if (source[q] === '{') {
      triple = true;
      innerStart = q + 1;
      const plain = find('}}}', innerStart);
      const trimmed = mustache ? -1 : find('}~}}', innerStart);
      innerEnd = earliest(plain, trimmed);
      if (innerEnd !== -1) end = innerEnd + (innerEnd === plain ? 3 : 4);
    } else if (!mustache && source.startsWith('!--', q)) {
      comment = true;
      innerStart = q + 3;
      const plain = find('--}}', innerStart);
      const trimmed = find('--~}}', innerStart);
      innerEnd = earliest(plain, trimmed);
      if (innerEnd !== -1) end = innerEnd + (innerEnd === plain ? 4 : 5);
    } else {
      comment = source[q] === '!';
      if (comment) innerStart = q + 1;
      innerEnd = find('}}', innerStart);
      if (innerEnd !== -1) end = innerEnd + 2;
    }

    if (innerEnd === -1) break;

    pushText(pos, open);
    let inner = source.slice(innerStart, innerEnd);
    if (!mustache && !comment && inner.endsWith('~')) inner = inner.slice(0, -1);
    tokens.push({
      type: 'tag',
      start: open,
      end,
      raw: source.slice(open, end),
      inner: inner.trim(),
      triple,
      comment,
      line: lineAt(open),
    });
    pos = end;
  }

  pushText(pos, length);
  return tokens;
};

/**
 * @typedef {object} ExpressionPart
 * @property {'word'|'string'|'open'|'close'} kind
 * @property {string} text
 */

/**
 * Splits the content of a Handlebars tag into words, string literals and
 * subexpression parentheses. For hash arguments (`key=value`) only the value
 * is kept. Works on the tag content only, so its cost is bounded by the tag.
 *
 * @param {string} inner tag content as produced by {@link tokenizeTemplate}
 * @returns {ExpressionPart[]} parts in order
 */
const splitExpression = (inner) => {
  const parts = [];
  const n = inner.length;
  let i = 0;
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

  while (i < n) {
    const c = inner[i];
    if (isSpace(c)) {
      i += 1;
      continue;
    }
    if (c === '(' || c === ')') {
      parts.push({ kind: c === '(' ? 'open' : 'close', text: c });
      i += 1;
      continue;
    }
    let start = i;
    let quoted = false;
    while (i < n && !isSpace(inner[i]) && inner[i] !== '(' && inner[i] !== ')') {
      const ch = inner[i];
      if (ch === '"' || ch === "'") {
        if (i === start) quoted = true;
        const close = inner.indexOf(ch, i + 1);
        i = close === -1 ? n : close + 1;
        continue;
      }
      if (ch === '[') {
        const close = inner.indexOf(']', i + 1);
        i = close === -1 ? n : close + 1;
        continue;
      }
      if (ch === '=') {
        start = i + 1;
        quoted = false;
      }
      i += 1;
    }
    if (i > start) parts.push({ kind: quoted ? 'string' : 'word', text: inner.slice(start, i) });
  }
  return parts;
};

/**
 * Splits a path into segments on `.` and `/` outside `[...]` literal segments.
 *
 * @param {string} path
 * @returns {string[]|null} the segments, or null for an empty or malformed segment
 */
const splitSegments = (path) => {
  const segments = [];
  let i = 0;
  while (i <= path.length) {
    if (path[i] === '[') {
      const close = path.indexOf(']', i + 1);
      if (close === -1) return null;
      segments.push(path.slice(i, close + 1));
      i = close + 1;
      if (i < path.length && path[i] !== '.' && path[i] !== '/') return null;
      i += 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '/') j += 1;
    const segment = path.slice(i, j);
    if (!SIMPLE_SEGMENT.test(segment)) return null;
    segments.push(segment);
    i = j + 1;
  }
  return segments;
};

/**
 * @typedef {object} ParsedPath
 * @property {string} path dotted path
 * @property {string} root first segment
 * @property {boolean} unscoped true when the path explicitly leaves the current scope
 */

/**
 * Classifies one expression word as a data path.
 *
 * @param {string} word
 * @returns {ParsedPath|null} the path, or null for literals, `this`, `.`, data variables
 *   such as `@index`, malformed paths and paths longer than 128 characters
 */
const parsePath = (word) => {
  if (!word || word.length > MAX_PATH_LENGTH * 4) return null;
  if (LITERAL_WORDS.has(word) || NUMBER_LITERAL.test(word)) return null;
  let rest = word;
  let unscoped = false;
  if (rest.startsWith('@root.') || rest.startsWith('@root/')) {
    rest = rest.slice(6);
    unscoped = true;
  } else if (rest[0] === '@') {
    return null;
  }
  while (rest.startsWith('../')) {
    rest = rest.slice(3);
    unscoped = true;
  }
  if (rest === 'this' || rest === '.' || rest === '') return null;
  if (rest.startsWith('this.') || rest.startsWith('this/')) rest = rest.slice(5);
  else if (rest.startsWith('./')) rest = rest.slice(2);
  if (rest === '' || rest.length > MAX_PATH_LENGTH) return null;
  const segments = splitSegments(rest);
  if (!segments || segments.some((s) => s === 'this' || s === '..')) return null;
  const path = segments.join('.');
  if (path.length > MAX_PATH_LENGTH) return null;
  return { path, root: segments[0], unscoped };
};

/**
 * Returns the argument words of a helper call, skipping the helper name,
 * subexpression helper names, string literals and block parameters (`as |x|`).
 *
 * @param {ExpressionPart[]} parts all parts of the tag, the helper name first
 * @returns {string[]} argument words
 */
const helperArguments = (parts) => {
  const args = [];
  let expectHelper = false;
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.kind === 'open') {
      expectHelper = true;
      continue;
    }
    if (part.kind !== 'word') continue;
    if (expectHelper) {
      expectHelper = false;
      continue;
    }
    if (part.text === 'as' && parts[i + 1] && parts[i + 1].text.startsWith('|')) break;
    args.push(part.text);
  }
  return args;
};

/**
 * Stack of open blocks that knows how many frames per name are open, so a
 * closer without a matching opener is rejected without scanning the stack.
 * Every scan below ends at a matching frame and pops all frames it passes,
 * which keeps the total work linear.
 */
class BlockStack {
  constructor() {
    /** @type {{ key: string }[]} */
    this.items = [];
    /** @type {Map<string, number>} */
    this.open = new Map();
  }

  /**
   * @param {{ key: string }} frame frame whose `key` is matched against closers
   * @returns {void}
   */
  push(frame) {
    this.items.push(frame);
    this.open.set(frame.key, (this.open.get(frame.key) || 0) + 1);
  }

  /**
   * @returns {{ key: string }|undefined} the removed top frame
   */
  pop() {
    const frame = this.items.pop();
    if (frame) this.open.set(frame.key, this.open.get(frame.key) - 1);
    return frame;
  }

  /**
   * @returns {{ key: string }|undefined} the top frame without removing it
   */
  top() {
    return this.items[this.items.length - 1];
  }

  /**
   * @param {string} key
   * @returns {boolean} true when a frame with this key is open
   */
  has(key) {
    return (this.open.get(key) || 0) > 0;
  }

  /**
   * Pops frames down to and including the topmost frame with `key`.
   *
   * @param {string} key
   * @param {(frame: { key: string }) => void} [onDiscard] called for each frame above the match
   * @returns {{ key: string }|null} the matching frame, or null when none is open
   */
  closeTo(key, onDiscard) {
    if (!this.has(key)) return null;
    let frame = this.pop();
    while (frame.key !== key) {
      if (onDiscard) onDiscard(frame);
      frame = this.pop();
    }
    return frame;
  }
}

/**
 * @typedef {object} TemplateVariable
 * @property {string} path dotted path as written, e.g. `user.email`
 * @property {string} root first path segment, e.g. `user`
 * @property {boolean} raw true when any use is unescaped (`{{{x}}}` or `{{& x}}`)
 * @property {boolean} scoped true only when every use is inside an `each`/`with` body,
 *   where the path is relative to the current item
 * @property {string[]} blocks block helpers or section kinds that use the path as argument
 */

/**
 * Lists the data variables a Handlebars (SendGrid, Mailgun) or Mustache
 * template reads, so the editor can show which keys the template data needs.
 *
 * Helper names, literals, `this`, `.`, `@index`/`@first`/`@last`/`@key` and
 * comments are not variables. `@root.x` and `../x` report `x` as unscoped.
 * Mustache sections (`{{#x}}`, `{{^x}}`) report `x` with the block `section`
 * or `inverted` and do not scope their body. Analysis stops at a Mustache
 * set-delimiter tag (`{{=<% %>=}}`) because later tags use other delimiters.
 *
 * @param {unknown} source template source; any non-string is analysed as ''
 * @param {{ maxVariables?: number }} [options] `maxVariables`: positive integer cap on
 *   the returned list (default 200); other values fall back to the default
 * @returns {{ variables: TemplateVariable[], truncated: boolean }} variables sorted by path
 *   and deduplicated; `truncated` is true when more than `maxVariables` were found
 * @throws {RangeError} when the source is longer than MAX_TEMPLATE_SOURCE_LENGTH characters
 */
const detectTemplateVariables = (source, { maxVariables = DEFAULT_MAX_VARIABLES } = {}) => {
  const text = typeof source === 'string' ? source : '';
  if (text.length > MAX_TEMPLATE_SOURCE_LENGTH) {
    throw new RangeError('Template is too large to analyse');
  }
  const limit =
    Number.isInteger(maxVariables) && maxVariables > 0 ? maxVariables : DEFAULT_MAX_VARIABLES;

  /** @type {Map<string, TemplateVariable>} */
  const found = new Map();
  /** @type {Map<string, Set<string>>} */
  const blocksByPath = new Map();
  const stack = new BlockStack();
  let scopeDepth = 0;

  const record = (word, { raw = false, block = null } = {}) => {
    const parsed = parsePath(word);
    if (!parsed) return;
    const scoped = scopeDepth > 0 && !parsed.unscoped;
    const existing = found.get(parsed.path);
    if (!existing) {
      found.set(parsed.path, {
        path: parsed.path,
        root: parsed.root,
        raw,
        scoped,
        blocks: [],
      });
      blocksByPath.set(parsed.path, new Set(block ? [block] : []));
      return;
    }
    existing.raw = existing.raw || raw;
    existing.scoped = existing.scoped && scoped;
    if (block) blocksByPath.get(parsed.path).add(block);
  };

  const push = (name, scoping) => {
    stack.push({ key: name, scoping });
    if (scoping) scopeDepth += 1;
  };

  const leaveScope = (frame) => {
    if (frame.scoping) scopeDepth -= 1;
  };

  const close = (name) => {
    const frame = stack.closeTo(name, leaveScope);
    if (frame) leaveScope(frame);
  };

  for (const token of tokenizeTemplate(text)) {
    if (token.type !== 'tag' || token.comment) continue;
    const inner = token.inner;
    if (!inner) continue;
    const sigil = inner[0];

    if (sigil === '=' && !token.triple) break;
    if (sigil === '>' || sigil === '!') continue;

    if (sigil === '/' && !token.triple) {
      close(inner.slice(1).trim());
      continue;
    }

    if ((sigil === '#' || sigil === '^') && !token.triple) {
      const parts = splitExpression(inner.slice(1));
      if (parts.length === 0) {
        // `{{^}}` is the Handlebars shorthand for `{{else}}`.
        const top = stack.top();
        if (top && top.scoping) {
          top.scoping = false;
          scopeDepth -= 1;
        }
        continue;
      }
      const name = parts[0].text;
      if (parts.length === 1 && !KNOWN_BLOCK_HELPERS.has(name)) {
        record(name, { block: sigil === '#' ? 'section' : 'inverted' });
        push(name, false);
        continue;
      }
      for (const arg of helperArguments(parts)) record(arg, { block: name });
      push(name, SCOPING_HELPERS.has(name));
      continue;
    }

    if (sigil === '&' && !token.triple) {
      const parts = splitExpression(inner.slice(1));
      if (parts.length === 1 && parts[0].kind === 'word') record(parts[0].text, { raw: true });
      else for (const arg of helperArguments(parts)) record(arg);
      continue;
    }

    const parts = splitExpression(inner);
    if (parts.length === 0) continue;

    if (parts[0].text === 'else' && parts[0].kind === 'word') {
      const top = stack.top();
      if (top && top.scoping) {
        // The inverse block of each/with renders with the outer context.
        top.scoping = false;
        scopeDepth -= 1;
      }
      if (parts.length > 1) {
        const chained = parts[1].text;
        for (const arg of helperArguments(parts.slice(1))) record(arg, { block: chained });
      }
      continue;
    }

    if (parts.length === 1) {
      if (parts[0].kind === 'word') record(parts[0].text, { raw: token.triple });
      continue;
    }
    for (const arg of helperArguments(parts)) record(arg);
  }

  for (const variable of found.values()) variable.blocks = [...blocksByPath.get(variable.path)];
  const variables = [...found.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  const truncated = variables.length > limit;
  return { variables: truncated ? variables.slice(0, limit) : variables, truncated };
};

module.exports = {
  MAX_TEMPLATE_SOURCE_LENGTH,
  detectTemplateVariables,
  tokenizeTemplate,
  splitExpression,
  parsePath,
  BlockStack,
};
