'use strict';

/**
 * Converts caller-supplied template data into plain JSON before it is sent to
 * a provider template (SendGrid `dynamic_template_data`, Mailgun
 * `t:variables`). The rules follow JSON.stringify where that is safe and
 * reject values whose JSON form would be surprising or unbounded.
 *
 * Error messages name the dotted path of the offending value but never the
 * value itself, so template data cannot leak into logs.
 */

const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_KEYS = 5000;
const DEPTH_HARD_LIMIT = 1000;

/** Keys that are dropped so the result can never change an object prototype. */
const DROPPED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Error thrown by {@link toPlainJson}; `code` names the reason, `path` the location. */
class PlainJsonError extends Error {
  /**
   * @param {'NOT_AN_OBJECT'|'UNSUPPORTED_VALUE'|'CIRCULAR'|'TOO_DEEP'|'TOO_MANY_KEYS'|'TOO_LARGE'} code
   * @param {string} message
   * @param {string} [path] dotted path of the offending value
   */
  constructor(code, message, path = 'templateData') {
    super(message);
    this.name = 'PlainJsonError';
    this.code = code;
    this.path = path;
  }
}

/**
 * Appends an object key to a display path.
 *
 * @param {string} path
 * @param {string} key
 * @returns {string}
 */
const childPath = (path, key) =>
  IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

/**
 * Tests for an object whose prototype is Object.prototype or null.
 *
 * @param {object} value
 * @returns {boolean}
 */
const isPlainObject = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Validates an optional positive integer option.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} [max]
 * @returns {number}
 */
const positiveInteger = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('Limit options must be positive integers');
  }
  return Math.min(value, max);
};

/**
 * Converts template data into a plain JSON object for provider templates.
 *
 * - Functions, symbols and `undefined` are dropped from objects and become
 *   `null` in arrays, like JSON.stringify.
 * - Dates become ISO strings; an invalid Date becomes `null`.
 * - NaN and Infinity become `null`.
 * - The keys `__proto__`, `constructor` and `prototype` are dropped.
 * - Only plain objects and arrays are walked. Getters are not called and
 *   `toJSON` methods of non-Date objects are never called.
 * - The input is never mutated.
 *
 * @param {unknown} value template data; must be a plain object, or null/undefined for `{}`
 * @param {{ maxBytes?: number, maxDepth?: number, maxKeys?: number }} [options]
 *   `maxBytes`: positive integer cap on the UTF-8 size of the JSON result (no cap when omitted);
 *   `maxDepth`: positive integer nesting limit, default 32, at most 1000;
 *   `maxKeys`: positive integer cap on object keys plus array items, default 5000
 * @returns {{ data: Record<string, unknown>, bytes: number }} the plain copy and the UTF-8
 *   byte length of its JSON form
 * @throws {PlainJsonError} `NOT_AN_OBJECT` when the top level is not a plain object;
 *   `UNSUPPORTED_VALUE` for BigInt, Map, Set, Buffer, typed arrays, RegExp, class instances
 *   and accessor properties; `CIRCULAR` for a reference cycle; `TOO_DEEP`, `TOO_MANY_KEYS`
 *   and `TOO_LARGE` when a limit is exceeded
 * @throws {TypeError} when a limit option is not a positive integer
 */
const toPlainJson = (value, { maxBytes, maxDepth, maxKeys } = {}) => {
  const byteLimit = positiveInteger(maxBytes, Infinity);
  const depthLimit = positiveInteger(maxDepth, DEFAULT_MAX_DEPTH, DEPTH_HARD_LIMIT);
  const keyLimit = positiveInteger(maxKeys, DEFAULT_MAX_KEYS);

  if (value === null || value === undefined) {
    return { data: {}, bytes: 2 };
  }
  if (typeof value !== 'object' || Array.isArray(value) || !isPlainObject(value)) {
    throw new PlainJsonError('NOT_AN_OBJECT', 'Template data must be a plain object');
  }

  const ancestors = new Set();
  let keyCount = 0;

  const countKeys = (amount, path) => {
    keyCount += amount;
    if (keyCount > keyLimit) {
      throw new PlainJsonError(
        'TOO_MANY_KEYS',
        `Template data has more than ${keyLimit} keys and items (at ${path})`,
        path
      );
    }
  };

  const unsupported = (path) =>
    new PlainJsonError('UNSUPPORTED_VALUE', `Unsupported value at ${path}`, path);

  /**
   * @param {unknown} input
   * @param {string} path
   * @param {number} depth
   * @returns {unknown} the converted value; `undefined` means "drop"
   */
  const convert = (input, path, depth) => {
    switch (typeof input) {
      case 'string':
      case 'boolean':
        return input;
      case 'number':
        return Number.isFinite(input) ? input : null;
      case 'undefined':
      case 'function':
      case 'symbol':
        return undefined;
      case 'bigint':
        throw unsupported(path);
      default:
        break;
    }
    if (input === null) return null;

    if (input instanceof Date) {
      const time = input.getTime();
      return Number.isNaN(time) ? null : input.toISOString();
    }

    const isArray = Array.isArray(input);
    if (isArray ? Object.getPrototypeOf(input) !== Array.prototype : !isPlainObject(input)) {
      throw unsupported(path);
    }
    if (ancestors.has(input)) {
      throw new PlainJsonError(
        'CIRCULAR',
        `Template data has a circular reference at ${path}`,
        path
      );
    }
    if (depth > depthLimit) {
      throw new PlainJsonError(
        'TOO_DEEP',
        `Template data is nested deeper than ${depthLimit} levels (at ${path})`,
        path
      );
    }

    ancestors.add(input);
    let result;
    if (isArray) {
      countKeys(input.length, path);
      result = new Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        const itemPath = `${path}[${i}]`;
        const descriptor = Object.getOwnPropertyDescriptor(input, i);
        if (descriptor && !('value' in descriptor)) throw unsupported(itemPath);
        const item = descriptor ? convert(descriptor.value, itemPath, depth + 1) : undefined;
        result[i] = item === undefined ? null : item;
      }
    } else {
      result = {};
      for (const key of Object.keys(input)) {
        if (DROPPED_KEYS.has(key)) continue;
        const keyPath = childPath(path, key);
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!('value' in descriptor)) throw unsupported(keyPath);
        const item = convert(descriptor.value, keyPath, depth + 1);
        if (item === undefined) continue;
        countKeys(1, keyPath);
        result[key] = item;
      }
    }
    ancestors.delete(input);
    return result;
  };

  const data = convert(value, 'templateData', 0);
  const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (bytes > byteLimit) {
    throw new PlainJsonError('TOO_LARGE', `Template data is larger than ${byteLimit} bytes`);
  }
  return { data, bytes };
};

module.exports = { toPlainJson, PlainJsonError };
