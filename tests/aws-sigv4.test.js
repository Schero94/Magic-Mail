'use strict';

// SigV4 signer (server/src/utils/aws-sigv4.js) against every vendored case of
// the AWS SigV4 test suite (awslabs/aws-c-auth tests/aws-signing-test-suite/v4,
// see tests/fixtures/aws-sigv4/README.md): canonical request, string to sign,
// signature and Authorization header. The credentials in the vectors are the
// published AWS example keys (AKIDEXAMPLE), not secrets.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const vectors = require('./fixtures/aws-sigv4/v4-vectors.json');
const { signRequest, uriEncode, canonicalQuery } = require('../server/src/utils/aws-sigv4');

/**
 * Parses request.txt: request line, header lines (continuation lines start
 * with whitespace and stay part of the value), blank line, body.
 *
 * @param {string} text
 * @returns {{method: string, path: string, query: string, headers: Array<[string, string]>, body: string}}
 */
function parseRequest(text) {
  const lines = text.split('\n');
  // The target may contain spaces (get-space-*): it ends before " HTTP/1.1".
  const [, method, target] = /^(\S+) (.*) HTTP\/1\.1$/.exec(lines[0]);
  const [path, query = ''] = target.split(/\?(.*)/s);
  const headers = [];
  let index = 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') break;
    if (/^\s/.test(line) && headers.length > 0) {
      headers[headers.length - 1][1] += `\n${line}`;
      continue;
    }
    const colon = line.indexOf(':');
    headers.push([line.slice(0, colon), line.slice(colon + 1)]);
  }
  return { method, path, query, headers, body: lines.slice(index + 1).join('\n') };
}

test('vendored vectors are byte-identical to the pinned upstream files', () => {
  assert.match(vectors.source.commit, /^[0-9a-f]{40}$/);
  let files = 0;
  for (const [name, entry] of Object.entries(vectors.cases)) {
    for (const [file, { sha256, content }] of Object.entries(entry)) {
      const actual = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      assert.equal(actual, sha256, `${name}/${file}`);
      files += 1;
    }
  }
  assert.ok(files >= 200, `expected the full suite, got ${files} files`);
});

for (const [name, files] of Object.entries(vectors.cases)) {
  test(`SigV4 vector ${name}`, () => {
    const context = JSON.parse(files['context.json'].content);
    const request = parseRequest(files['request.txt'].content);
    const result = signRequest(request, {
      credentials: {
        accessKeyId: context.credentials.access_key_id,
        secretAccessKey: context.credentials.secret_access_key,
        ...(context.credentials.token ? { sessionToken: context.credentials.token } : {}),
      },
      region: context.region,
      service: context.service,
      date: new Date(context.timestamp),
      normalize: context.normalize !== false,
      signBody: context.sign_body === true,
      signSessionToken: context.omit_session_token !== true,
    });
    assert.equal(result.canonicalRequest, files['header-canonical-request.txt'].content);
    assert.equal(result.stringToSign, files['header-string-to-sign.txt'].content);
    assert.equal(result.signature, files['header-signature.txt'].content.trim());
    const expectedAuth = /^Authorization:(.*)$/m.exec(files['header-signed-request.txt'].content);
    assert.equal(result.authorization, expectedAuth[1]);
    const expectedDate = /^X-Amz-Date:(.*)$/m.exec(files['header-signed-request.txt'].content);
    assert.equal(result.headers['x-amz-date'], expectedDate[1]);
    if (context.credentials.token) {
      assert.equal(result.headers['x-amz-security-token'], context.credentials.token);
    }
  });
}

test('UriEncode follows the AWS rules (unreserved kept, space as %20, slash encoded)', () => {
  assert.equal(uriEncode('AZaz09-._~'), 'AZaz09-._~');
  assert.equal(uriEncode('a b+c/d'), 'a%20b%2Bc%2Fd');
  assert.equal(uriEncode('ሴ'), '%E1%88%B4');
  assert.equal(canonicalQuery('b=2&a=1&a=0'), 'a=0&a=1&b=2');
  assert.equal(canonicalQuery('NextToken=a%2Fb%3D&PageSize=10'), 'NextToken=a%2Fb%3D&PageSize=10');
});

test('the signer refuses missing credentials, region or host', () => {
  const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'x'.repeat(40) };
  const request = { method: 'GET', path: '/', headers: { host: 'example.test' } };
  assert.throws(() => signRequest(request, { credentials: {}, region: 'us-east-1', service: 's' }));
  assert.throws(() => signRequest(request, { credentials, region: '', service: 's' }));
  assert.throws(() =>
    signRequest({ ...request, headers: {} }, { credentials, region: 'us-east-1', service: 's' })
  );
});
