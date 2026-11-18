'use strict';

/**
 * Read-only clients for the provider template APIs (SendGrid dynamic
 * templates, Mailgun domain and account templates). The SendGrid region
 * table lives in ./sendgrid-region (shared with the send path) and is
 * re-exported here.
 *
 * Only fixed provider hosts are called, so a stored setting can never send an
 * API key to another server. Every request has a timeout and a response size
 * cap; provider bodies are never returned to callers or logged, only a short
 * error code.
 *
 * Docs (checked 2026-11-17):
 * - SendGrid: GET /v3/templates (generations, page_size 1..200, page_token from
 *   _metadata.next), GET /v3/templates/{id}; base URLs https://api.sendgrid.com
 *   (global) and https://api.eu.sendgrid.com (EU regional subusers).
 *   https://www.twilio.com/docs/sendgrid/api-reference/transactional-templates/retrieve-paged-transactional-templates
 *   https://www.twilio.com/docs/sendgrid/api-reference/transactional-templates/retrieve-a-single-transactional-template
 * - Mailgun: GET /v3/{domain}/templates and GET /v4/templates (limit max 100,
 *   page=next with pivot p from paging.next), GET .../templates/{name}?active=yes;
 *   base URLs https://api.mailgun.net and https://api.eu.mailgun.net.
 *   https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/templates
 */

const { mailgunApiBaseUrl } = require('./mailgun-region');
const {
  SENDGRID_REGIONS,
  resolveSendGridRegion,
  sendGridApiBaseUrl,
} = require('./sendgrid-region');

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_LIST_PAGES = 10;
const SENDGRID_PAGE_SIZE = 200;
const MAILGUN_PAGE_LIMIT = 100;

/** Error raised by the template API clients. `code` is safe to show and log. */
class ProviderApiError extends Error {
  /**
   * @param {'AUTH'|'NOT_FOUND'|'RATE_LIMITED'|'UNAVAILABLE'|'NETWORK'|'BAD_RESPONSE'} code
   * @param {number} [status]
   */
  constructor(code, status) {
    super(`Provider template request failed (${code}${status ? ` ${status}` : ''})`);
    this.name = 'ProviderApiError';
    this.code = code;
    if (status) this.status = status;
  }
}

/**
 * Maps an HTTP status to a ProviderApiError code.
 *
 * @param {number} status
 * @returns {string}
 */
const codeForStatus = (status) => {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UNAVAILABLE';
  return 'BAD_RESPONSE';
};

/**
 * Reads a response body up to `maxBytes`.
 *
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<string>}
 * @throws {ProviderApiError} BAD_RESPONSE when the body is larger
 */
async function readBounded(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new ProviderApiError('BAD_RESPONSE');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ProviderApiError('BAD_RESPONSE');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * GETs a JSON document from a provider API.
 *
 * @param {string} url - Absolute URL on a fixed provider host
 * @param {Record<string, string>} headers - Authorization header
 * @returns {Promise<any>} Parsed JSON
 * @throws {ProviderApiError}
 */
async function getJson(url, headers) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderApiError('NETWORK');
  }
  if (!response.ok) {
    await response.body?.cancel?.().catch?.(() => {});
    throw new ProviderApiError(codeForStatus(response.status), response.status);
  }
  const text = await readBounded(response, MAX_RESPONSE_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderApiError('BAD_RESPONSE');
  }
}

/** Normalised remote template, independent of the provider. */
/**
 * @typedef {object} RemoteTemplate
 * @property {string} remoteId - SendGrid template id (d-...) or Mailgun template id
 * @property {string} name - Template name at the provider
 * @property {'default'|'domain'|'account'} scope - Mailgun scope; 'default' for SendGrid
 * @property {string|null} activeVersion - Active version id/tag, null when none is active
 * @property {string} subject - Subject of the active version ('' when none)
 * @property {string} html - HTML of the active version ('' when none)
 * @property {string} text - Plain text of the active version ('' when none)
 * @property {string|null} updatedAt - ISO time of the last change at the provider
 */

/**
 * Parses SendGrid's "YYYY-MM-DD HH:MM:SS" (UTC) or an ISO date.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
const toIso = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim())
    ? `${value.trim().replace(' ', 'T')}Z`
    : value.trim();
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const asString = (value, max = 1_000_000) => (typeof value === 'string' ? value.slice(0, max) : '');

/**
 * Returns the `page_token` (SendGrid) or `p` (Mailgun) parameter of a
 * provider "next page" URL. The URL itself is never requested.
 *
 * @param {unknown} nextUrl
 * @param {string} param
 * @returns {string|null}
 */
const pageParam = (nextUrl, param) => {
  if (typeof nextUrl !== 'string' || !nextUrl) return null;
  try {
    const value = new URL(nextUrl, 'https://placeholder.invalid').searchParams.get(param);
    return value && value.length <= 512 ? value : null;
  } catch {
    return null;
  }
};

/**
 * Runs `task` for every item with at most `limit` in flight.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} task
 * @returns {Promise<R[]>}
 */
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Lists the dynamic templates of a SendGrid account with the content of
 * their active version.
 *
 * @param {{apiKey: string, region?: string}} config - Decrypted account config
 * @param {{pageSize?: number}} [options] - pageSize 1..200 (default 200; tests force paging)
 * @returns {Promise<RemoteTemplate[]>}
 * @throws {ProviderApiError} For an unusable region, auth, rate limit or provider failure
 */
async function listSendGridTemplates(config, { pageSize = SENDGRID_PAGE_SIZE } = {}) {
  const region = resolveSendGridRegion(config.region);
  if (!region) throw new ProviderApiError('BAD_RESPONSE');
  const base = sendGridApiBaseUrl(region);
  const headers = { Authorization: `Bearer ${config.apiKey}` };

  const summaries = [];
  let pageToken = null;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const url = new URL('/v3/templates', base);
    url.searchParams.set('generations', 'dynamic');
    url.searchParams.set(
      'page_size',
      String(Math.min(SENDGRID_PAGE_SIZE, Math.max(1, Math.trunc(pageSize) || SENDGRID_PAGE_SIZE)))
    );
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const body = await getJson(url.toString(), headers);
    const result = Array.isArray(body?.result) ? body.result : [];
    summaries.push(...result.filter((item) => item && typeof item.id === 'string'));
    const next = pageParam(body?._metadata?.next, 'page_token');
    if (!next || next === pageToken || result.length === 0) break;
    pageToken = next;
  }

  return mapLimit(summaries, 4, async (summary) => {
    const detail = await getJson(
      new URL(`/v3/templates/${encodeURIComponent(summary.id)}`, base).toString(),
      headers
    );
    const versions = Array.isArray(detail?.versions) ? detail.versions : [];
    const active = versions.find((version) => version && Number(version.active) === 1) || null;
    return {
      remoteId: summary.id,
      name: asString(detail?.name ?? summary.name, 200),
      scope: 'default',
      activeVersion: active ? asString(active.id, 64) || null : null,
      subject: active ? asString(active.subject, 998) : '',
      html: active ? asString(active.html_content) : '',
      text: active ? asString(active.plain_content) : '',
      updatedAt: toIso(active?.updated_at) || toIso(detail?.updated_at ?? summary.updated_at),
    };
  });
}

/**
 * Lists the templates of one Mailgun scope (domain or account).
 *
 * @param {string} base - Region base URL
 * @param {string} listPath - '/v3/{domain}/templates' or '/v4/templates'
 * @param {Record<string,string>} headers
 * @returns {Promise<object[]>} Raw list items
 */
async function listMailgunScope(base, listPath, headers, limit = MAILGUN_PAGE_LIMIT) {
  const items = [];
  let pivot = null;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const url = new URL(listPath, base);
    url.searchParams.set('limit', String(limit));
    if (pivot) {
      url.searchParams.set('page', 'next');
      url.searchParams.set('p', pivot);
    }
    const body = await getJson(url.toString(), headers);
    const pageItems = Array.isArray(body?.items) ? body.items : [];
    items.push(...pageItems.filter((item) => item && typeof item.name === 'string'));
    const next = pageParam(body?.paging?.next, 'p');
    if (pageItems.length === 0 || !next || next === pivot) break;
    pivot = next;
  }
  return items;
}

/**
 * Lists the Mailgun templates of an account's sending domain, plus the
 * account-level templates when the key may read them. A domain-level template
 * wins over an account-level template with the same name.
 *
 * @param {{apiKey: string, domain: string, region?: string}} config
 * @param {'us'|'eu'} region - Resolved Mailgun region
 * @param {{pageSize?: number}} [options] - pageSize 1..100 (default 100; tests force paging)
 * @returns {Promise<{templates: RemoteTemplate[], accountScopeError: string|null}>}
 * @throws {ProviderApiError} When the domain templates can not be read
 */
async function listMailgunTemplates(config, region, { pageSize = MAILGUN_PAGE_LIMIT } = {}) {
  const limit = Math.min(
    MAILGUN_PAGE_LIMIT,
    Math.max(1, Math.trunc(pageSize) || MAILGUN_PAGE_LIMIT)
  );
  const base = mailgunApiBaseUrl(region);
  const domain = String(config.domain).trim().toLowerCase();
  const headers = {
    Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`,
  };
  const domainPath = `/v3/${encodeURIComponent(domain)}/templates`;

  const domainItems = await listMailgunScope(base, domainPath, headers, limit);
  let accountItems = [];
  let accountScopeError = null;
  try {
    accountItems = await listMailgunScope(base, '/v4/templates', headers, limit);
  } catch (error) {
    // Domain sending keys can not read account templates; that is not an error
    // for the domain templates.
    accountScopeError = error?.code || 'UNAVAILABLE';
  }

  const seen = new Set(domainItems.map((item) => item.name));
  const scoped = [
    ...domainItems.map((item) => ({ item, scope: 'domain', path: domainPath })),
    ...accountItems
      .filter((item) => !seen.has(item.name))
      .map((item) => ({ item, scope: 'account', path: '/v4/templates' })),
  ];

  const templates = await mapLimit(scoped, 4, async ({ item, scope, path }) => {
    const url = new URL(`${path}/${encodeURIComponent(item.name)}`, base);
    url.searchParams.set('active', 'yes');
    const body = await getJson(url.toString(), headers);
    const template = body?.template || {};
    const version =
      template.version && typeof template.version === 'object' ? template.version : null;
    const versionHeaders =
      version?.headers && typeof version.headers === 'object' ? version.headers : {};
    const subjectKey = Object.keys(versionHeaders).find((key) => key.toLowerCase() === 'subject');
    return {
      remoteId: asString(template.id ?? item.id, 128) || item.name,
      name: asString(template.name ?? item.name, 200),
      scope,
      activeVersion: version ? asString(version.tag || version.id, 128) || null : null,
      subject: subjectKey ? asString(versionHeaders[subjectKey], 998) : '',
      html: version ? asString(version.template) : '',
      text: '',
      updatedAt: toIso(version?.createdAt) || toIso(template.createdAt ?? item.createdAt),
    };
  });
  return { templates, accountScopeError };
}

module.exports = {
  MAX_RESPONSE_BYTES,
  ProviderApiError,
  SENDGRID_REGIONS,
  codeForStatus,
  listMailgunTemplates,
  listSendGridTemplates,
  pageParam,
  resolveSendGridRegion,
  sendGridApiBaseUrl,
  toIso,
};
