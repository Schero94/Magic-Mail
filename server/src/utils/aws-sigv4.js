'use strict';

/**
 * Minimal AWS Signature Version 4 signer (header-based, HMAC-SHA256) for the
 * Amazon SES v2 JSON API. Implemented with node:crypto only, so the plugin
 * does not pull in the AWS SDK (16 MB, 24 packages, and a default credential
 * chain that reads instance-metadata endpoints).
 *
 * Docs (checked 2026-11-18):
 * - "Create a signed AWS API request",
 *   https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 *   (canonical request, UriEncode rules, CanonicalHeaders trim/collapse and
 *   comma-joined multi-value headers, string to sign without a trailing
 *   newline, signing key "AWS4"+secret -> date -> region -> service ->
 *   "aws4_request").
 * - Test vectors: awslabs/aws-c-auth tests/aws-signing-test-suite/v4
 *   (vendored in tests/fixtures/aws-sigv4, every case is run by
 *   tests/aws-sigv4.test.js).
 *
 * Path handling: `path` is the path as it goes on the wire (already
 * percent-encoded where needed). The canonical URI applies UriEncode to each
 * segment of it once more, which is the "double encoding" AWS services other
 * than S3 expect and matches the vendored vectors (a raw space becomes %20).
 * Magic Mail only signs fixed SES paths plus template names restricted to
 * `[A-Za-z0-9_-]`, where both forms are identical.
 */

const crypto = require('node:crypto');

const ALGORITHM = 'AWS4-HMAC-SHA256';
const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

/** @param {string|Buffer} data @returns {string} lower-case hex SHA-256 */
const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** @param {Buffer|string} key @param {string} data @returns {Buffer} */
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();

/**
 * UriEncode as defined by AWS: every byte except A-Z a-z 0-9 - . _ ~ becomes
 * %XX with upper-case hex; the slash is encoded too.
 *
 * @param {string} value
 * @returns {string}
 */
function uriEncode(value) {
  let out = '';
  for (const byte of Buffer.from(String(value), 'utf8')) {
    const char = String.fromCharCode(byte);
    out += /[A-Za-z0-9\-._~]/.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/**
 * Decodes percent escapes; a malformed escape is kept literally.
 *
 * @param {string} value
 * @returns {string}
 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Removes `.` and `..` segments and empty segments (RFC 3986 5.2.4 style),
 * keeping a trailing slash.
 *
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
  const segments = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  const trailing = path.length > 1 && path.endsWith('/') && segments.length > 0;
  return `/${segments.join('/')}${trailing ? '/' : ''}`;
}

/**
 * Canonical URI: each path segment UriEncode'd (slashes kept).
 *
 * @param {string} path - Wire path starting with '/'
 * @param {boolean} normalize
 * @returns {string}
 */
function canonicalUri(path, normalize) {
  const source = typeof path === 'string' && path.startsWith('/') ? path : `/${path || ''}`;
  const base = normalize ? normalizePath(source) : source;
  return base
    .split('/')
    .map((segment) => uriEncode(segment))
    .join('/');
}

/**
 * Canonical query string: names and values decoded once, UriEncode'd,
 * sorted by encoded name, then value.
 *
 * @param {string} query - Raw query string without '?'
 * @returns {string}
 */
function canonicalQuery(query) {
  if (!query) return '';
  return query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const index = pair.indexOf('=');
      const name = index === -1 ? pair : pair.slice(0, index);
      const value = index === -1 ? '' : pair.slice(index + 1);
      return [uriEncode(safeDecode(name)), uriEncode(safeDecode(value))];
    })
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

/**
 * Normalises header input to [lower-case name, value] pairs.
 *
 * @param {Record<string, string>|Array<[string, string]>} headers
 * @returns {Array<[string, string]>}
 */
function headerPairs(headers) {
  const entries = Array.isArray(headers) ? headers : Object.entries(headers || {});
  return entries
    .filter(([name, value]) => typeof name === 'string' && value !== undefined && value !== null)
    .map(([name, value]) => [name.trim().toLowerCase(), String(value)]);
}

/**
 * Canonical headers and the signed header list. Values are trimmed and
 * sequential whitespace (including folded lines) collapses to one space;
 * repeated names are joined with commas in their original order.
 *
 * @param {Array<[string, string]>} pairs
 * @returns {{canonical: string, signed: string}}
 */
function canonicalHeaders(pairs) {
  const byName = new Map();
  for (const [name, value] of pairs) {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (byName.has(name)) byName.get(name).push(clean);
    else byName.set(name, [clean]);
  }
  const names = [...byName.keys()].sort();
  return {
    canonical: names.map((name) => `${name}:${byName.get(name).join(',')}\n`).join(''),
    signed: names.join(';'),
  };
}

/** @param {Date} date @returns {{amzDate: string, day: string}} */
function amzDates(date) {
  const iso = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return { amzDate: iso, day: iso.slice(0, 8) };
}

/**
 * Derives the SigV4 signing key.
 *
 * @param {string} secretAccessKey
 * @param {string} day - YYYYMMDD
 * @param {string} region
 * @param {string} service
 * @returns {Buffer}
 */
function signingKey(secretAccessKey, day, region, service) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

/**
 * @typedef {object} AwsCredentials
 * @property {string} accessKeyId
 * @property {string} secretAccessKey
 * @property {string} [sessionToken] - Temporary credentials (STS / role)
 */

/**
 * Signs one HTTP request with SigV4 (Authorization header).
 *
 * Adds `x-amz-date`, `x-amz-security-token` (when a session token is given;
 * signed unless `signSessionToken` is false) and, with `signBody`,
 * `x-amz-content-sha256`. Every given header is signed; pass only the
 * headers that are sent unchanged (host, content-type, x-amz-*).
 *
 * @param {object} request
 * @param {string} request.method - HTTP method
 * @param {string} request.path - Wire path, e.g. '/v2/email/outbound-emails'
 * @param {string} [request.query] - Raw query string without '?'
 * @param {Record<string, string>|Array<[string, string]>} request.headers - Must include `host`
 * @param {string|Buffer} [request.body] - Payload ('' for none)
 * @param {object} options
 * @param {AwsCredentials} options.credentials
 * @param {string} options.region
 * @param {string} options.service - Signing name ('ses' for SES v2)
 * @param {Date} [options.date] - Signing time (default now)
 * @param {boolean} [options.normalize=true] - Remove dot segments from the path
 * @param {boolean} [options.signBody=false] - Add x-amz-content-sha256
 * @param {boolean} [options.signSessionToken=true] - Include the token in the signature
 * @returns {{headers: Record<string, string>, canonicalRequest: string, stringToSign: string, signature: string, authorization: string}}
 *   `headers`: lower-case names, the input headers plus the added ones and `authorization`.
 * @throws {TypeError} When credentials, region, service or the host header are missing
 */
function signRequest(request, options) {
  const { credentials, region, service } = options || {};
  if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
    throw new TypeError('AWS credentials are required');
  }
  if (!region || !service) throw new TypeError('AWS region and service are required');
  const date = options.date instanceof Date ? options.date : new Date();
  const { amzDate, day } = amzDates(date);
  const body = request.body === undefined || request.body === null ? '' : request.body;
  const payloadHash = body === '' ? EMPTY_SHA256 : sha256Hex(body);

  const pairs = headerPairs(request.headers);
  if (!pairs.some(([name]) => name === 'host')) throw new TypeError('host header is required');
  const withoutDate = pairs.filter(([name]) => name !== 'x-amz-date' && name !== 'authorization');
  const signedPairs = [...withoutDate, ['x-amz-date', amzDate]];
  if (options.signBody) signedPairs.push(['x-amz-content-sha256', payloadHash]);
  const token = credentials.sessionToken;
  const signToken = token && options.signSessionToken !== false;
  if (signToken) signedPairs.push(['x-amz-security-token', token]);

  const { canonical, signed } = canonicalHeaders(signedPairs);
  const canonicalRequest = [
    String(request.method || 'GET').toUpperCase(),
    canonicalUri(request.path || '/', options.normalize !== false),
    canonicalQuery(request.query || ''),
    canonical,
    signed,
    payloadHash,
  ].join('\n');

  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = crypto
    .createHmac('sha256', signingKey(credentials.secretAccessKey, day, region, service))
    .update(stringToSign, 'utf8')
    .digest('hex');
  const authorization = `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;

  const headers = {};
  for (const [name, value] of signedPairs) {
    headers[name] = name in headers ? `${headers[name]},${value}` : value;
  }
  if (token && !signToken) headers['x-amz-security-token'] = token;
  headers.authorization = authorization;
  return { headers, canonicalRequest, stringToSign, signature, authorization };
}

module.exports = {
  ALGORITHM,
  EMPTY_SHA256,
  canonicalQuery,
  canonicalUri,
  signRequest,
  signingKey,
  uriEncode,
};
