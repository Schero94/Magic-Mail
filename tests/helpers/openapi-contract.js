'use strict';

/**
 * Validates provider requests and responses against the vendored official
 * OpenAPI documents (tests/fixtures/openapi, extracted by extract-openapi.js).
 *
 * Checks per request: the host is a documented server, the path matches a
 * documented operation, every query parameter is declared and valid, required
 * parameters are present, the JSON or multipart body matches the request
 * schema, and no body field is sent that the schema does not declare.
 * Checks per response: the status is documented and the JSON body matches it.
 *
 * Uses Ajv's JSON Schema 2020-12 validator (OpenAPI 3.1 schemas are JSON
 * Schema 2020-12). Format keywords are not asserted.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020').default;

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'openapi');

/**
 * @param {string} name - Fixture name without .json
 * @returns {object} The vendored OpenAPI document
 */
function loadSpec(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
}

/** Resolves a local JSON pointer `#/a/b`. */
function resolvePointer(spec, ref) {
  let node = spec;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return node;
}

const deref = (spec, node) => {
  let current = node;
  for (let i = 0; i < 20 && current && current.$ref; i += 1) {
    current = resolvePointer(spec, current.$ref);
  }
  return current;
};

/**
 * Walks a body and its schema and reports keys the schema does not declare
 * (only where the schema lists `properties` and allows nothing else).
 *
 * @returns {string[]} Undeclared key paths
 */
function undeclaredKeys(spec, schema, value, at = '') {
  const s = deref(spec, schema);
  if (!s || typeof s !== 'object' || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return s.items
      ? value.flatMap((item, i) => undeclaredKeys(spec, s.items, item, `${at}[${i}]`))
      : [];
  }
  let props = { ...(s.properties || {}) };
  let open = s.additionalProperties !== undefined && s.additionalProperties !== false;
  let patterns = s.patternProperties ? Object.keys(s.patternProperties) : [];
  for (const part of [...(s.allOf || [])]) {
    const p = deref(spec, part);
    props = { ...props, ...(p?.properties || {}) };
    if (p?.additionalProperties !== undefined && p.additionalProperties !== false) open = true;
    if (p?.patternProperties) patterns = patterns.concat(Object.keys(p.patternProperties));
  }
  if (s.anyOf || s.oneOf) {
    // Union: check against the branch that declares the most of the value's keys.
    const branches = (s.anyOf || s.oneOf).map((b) => deref(spec, b));
    const best = branches
      .map((b) => ({ b, misses: undeclaredKeys(spec, b, value, at).length }))
      .sort((a, b) => a.misses - b.misses)[0];
    return best ? undeclaredKeys(spec, best.b, value, at) : [];
  }
  if (Object.keys(props).length === 0) return [];
  const out = [];
  for (const [key, child] of Object.entries(value)) {
    if (props[key]) out.push(...undeclaredKeys(spec, props[key], child, `${at}.${key}`));
    else if (!open && !patterns.some((p) => new RegExp(p).test(key))) out.push(`${at}.${key}`);
  }
  return out;
}

class OpenApiContract {
  /**
   * @param {string} name - Fixture name (sendgrid-templates, sendgrid-mail, mailgun)
   */
  constructor(name) {
    this.name = name;
    this.spec = loadSpec(name);
    this.strict = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
    this.coercing = new Ajv2020({
      strict: false,
      allErrors: true,
      validateFormats: false,
      coerceTypes: 'array',
    });
    this.strict.addSchema(this.spec, 'spec');
    this.coercing.addSchema(this.spec, 'spec');
    this.servers = (this.spec.servers || []).map((server) => new URL(server.url).host);
    // Server URLs with a path (Brevo: https://api.brevo.com/v3) prefix every
    // documented path; SendGrid and Mailgun servers have none.
    this.basePaths = [
      ...new Set(
        (this.spec.servers || [])
          .map((server) => new URL(server.url).pathname.replace(/\/+$/, ''))
          .filter(Boolean)
      ),
    ];
  }

  /**
   * Finds the documented operation for a URL.
   *
   * @param {string} method
   * @param {URL} url
   * @returns {{template: string, op: object, pathItem: object}|null}
   */
  findOperation(method, url) {
    const candidates = [url.pathname];
    for (const base of this.basePaths || []) {
      if (url.pathname.startsWith(`${base}/`)) candidates.push(url.pathname.slice(base.length));
    }
    for (const [template, pathItem] of Object.entries(this.spec.paths)) {
      const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
      const op = pathItem[method.toLowerCase()];
      if (op && candidates.some((candidate) => pattern.test(candidate))) {
        return { template, op, pathItem };
      }
    }
    return null;
  }

  validate(ajv, schema, value) {
    // Local references point into the whole document, registered as "spec".
    const rewrite = (node) => {
      if (Array.isArray(node)) return node.map(rewrite);
      if (!node || typeof node !== 'object') return node;
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) =>
          k === '$ref' && typeof v === 'string' && v.startsWith('#/')
            ? [k, `spec${v}`]
            : [k, rewrite(v)]
        )
      );
    };
    const key = JSON.stringify(schema);
    this.cache = this.cache || new Map();
    const cacheKey = `${ajv === this.strict ? 's' : 'c'}${key}`;
    let validator = this.cache.get(cacheKey);
    if (!validator) {
      validator = ajv.compile(rewrite(schema));
      this.cache.set(cacheKey, validator);
    }
    const data = JSON.parse(JSON.stringify(value));
    const ok = validator(data);
    return ok ? [] : validator.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  }

  /**
   * Validates a request the plugin built.
   *
   * @param {{method: string, url: string, json?: object, form?: Array<[string, string]>}} request
   * @returns {string[]} Contract violations (empty = valid)
   */
  checkRequest({ method, url, json, form }) {
    const errors = [];
    const parsed = new URL(url);
    if (!this.servers.includes(parsed.host)) {
      errors.push(`host ${parsed.host} is not a documented server`);
    }
    const found = this.findOperation(method, parsed);
    if (!found) return [...errors, `${method} ${parsed.pathname} is not a documented operation`];
    const { op, pathItem } = found;
    const params = [...(pathItem.parameters || []), ...(op.parameters || [])].map((p) =>
      deref(this.spec, p)
    );
    const query = Object.fromEntries(parsed.searchParams);
    for (const [name, value] of Object.entries(query)) {
      const param = params.find((p) => p.in === 'query' && p.name === name);
      if (!param) {
        errors.push(`query parameter ${name} is not documented`);
        continue;
      }
      const wrapped = { type: 'object', properties: { v: param.schema || {} } };
      errors.push(
        ...this.validate(this.coercing, wrapped, { v: value }).map((e) => `query ${name}: ${e}`)
      );
    }
    for (const param of params) {
      if (param.in === 'query' && param.required && !(param.name in query)) {
        errors.push(`required query parameter ${param.name} is missing`);
      }
    }
    const body = op.requestBody ? deref(this.spec, op.requestBody) : null;
    if (json !== undefined) {
      const schema = body?.content?.['application/json']?.schema;
      if (!schema) errors.push('JSON body is not documented');
      else {
        errors.push(...this.validate(this.strict, schema, json).map((e) => `body${e}`));
        errors.push(
          ...undeclaredKeys(this.spec, schema, json).map((k) => `undeclared body key ${k}`)
        );
      }
    }
    if (form !== undefined) {
      const schema = deref(this.spec, body?.content?.['multipart/form-data']?.schema);
      if (!schema) errors.push('multipart body is not documented');
      else {
        const object = {};
        for (const [key, value] of form) {
          const prop = deref(this.spec, schema.properties?.[key]);
          if (prop?.type === 'array') (object[key] = object[key] || []).push(value);
          else object[key] = value;
        }
        const declared = Object.keys(schema.properties || {});
        // Mailgun documents header and variable families with one example
        // property each (`h:X-My-Header`, `v:my-var`).
        const families = declared.filter((k) => /^[hv]:/.test(k)).map((k) => k.slice(0, 2));
        for (const key of Object.keys(object)) {
          if (!declared.includes(key) && !families.includes(key.slice(0, 2))) {
            errors.push(`form field ${key} is not documented`);
          }
        }
        const known = Object.fromEntries(
          Object.entries(object).filter(([k]) => declared.includes(k))
        );
        errors.push(...this.validate(this.coercing, schema, known).map((e) => `form${e}`));
      }
    }
    return errors;
  }

  /**
   * Validates a (fake) provider response against the documented response.
   *
   * @param {{method: string, url: string, status: number, json?: unknown}} response
   * @returns {string[]}
   */
  checkResponse({ method, url, status, json }) {
    const found = this.findOperation(method, new URL(url));
    if (!found) return [`${method} ${url} is not a documented operation`];
    const responses = found.op.responses || {};
    const documented =
      responses[String(status)] || responses[`${String(status)[0]}XX`] || responses.default;
    if (!documented) return [`status ${status} is not documented`];
    const resolved = deref(this.spec, documented);
    const schema = resolved?.content?.['application/json']?.schema;
    if (!schema || json === undefined) return [];
    return this.validate(this.strict, schema, json).map((e) => `response${e}`);
  }

  /** SHA-256 recorded for the official source of this vendored copy. */
  get source() {
    return this.spec['x-magic-mail-source'];
  }
}

/**
 * SHA-256 of a vendored file (used to pin the copies).
 *
 * @param {string} name
 * @returns {string}
 */
function fixtureSha256(name) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(FIXTURES, `${name}.json`)))
    .digest('hex');
}

module.exports = { OpenApiContract, fixtureSha256, undeclaredKeys };
