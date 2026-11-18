'use strict';

/**
 * Read-only follow-up check for a SendGrid 401/403 in the account
 * connection test.
 *
 * SendGrid answers POST /v3/mail/send with 401 both for a wrong key and for
 * a valid key that lacks the `mail.send` scope (observed against the real
 * API on 2026-11-18 with a restricted key holding only `templates.read`).
 * GET /v3/scopes "returns all the scopes assigned to the key you use to
 * authenticate with it" (twilio/sendgrid-oai tsg_scopes_v3.json, ListScope;
 * checked 2026-11-18); it answered 200 for restricted keys with only
 * `mail.send` and only `templates.read`. So:
 * - 200 with a `scopes` array: the key is valid; `mail.send` present or not;
 * - 401/403: the key itself is rejected;
 * - anything else (network, 5xx, unexpected body): unknown, no guess.
 *
 * The response body is only parsed for the `scopes` array and never logged
 * or returned. Only the two fixed SendGrid hosts are used.
 */

const { resolveSendGridRegion, sendGridApiBaseUrl } = require('./sendgrid-region');

const TIMEOUT_MS = 10_000;
/** Upper bound for the scopes response (a full-access key lists about 200 short scopes). */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Reads at most `limit` bytes of a response body.
 *
 * @param {Response} response
 * @param {number} limit
 * @returns {Promise<string|null>} the text, or null when the body is larger
 */
async function readBounded(response, limit) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Classifies a SendGrid API key with one GET /v3/scopes.
 *
 * @param {{apiKey?: unknown, region?: unknown}} config - decrypted account config
 * @returns {Promise<'missing-mail-send'|'has-mail-send'|'invalid'|'unknown'>}
 *   never throws
 */
async function checkSendGridKeyScopes(config) {
  const apiKey = typeof config?.apiKey === 'string' ? config.apiKey : '';
  const region = resolveSendGridRegion(config?.region);
  if (!apiKey || !region) return 'unknown';
  let response;
  try {
    response = await fetch(`${sendGridApiBaseUrl(region)}/v3/scopes`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return 'unknown';
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel?.().catch?.(() => {});
    return 'invalid';
  }
  if (response.status !== 200) {
    await response.body?.cancel?.().catch?.(() => {});
    return 'unknown';
  }
  let scopes;
  try {
    const text = await readBounded(response, MAX_BODY_BYTES);
    if (text === null) return 'unknown';
    scopes = JSON.parse(text)?.scopes;
  } catch {
    return 'unknown';
  }
  if (!Array.isArray(scopes)) return 'unknown';
  return scopes.includes('mail.send') ? 'has-mail-send' : 'missing-mail-send';
}

module.exports = { checkSendGridKeyScopes };
