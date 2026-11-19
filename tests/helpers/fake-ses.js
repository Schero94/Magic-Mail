'use strict';

/**
 * Fake Amazon SES v2 HTTP server for integration tests (127.0.0.1 only).
 *
 * Every request is checked like SES would: the SigV4 Authorization header is
 * parsed, the credential scope must name the request's region and the `ses`
 * signing name, host / x-amz-date (and content-type for bodies) must be
 * signed, the date must be within 5 minutes, and the signature is recomputed
 * from the received request with the known secret. Bodies and query
 * parameters are validated against the vendored Smithy model. Synthetic data
 * only.
 *
 * Also: a fetch redirect for `email.<region>.amazonaws.com` and
 * `sns.<region>.amazonaws.com`, and a signer for synthetic SNS messages.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { signRequest } = require('../../server/src/utils/aws-sigv4');
const { snsStringToSign } = require('../../server/src/utils/sns-verify');
const smithy = require('./smithy-contract');

const SES_HOST = /^email\.([a-z0-9-]+)\.amazonaws\.com$/;
const SNS_HOST = /^sns\.([a-z0-9-]+)\.amazonaws\.com$/;
const MODEL = smithy.loadModel();

/** Synthetic credentials known to the fake server (not real AWS keys). */
const FAKE_CREDENTIALS = Object.freeze({
  accessKeyId: 'FAKEKEYIDFORTESTS001',
  secretAccessKey: 'fakeSecretForMagicMailTests/0123456789abc',
});

/** @returns {object} Fresh fake SES state */
function createSesState() {
  return {
    requests: [],
    /** accessKeyId -> secret (and optional session token) */
    keys: new Map([[FAKE_CREDENTIALS.accessKeyId, { secret: FAKE_CREDENTIALS.secretAccessKey }]]),
    templates: new Map(),
    account: {
      ProductionAccessEnabled: false,
      SendingEnabled: true,
      SendQuota: { Max24HourSend: 200, MaxSendRate: 1, SentLast24Hours: 3 },
      EnforcementStatus: 'HEALTHY',
      DedicatedIpAutoWarmupEnabled: false,
    },
    /** Queue of forced failures: {status, type, message, viaHeader?, path?} */
    failures: [],
    configurationSets: new Set(['magicmail-events']),
    messageCounter: 0,
  };
}

/** @param {object} state @param {string} pathPrefix @returns {object|null} */
function takeFailure(state, path) {
  const index = state.failures.findIndex((f) => !f.path || path.startsWith(f.path));
  return index === -1 ? null : state.failures.splice(index, 1)[0];
}

/**
 * Sends an AWS-style JSON error.
 *
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} type
 * @param {string} message
 * @param {boolean} [viaHeader=true] - x-amzn-ErrorType header, else body `__type`
 */
function awsError(res, status, type, message, viaHeader = true) {
  const headers = { 'content-type': 'application/json' };
  if (viaHeader)
    headers['x-amzn-errortype'] =
      `${type}:http://internal.amazon.com/coral/com.amazon.coral.service/`;
  res.writeHead(status, headers);
  res.end(JSON.stringify(viaHeader ? { message } : { __type: type, message }));
}

/**
 * Verifies the SigV4 signature of a received request.
 *
 * @param {object} state
 * @param {{method: string, path: string, query: string, headers: object, body: string, host: string}} req
 * @returns {{ok: true}|{ok: false, type: string, message: string}}
 */
function verifySignature(state, req) {
  const auth = req.headers.authorization || '';
  const match =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([a-z0-9-]+)\/([a-z0-9]+)\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(
      auth
    );
  if (!match) return { ok: false, type: 'IncompleteSignature', message: 'bad auth header' };
  const [, keyId, day, region, service, signedHeaders, signature] = match;
  const key = state.keys.get(keyId);
  if (!key) {
    return {
      ok: false,
      type: 'UnrecognizedClientException',
      message: 'The security token included in the request is invalid.',
    };
  }
  const hostRegion = SES_HOST.exec(req.host)?.[1];
  if (region !== hostRegion || service !== 'ses') {
    return {
      ok: false,
      type: 'InvalidSignatureException',
      message: 'Credential should be scoped to a valid region.',
    };
  }
  const signed = signedHeaders.split(';');
  const required = ['host', 'x-amz-date', ...(req.body ? ['content-type'] : [])];
  if (key.token) required.push('x-amz-security-token');
  for (const name of required) {
    if (!signed.includes(name)) {
      return { ok: false, type: 'IncompleteSignature', message: `${name} not signed` };
    }
  }
  const amzDate = req.headers['x-amz-date'] || '';
  const when = Date.parse(
    amzDate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')
  );
  if (
    !Number.isFinite(when) ||
    Math.abs(Date.now() - when) > 5 * 60_000 ||
    amzDate.slice(0, 8) !== day
  ) {
    return {
      ok: false,
      type: 'InvalidSignatureException',
      message: 'Signature expired: is now earlier than',
    };
  }
  if (key.token && req.headers['x-amz-security-token'] !== key.token) {
    return { ok: false, type: 'UnrecognizedClientException', message: 'token mismatch' };
  }
  const headers = signed
    .filter((name) => name !== 'x-amz-date' && name !== 'x-amz-security-token')
    .map((name) => [name, name === 'host' ? req.host : req.headers[name]]);
  const recomputed = signRequest(
    { method: req.method, path: req.path, query: req.query, headers, body: req.body },
    {
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: key.secret,
        ...(key.token ? { sessionToken: key.token } : {}),
      },
      region,
      service,
      date: new Date(when),
    }
  );
  if (recomputed.signature !== signature) {
    return {
      ok: false,
      type: 'InvalidSignatureException',
      message: 'The request signature we calculated does not match the signature you provided.',
    };
  }
  return { ok: true };
}

/** @param {string} name @returns {object|null} */
const templateOf = (state, name) => state.templates.get(name) || null;

/**
 * Starts the fake server.
 *
 * @param {object} state
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
async function startFakeSes(state) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const body = Buffer.concat(chunks).toString('utf8');
      const host = req.headers['x-original-host'];
      const record = {
        host,
        method: req.method,
        path: url.pathname,
        query: url.searchParams,
        rawQuery: url.search.slice(1),
        headers: { ...req.headers },
        json: body ? JSON.parse(body) : undefined,
        bodyBytes: Buffer.byteLength(body),
        contractErrors: [],
      };
      state.requests.push(record);

      const signature = verifySignature(state, {
        method: req.method,
        path: url.pathname,
        query: record.rawQuery,
        headers: req.headers,
        body,
        host,
      });
      record.signatureOk = signature.ok;
      if (!signature.ok) return awsError(res, 403, signature.type, signature.message);

      const failure = takeFailure(state, url.pathname);
      if (failure) {
        return awsError(
          res,
          failure.status,
          failure.type,
          failure.message || 'forced',
          failure.viaHeader !== false
        );
      }

      const json = (status, value) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };

      if (req.method === 'POST' && url.pathname === '/v2/email/outbound-emails') {
        record.contractErrors = smithy.validateHttpRequest(MODEL, 'SendEmail', {
          method: req.method,
          path: url.pathname,
          query: url.searchParams,
          json: record.json,
        });
        if (record.contractErrors.length > 0) {
          return awsError(res, 400, 'BadRequestException', 'invalid request');
        }
        const template = record.json.Content.Template;
        if (template && !templateOf(state, template.TemplateName)) {
          return awsError(res, 404, 'NotFoundException', 'Template does not exist');
        }
        const set = record.json.ConfigurationSetName;
        if (set && !state.configurationSets.has(set)) {
          return awsError(res, 404, 'NotFoundException', 'Configuration set does not exist');
        }
        state.messageCounter += 1;
        return json(200, {
          MessageId: `0100019a${String(state.messageCounter).padStart(8, '0')}-fake-000000`,
        });
      }
      if (req.method === 'GET' && url.pathname === '/v2/email/account') {
        record.contractErrors = smithy.validateHttpRequest(MODEL, 'GetAccount', {
          method: req.method,
          path: url.pathname,
          query: url.searchParams,
        });
        return json(200, state.account);
      }
      if (req.method === 'GET' && url.pathname === '/v2/email/templates') {
        record.contractErrors = smithy.validateHttpRequest(MODEL, 'ListEmailTemplates', {
          method: req.method,
          path: url.pathname,
          query: url.searchParams,
        });
        const names = [...state.templates.keys()].sort();
        const size = Number(url.searchParams.get('PageSize') || 10);
        const start = Number(
          Buffer.from(url.searchParams.get('NextToken') || 'MA==', 'base64').toString('utf8')
        );
        const page = names.slice(start, start + size);
        const next =
          start + size < names.length
            ? Buffer.from(String(start + size)).toString('base64')
            : undefined;
        return json(200, {
          TemplatesMetadata: page.map((name) => ({
            TemplateName: name,
            CreatedTimestamp: state.templates.get(name).CreatedTimestamp,
          })),
          ...(next ? { NextToken: next } : {}),
        });
      }
      const detail = /^\/v2\/email\/templates\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && detail) {
        record.contractErrors = smithy.validateHttpRequest(MODEL, 'GetEmailTemplate', {
          method: req.method,
          path: url.pathname,
          query: url.searchParams,
        });
        const name = decodeURIComponent(detail[1]);
        const template = templateOf(state, name);
        if (!template) return awsError(res, 404, 'NotFoundException', 'Template does not exist');
        return json(200, {
          TemplateName: name,
          TemplateContent: { Subject: template.Subject, Html: template.Html, Text: template.Text },
        });
      }
      return awsError(res, 404, 'UnknownOperationException', 'unknown');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Redirects fetch for SES hosts to the fake server and answers SNS hosts
 * with `snsRoutes[url]` (a function returning a Response). Every other host
 * is refused, so nothing leaves the machine.
 *
 * @param {number} port
 * @param {{snsRoutes?: Map<string, Function>, snsCalls?: string[]}} [options]
 * @returns {() => void} restore
 */
function redirectAwsFetch(port, { snsRoutes = new Map(), snsCalls = [] } = {}) {
  const original = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (SES_HOST.test(url.hostname) && url.protocol === 'https:') {
      const headers = new Headers(init.headers || {});
      headers.set('x-original-host', url.hostname);
      return original(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
        ...init,
        headers,
      });
    }
    if (SNS_HOST.test(url.hostname)) {
      snsCalls.push(url.href);
      const route = snsRoutes.get(url.href);
      if (route) return route(url, init);
      return new Response('not found', { status: 404 });
    }
    throw new TypeError(`blocked host ${url.hostname}`);
  };
  return () => {
    global.fetch = original;
  };
}

/**
 * Signs a synthetic SNS message like SNS does.
 *
 * @param {object} message - SNS fields (Type, MessageId, ...)
 * @param {crypto.KeyObject} privateKey
 * @param {'1'|'2'} [version='2']
 * @returns {object} The message with SignatureVersion and Signature set
 */
function signSnsMessage(message, privateKey, version = '2') {
  const out = { ...message, SignatureVersion: version };
  out.Signature = crypto
    .sign(
      version === '1' ? 'sha1' : 'sha256',
      Buffer.from(snsStringToSign(out), 'utf8'),
      privateKey
    )
    .toString('base64');
  return out;
}

module.exports = {
  FAKE_CREDENTIALS,
  createSesState,
  redirectAwsFetch,
  signSnsMessage,
  startFakeSes,
};
