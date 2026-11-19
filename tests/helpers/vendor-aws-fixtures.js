'use strict';

/**
 * Builds the vendored AWS fixtures from downloaded official sources
 * (development only, never at runtime).
 *
 *   node tests/helpers/vendor-aws-fixtures.js sigv4 <aws-c-auth v4 dir> <commit>
 *   node tests/helpers/vendor-aws-fixtures.js smithy <sesv2-2019-09-27.json> <commit>
 *
 * - sigv4: every case directory of awslabs/aws-c-auth
 *   tests/aws-signing-test-suite/v4 becomes one entry of
 *   tests/fixtures/aws-sigv4/v4-vectors.json; each file is kept as a string
 *   together with the SHA-256 of the original file, so the copy is checkable.
 * - smithy: the shapes reachable from the operations Magic Mail calls
 *   (SendEmail, GetAccount, ListEmailTemplates, GetEmailTemplate), with their
 *   documentation traits removed, plus the service's protocol and signing
 *   traits, written to tests/fixtures/smithy/sesv2.json together with the
 *   SHA-256 of the full model file.
 *
 * @sideeffect Writes the fixture files.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const SIGV4_FILES = [
  'context.json',
  'request.txt',
  'header-canonical-request.txt',
  'header-string-to-sign.txt',
  'header-signature.txt',
  'header-signed-request.txt',
];
const SES_OPERATIONS = ['SendEmail', 'GetAccount', 'ListEmailTemplates', 'GetEmailTemplate'];
const NS = 'com.amazonaws.sesv2#';

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function vendorSigv4(dir, commit) {
  const cases = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const caseDir = path.join(dir, name);
    if (!fs.statSync(caseDir).isDirectory()) continue;
    const files = {};
    for (const file of SIGV4_FILES) {
      const buffer = fs.readFileSync(path.join(caseDir, file));
      files[file] = { sha256: sha256(buffer), content: buffer.toString('utf8') };
    }
    cases[name] = files;
  }
  const out = {
    source: {
      repository: 'https://github.com/awslabs/aws-c-auth',
      path: 'tests/aws-signing-test-suite/v4',
      commit,
      license: 'Apache-2.0 (aws-c-auth LICENSE); AWS published SigV4 test suite',
      retrieved: new Date().toISOString().slice(0, 10),
    },
    cases,
  };
  const target = path.join(FIXTURES, 'aws-sigv4', 'v4-vectors.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
}

const stripDocs = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, v) => (key === 'smithy.api#documentation' ? undefined : v))
  );

function vendorSmithy(file, commit) {
  const buffer = fs.readFileSync(file);
  const model = JSON.parse(buffer.toString('utf8'));
  const shapes = {};
  const pending = SES_OPERATIONS.map((op) => `${NS}${op}`);
  const add = (target) => {
    if (typeof target === 'string' && target.startsWith(NS) && !shapes[target]) {
      pending.push(target);
    }
  };
  while (pending.length > 0) {
    const id = pending.pop();
    if (shapes[id]) continue;
    const shape = model.shapes[id];
    if (!shape) throw new Error(`missing shape ${id}`);
    shapes[id] = stripDocs(shape);
    add(shape.input?.target);
    add(shape.output?.target);
    for (const error of shape.errors || []) add(error.target);
    for (const member of Object.values(shape.members || {})) add(member.target);
    add(shape.member?.target);
    add(shape.key?.target);
    add(shape.value?.target);
  }
  const service = model.shapes[`${NS}SimpleEmailService_v2`];
  const sorted = Object.fromEntries(
    Object.keys(shapes)
      .sort()
      .map((id) => [id, shapes[id]])
  );
  const out = {
    'x-magic-mail-source': {
      repository: 'https://github.com/aws/api-models-aws',
      path: 'models/sesv2/service/2019-09-27/sesv2-2019-09-27.json',
      commit,
      sha256: sha256(buffer),
      license: 'Apache-2.0',
      retrieved: new Date().toISOString().slice(0, 10),
      note: 'Subset: shapes reachable from the operations below; documentation traits removed.',
      operations: SES_OPERATIONS,
    },
    smithy: model.smithy,
    service: {
      'aws.api#service': service.traits['aws.api#service'],
      'aws.auth#sigv4': service.traits['aws.auth#sigv4'],
      'aws.protocols#restJson1': service.traits['aws.protocols#restJson1'],
    },
    shapes: sorted,
  };
  const target = path.join(FIXTURES, 'smithy', 'sesv2.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
}

if (require.main === module) {
  const [kind, source, commit] = process.argv.slice(2);
  if (!kind || !source || !/^[0-9a-f]{40}$/.test(commit || '')) {
    console.error('usage: vendor-aws-fixtures.js sigv4|smithy <source> <commit sha>');
    process.exit(1);
  }
  if (kind === 'sigv4') vendorSigv4(source, commit);
  else if (kind === 'smithy') vendorSmithy(source, commit);
  else process.exit(1);
}

module.exports = { vendorSigv4, vendorSmithy };
