'use strict';

/**
 * Small validator for restJson1 request and response bodies against the
 * vendored official Smithy model of Amazon SES v2
 * (tests/fixtures/smithy/sesv2.json, extracted by vendor-aws-fixtures.js).
 *
 * Checks: structure members (required, undeclared), member names
 * (`smithy.api#jsonName` when present), simple types, blobs as base64
 * strings, epoch-second timestamps (restJson1 default), enums, `length`
 * (strings in Unicode code points, lists and maps in entries), `range` and
 * `pattern` traits, lists and maps. Members bound to the URI, query or
 * headers are not part of the body; `httpInput` validates them separately.
 *
 * Smithy references: https://smithy.io/2.0/spec/constraint-traits.html,
 * https://smithy.io/2.0/aws/protocols/aws-restjson1-protocol.html
 */

const fs = require('node:fs');
const path = require('node:path');

const NS = 'com.amazonaws.sesv2#';
const PRELUDE = {
  'smithy.api#String': { type: 'string' },
  'smithy.api#Integer': { type: 'integer' },
  'smithy.api#Boolean': { type: 'boolean' },
  'smithy.api#Unit': { type: 'structure', members: {} },
};
const HTTP_BINDINGS = [
  'smithy.api#httpLabel',
  'smithy.api#httpQuery',
  'smithy.api#httpHeader',
  'smithy.api#httpQueryParams',
  'smithy.api#httpPrefixHeaders',
];

/** @returns {object} The vendored model subset */
function loadModel() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'smithy', 'sesv2.json'), 'utf8')
  );
}

/**
 * @param {object} model
 * @param {string} id - Shape id, with or without namespace
 * @returns {object}
 */
function shapeOf(model, id) {
  const full = id.includes('#') ? id : `${NS}${id}`;
  const shape = model.shapes[full] || PRELUDE[full];
  if (!shape) throw new Error(`unknown shape ${full}`);
  return shape;
}

const isBound = (traits = {}) => HTTP_BINDINGS.some((name) => name in traits);
const codePoints = (value) => [...value].length;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Validates `value` against shape `id`.
 *
 * @param {object} model
 * @param {string} id
 * @param {unknown} value
 * @param {{at?: string, bodyOnly?: boolean}} [options] - bodyOnly skips HTTP-bound members
 * @returns {string[]} Problems ("path: message"); empty when valid
 */
function validate(model, id, value, { at = '$', bodyOnly = true } = {}) {
  const errors = [];
  const check = (shapeId, v, where, memberTraits = {}) => {
    const shape = shapeOf(model, shapeId);
    const traits = { ...(shape.traits || {}), ...memberTraits };
    const fail = (message) => errors.push(`${where}: ${message}`);
    switch (shape.type) {
      case 'structure': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('expected object');
        const members = shape.members || {};
        const byJsonName = new Map();
        for (const [name, member] of Object.entries(members)) {
          if (bodyOnly && isBound(member.traits)) continue;
          byJsonName.set(member.traits?.['smithy.api#jsonName'] || name, [name, member]);
        }
        for (const key of Object.keys(v)) {
          if (!byJsonName.has(key)) fail(`undeclared member "${key}"`);
        }
        for (const [jsonName, [, member]] of byJsonName) {
          const present = v[jsonName] !== undefined && v[jsonName] !== null;
          if (!present) {
            if (member.traits && 'smithy.api#required' in member.traits) {
              fail(`missing required member "${jsonName}"`);
            }
            continue;
          }
          check(member.target, v[jsonName], `${where}.${jsonName}`, member.traits || {});
        }
        return undefined;
      }
      case 'union': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('expected object');
        const keys = Object.keys(v);
        if (keys.length !== 1) return fail('a union needs exactly one member');
        const member = shape.members?.[keys[0]];
        if (!member) return fail(`undeclared union member "${keys[0]}"`);
        return check(member.target, v[keys[0]], `${where}.${keys[0]}`, member.traits || {});
      }
      case 'list':
      case 'set': {
        if (!Array.isArray(v)) return fail('expected array');
        lengthCheck(traits, v.length, fail);
        v.forEach((item, i) => check(shape.member.target, item, `${where}[${i}]`));
        return undefined;
      }
      case 'map': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('expected object');
        lengthCheck(traits, Object.keys(v).length, fail);
        for (const [key, item] of Object.entries(v)) {
          check(shape.key.target, key, `${where}{key}`);
          check(shape.value.target, item, `${where}.${key}`);
        }
        return undefined;
      }
      case 'string': {
        if (typeof v !== 'string') return fail('expected string');
        lengthCheck(traits, codePoints(v), fail);
        const pattern = traits['smithy.api#pattern'];
        if (pattern && !new RegExp(pattern, 'u').test(v)) fail(`does not match ${pattern}`);
        const legacyEnum = traits['smithy.api#enum'];
        if (Array.isArray(legacyEnum) && !legacyEnum.some((entry) => entry.value === v)) {
          fail(`not an enum value: ${v}`);
        }
        return undefined;
      }
      case 'enum': {
        const values = Object.entries(shape.members || {}).map(
          ([name, member]) => member.traits?.['smithy.api#enumValue'] ?? name
        );
        if (typeof v !== 'string' || !values.includes(v)) fail(`not one of ${values.join('|')}`);
        return undefined;
      }
      case 'blob': {
        if (typeof v !== 'string' || !BASE64.test(v)) fail('expected base64 string');
        return undefined;
      }
      case 'boolean':
        if (typeof v !== 'boolean') fail('expected boolean');
        return undefined;
      case 'byte':
      case 'short':
      case 'integer':
      case 'long':
        if (!Number.isInteger(v)) return fail('expected integer');
        return rangeCheck(traits, v, fail);
      case 'float':
      case 'double':
        if (typeof v !== 'number' || !Number.isFinite(v)) return fail('expected number');
        return rangeCheck(traits, v, fail);
      case 'timestamp': {
        const format = traits['smithy.api#timestampFormat'] || 'epoch-seconds';
        if (format === 'epoch-seconds' && (typeof v !== 'number' || !Number.isFinite(v))) {
          fail('expected epoch seconds');
        } else if (
          format === 'date-time' &&
          (typeof v !== 'string' || Number.isNaN(Date.parse(v)))
        ) {
          fail('expected date-time string');
        }
        return undefined;
      }
      default:
        return fail(`unsupported shape type ${shape.type}`);
    }
  };
  check(id, value, at);
  return errors;
}

function lengthCheck(traits, size, fail) {
  const length = traits['smithy.api#length'];
  if (!length) return;
  if (length.min !== undefined && size < length.min) fail(`length ${size} < ${length.min}`);
  if (length.max !== undefined && size > length.max) fail(`length ${size} > ${length.max}`);
}

function rangeCheck(traits, value, fail) {
  const range = traits['smithy.api#range'];
  if (!range) return undefined;
  if (range.min !== undefined && value < range.min) fail(`${value} < ${range.min}`);
  if (range.max !== undefined && value > range.max) fail(`${value} > ${range.max}`);
  return undefined;
}

/**
 * Checks a recorded HTTP request against an operation: method, URI pattern
 * (labels), declared query parameters and the JSON body.
 *
 * @param {object} model
 * @param {string} operation - e.g. 'SendEmail'
 * @param {{method: string, path: string, query?: URLSearchParams, json?: unknown}} request
 * @returns {string[]} Problems; empty when valid
 */
function validateHttpRequest(model, operation, request) {
  const op = shapeOf(model, operation);
  const http = op.traits['smithy.api#http'];
  const errors = [];
  if (request.method !== http.method) errors.push(`method ${request.method} != ${http.method}`);
  const input = shapeOf(model, op.input.target);
  const labels = {};
  const pattern = new RegExp(
    `^${http.uri.replace(/\{([^}]+)\}/g, (_, name) => {
      labels[name] = true;
      return `(?<${name}>[^/]+)`;
    })}$`
  );
  const match = pattern.exec(request.path);
  if (!match) errors.push(`path ${request.path} does not match ${http.uri}`);
  const query = request.query || new URLSearchParams();
  const declaredQuery = new Map();
  for (const [name, member] of Object.entries(input.members || {})) {
    const queryName = member.traits?.['smithy.api#httpQuery'];
    if (queryName) declaredQuery.set(queryName, [name, member]);
    if (member.traits && 'smithy.api#httpLabel' in member.traits) {
      const raw = match?.groups?.[name];
      if (raw === undefined) errors.push(`missing label ${name}`);
      else errors.push(...validate(model, member.target, decodeURIComponent(raw), { at: name }));
    }
  }
  for (const [key, value] of query.entries()) {
    const entry = declaredQuery.get(key);
    if (!entry) {
      errors.push(`undeclared query parameter ${key}`);
      continue;
    }
    const target = shapeOf(model, entry[1].target);
    const typed = ['integer', 'long'].includes(target.type) ? Number(value) : value;
    errors.push(...validate(model, entry[1].target, typed, { at: `?${key}` }));
  }
  if (request.json !== undefined) {
    errors.push(...validate(model, op.input.target, request.json, { at: 'body' }));
  } else if (
    Object.values(input.members || {}).some(
      (member) => member.traits?.['smithy.api#required'] && !isBound(member.traits)
    )
  ) {
    errors.push('missing JSON body');
  }
  return errors;
}

/**
 * Validates a JSON response body for an operation's output.
 *
 * @param {object} model
 * @param {string} operation
 * @param {unknown} json
 * @returns {string[]}
 */
function validateOutput(model, operation, json) {
  const op = shapeOf(model, operation);
  return validate(model, op.output.target, json, { at: 'response' });
}

/**
 * Validates an error shape the operation declares, and returns its HTTP
 * status from `smithy.api#httpError`.
 *
 * @param {object} model
 * @param {string} operation
 * @param {string} errorName - e.g. 'MessageRejected'
 * @returns {number|null} Status, or null when the operation does not declare the error
 */
function declaredErrorStatus(model, operation, errorName) {
  const op = shapeOf(model, operation);
  const declared = (op.errors || []).some((entry) => entry.target === `${NS}${errorName}`);
  if (!declared) return null;
  return shapeOf(model, errorName).traits['smithy.api#httpError'] ?? null;
}

module.exports = {
  NS,
  declaredErrorStatus,
  loadModel,
  shapeOf,
  validate,
  validateHttpRequest,
  validateOutput,
};
