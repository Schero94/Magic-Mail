'use strict';

// Shared credential loading and provider selection for the opt-in live suites
// in tests/live/. Values are only kept in memory and never printed: every
// message built here names variables, never their values.
//
// LIVE_PROVIDERS picks the providers a run covers: `sendgrid`, `mailgun` or
// `sendgrid,mailgun`. It is read from the process environment first, then
// from the credentials file. Without it, every provider whose required
// variables are complete is selected; when none is complete, all providers
// are selected so the missing variables are reported.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_FILE = path.join(os.homedir(), '.config', 'magic-mail-live', '.env');
const PROVIDERS = ['sendgrid', 'mailgun'];
const ALLOWED_HOSTS = new Set([
  'api.sendgrid.com',
  'api.eu.sendgrid.com',
  'api.mailgun.net',
  'api.eu.mailgun.net',
]);

/**
 * Reads KEY=value lines (no expansion, no export, quotes stripped).
 *
 * @returns {Record<string, string>|null} null when the file does not exist
 */
function readLiveEnv() {
  if (!fs.existsSync(ENV_FILE)) return null;
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * Loads the live credentials and resolves which providers this run covers.
 *
 * @param {Record<string, string[]>} requiredByProvider - required variable
 *   names per provider (`sendgrid`, `mailgun`)
 * @returns {{
 *   env: Record<string, string>|null,
 *   selected: string[],
 *   selectionError: string|null,
 *   missing: Record<string, string[]>,
 *   skipReason: (provider: string) => string|null,
 * }} `missing` lists absent variable names per selected provider;
 *   `skipReason` is null when the provider's tests can run
 */
function loadLiveConfig(requiredByProvider) {
  const env = readLiveEnv();
  const missingFor = (provider) =>
    env ? requiredByProvider[provider].filter((key) => !env[key]) : requiredByProvider[provider];

  const raw = process.env.LIVE_PROVIDERS ?? (env ? env.LIVE_PROVIDERS : undefined);
  let selected;
  let selectionError = null;
  if (raw !== undefined && raw.trim() !== '') {
    const names = raw
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    const unknown = names.filter((name) => !PROVIDERS.includes(name));
    if (unknown.length > 0) {
      selectionError = `LIVE_PROVIDERS has unknown provider(s) ${unknown.join(', ')}; use sendgrid, mailgun or sendgrid,mailgun`;
    }
    selected = PROVIDERS.filter((provider) => names.includes(provider));
  } else {
    const complete = PROVIDERS.filter((provider) => missingFor(provider).length === 0);
    selected = complete.length > 0 ? complete : [...PROVIDERS];
  }

  const missing = Object.fromEntries(selected.map((provider) => [provider, missingFor(provider)]));

  /**
   * @param {string} provider
   * @returns {string|null} why this provider's tests are skipped, or null
   */
  const skipReason = (provider) => {
    if (selectionError) return selectionError;
    if (!selected.includes(provider)) {
      return `${provider} not selected (LIVE_PROVIDERS=${selected.join(',') || 'none'})`;
    }
    if (!env) return `${ENV_FILE} does not exist`;
    if (missing[provider].length > 0) {
      return `${provider}: missing ${missing[provider].join(', ')} in ${ENV_FILE}`;
    }
    return null;
  };

  return { env, selected, selectionError, missing, skipReason };
}

/**
 * Request path for the log: Mailgun domains and long ids masked.
 *
 * @param {string} pathname
 * @returns {string}
 */
const loggedPath = (pathname) =>
  pathname
    .replace(/^\/v3\/[^/]+\/(messages|templates)/, '/v3/<domain>/$1')
    .replace(/[^/]{20,}/g, '<id>');

/**
 * Replaces global fetch for a live suite:
 * - only the four provider hosts may be reached;
 * - every SendGrid POST /v3/mail/send gets mail_settings.sandbox_mode.enable =
 *   true (validated, answered 200, never delivered);
 * - every Mailgun .../messages request gets o:testmode=yes (accepted, never
 *   delivered; Mailgun bills test-mode messages).
 * The plugin code under test is unchanged; the switches are added here, so
 * every path that sends (including the account connection test) is covered.
 *
 * @returns {{
 *   sent: {sendgrid: object[], mailgun: [string, string][][]},
 *   results: {host: string, method: string, path: string, status: number}[],
 *   restore: () => void,
 * }} `sent` holds the request bodies as sent (Mailgun files as '<file>');
 *   `results` is a request log without secrets or addresses
 */
function installLiveFetch() {
  const sent = { sendgrid: [], mailgun: [] };
  const results = [];
  const original = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!ALLOWED_HOSTS.has(url.hostname)) throw new TypeError('live suite: host not allowed');
    let body = init.body;
    if (url.pathname === '/v3/mail/send') {
      if (typeof body !== 'string') throw new TypeError('live suite: unexpected mail/send body');
      const json = JSON.parse(body);
      json.mail_settings = { ...(json.mail_settings || {}), sandbox_mode: { enable: true } };
      body = JSON.stringify(json);
      sent.sendgrid.push(json);
    }
    if (/\/messages$/.test(url.pathname)) {
      if (!(body instanceof FormData)) throw new TypeError('live suite: unexpected messages body');
      body.set('o:testmode', 'yes');
      sent.mailgun.push(
        [...body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '<file>'])
      );
    }
    const response = await original(input, { ...init, body });
    results.push({
      host: url.hostname,
      method: String(init.method || 'GET').toUpperCase(),
      path: loggedPath(url.pathname),
      status: response.status,
    });
    return response;
  };
  return {
    sent,
    results,
    restore: () => {
      global.fetch = original;
    },
  };
}

module.exports = {
  ENV_FILE,
  PROVIDERS,
  ALLOWED_HOSTS,
  readLiveEnv,
  loadLiveConfig,
  installLiveFetch,
};
