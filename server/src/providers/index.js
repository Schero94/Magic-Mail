'use strict';

/**
 * Registry of the API provider adapters added after SendGrid and Mailgun
 * (Brevo, Amazon SES). SendGrid, Mailgun, SMTP and the OAuth providers keep
 * their own code paths in services/email-router.js; this registry only
 * covers adapters that implement the interface below, so the existing send
 * paths and their golden payloads are untouched.
 *
 * Adapter interface (every member is required unless marked optional):
 *
 * - `id`: account `provider` value ('brevo' | 'ses').
 * - `label`: product name used in errors ("<label> API request failed: <status>").
 * - `SECRET_FIELDS`: config keys that are secrets (masked in every response,
 *   encrypted with the rest of the config, kept on update only while the
 *   identity is unchanged).
 * - `IDENTITY_FIELDS`: config keys whose change requires the secrets again.
 * - `normalizeConfig(config, { creating })`: validated, normalised copy of an
 *   incoming config. Throws `errors.ValidationError` with
 *   `details.config: string[]` (never echoing values).
 * - `prepareConfigForCreate(config)` (optional): fills server-generated
 *   values on create (for example a random webhook token).
 * - `send({ account, config, emailData, h })`: one provider request.
 *   `h` is the helper object from email-router (`providerSendHelpers`).
 *   Returns `{ messageId: string|null, response: string }`. Errors follow
 *   the SendGrid/Mailgun conventions (`h.providerHttpError`,
 *   `h.accountConfigError`, `h.tooLargeError`, ...), so failover, the queue
 *   and the client error mapping work unchanged.
 * - `templates` (optional): `{ list(config) => Promise<{templates: RemoteTemplate[], warning: string|null}> }`
 *   (see utils/provider-api.js for RemoteTemplate). Present when the
 *   provider hosts templates.
 * - `checkConnection(config)`: read-only credential check. Resolves
 *   `{ ok: true, details: object }` (no personal data) or throws a
 *   `ProviderApiError` (utils/provider-api.js) with a stable `code`.
 * - `webhook({ config, rawBody, headers, now })`: verifies and parses one
 *   delivery webhook request. Resolves
 *   `{ status: 200|400|401, events: DeliveryEvent[], replayKey?: string }`
 *   (see services/delivery-webhooks.js for DeliveryEvent; adapters may also
 *   emit the kinds 'opened' and 'clicked').
 * - `HINTS`: `{ CODE: 'English hint' }` for client-errors; `hintFor(status)`
 *   returns one of its codes or null.
 */

const brevo = require('./brevo');
const ses = require('./ses');

const ADAPTERS = Object.freeze({ brevo, ses });

/**
 * @param {unknown} provider
 * @returns {object|null} The adapter for an account provider, or null for
 *   SendGrid, Mailgun, SMTP and the OAuth providers.
 */
function getAdapter(provider) {
  return typeof provider === 'string' && Object.hasOwn(ADAPTERS, provider)
    ? ADAPTERS[provider]
    : null;
}

/** Providers whose templates Magic Mail can sync. */
const TEMPLATE_PROVIDERS = Object.freeze([
  'sendgrid',
  'mailgun',
  ...Object.keys(ADAPTERS).filter((id) => ADAPTERS[id].templates),
]);

/** Providers with a signed delivery webhook route. */
const WEBHOOK_PROVIDERS = Object.freeze(['sendgrid', 'mailgun', ...Object.keys(ADAPTERS)]);

module.exports = { ADAPTERS, getAdapter, TEMPLATE_PROVIDERS, WEBHOOK_PROVIDERS };
