'use strict';

/**
 * Extracts the operations Magic Mail calls from an official provider OpenAPI
 * document into a small vendored copy (the operations plus every component
 * they reference). The source file's SHA-256 and URL are written into the
 * copy's `x-magic-mail-source`, so the copy can be re-generated and checked.
 *
 * Usage (development only, never at runtime):
 *   node tests/helpers/extract-openapi.js <source.json> <out.json> <url> <METHOD path>...
 *
 * @sideeffect Writes <out.json>.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');

function extract(source, operations) {
  const spec = JSON.parse(source);
  const out = {
    openapi: spec.openapi,
    info: spec.info,
    servers: spec.servers,
    paths: {},
    components: {},
  };
  const pending = [];
  const seen = new Set();
  const collectRefs = (node) => {
    if (Array.isArray(node)) return node.forEach(collectRefs);
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/')) {
        if (!seen.has(value)) {
          seen.add(value);
          pending.push(value);
        }
      } else collectRefs(value);
    }
  };
  for (const operation of operations) {
    const [method, path] = operation.split(' ');
    const op = spec.paths?.[path]?.[method.toLowerCase()];
    if (!op) throw new Error(`Operation not in source: ${operation}`);
    out.paths[path] = out.paths[path] || {};
    if (spec.paths[path].parameters) out.paths[path].parameters = spec.paths[path].parameters;
    out.paths[path][method.toLowerCase()] = op;
    collectRefs(op);
    collectRefs(spec.paths[path].parameters);
  }
  while (pending.length > 0) {
    const ref = pending.shift();
    const parts = ref.slice(2).split('/');
    let node = spec;
    for (const part of parts) node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) throw new Error(`Unresolved reference ${ref}`);
    let target = out;
    for (const part of parts.slice(0, -1)) target = target[part] = target[part] || {};
    target[parts[parts.length - 1]] = node;
    collectRefs(node);
  }
  return out;
}

if (require.main === module) {
  const [sourcePath, outPath, url, ...operations] = process.argv.slice(2);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const extracted = extract(source, operations);
  extracted['x-magic-mail-source'] = {
    url,
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
    retrieved: new Date().toISOString().slice(0, 10),
    operations,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(extracted, null, 2)}\n`);
}

module.exports = { extract };
