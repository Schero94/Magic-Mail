'use strict';

/**
 * Brevo adapter (transactional email API v3). See ./index.js for the
 * interface.
 *
 * Docs (checked 2026-11-18, the `.md` variants of every page):
 * - Send: POST https://api.brevo.com/v3/smtp/email, `api-key` header
 *   https://developers.brevo.com/reference/send-transac-email
 *   https://developers.brevo.com/docs/send-a-transactional-email
 * - Templates: GET /v3/smtp/templates (limit 0..1000, offset, sort asc|desc,
 *   templateStatus) and GET /v3/smtp/templates/{templateId}
 *   https://developers.brevo.com/reference/get-smtp-templates
 *   https://developers.brevo.com/reference/get-smtp-template
 * - Account: GET /v3/account
 *   https://developers.brevo.com/reference/get-account
 * - Webhooks: https://developers.brevo.com/docs/transactional-webhooks,
 *   https://developers.brevo.com/docs/secured-webhooks,
 *   https://developers.brevo.com/docs/batch-webhooks,
 *   https://developers.brevo.com/reference/create-webhook
 * - Rate limits: https://developers.brevo.com/docs/api-limits,
 *   https://developers.brevo.com/docs/limit-headers
 * - Authorised IPs: https://developers.brevo.com/docs/ip-security
 * - Sandbox: https://developers.brevo.com/docs/using-sandbox-mode
 * - OpenAPI: https://developers.brevo.com/openapi/email-api.json and
 *   .../openapi/accounts-and-settings.json (pinned in tests/fixtures/openapi)
 *
 * Host: Brevo documents one API host, https://api.brevo.com (both OpenAPI
 * documents list only `https://api.brevo.com/v3`); there is no regional or
 * EU host, so the account has no region setting. The host is fixed, so a
 * stored setting can never send the API key to another server.
 *
 * Config: `apiKey` (secret, `api-key` header) and `webhookToken` (secret,
 * generated on create). Both are encrypted with the rest of the config.
 */

const crypto = require('node:crypto');
const { errors } = require('@strapi/utils');
const {
  MAX_RESPONSE_BYTES,
  ProviderApiError,
  codeForStatus,
  readBounded,
  toIso,
} = require('../utils/provider-api');
const { normalizeMessageId } = require('../utils/message-id');

const API_BASE = 'https://api.brevo.com';
const SEND_PATH = '/v3/smtp/email';
const TEMPLATES_PATH = '/v3/smtp/templates';
const ACCOUNT_PATH = '/v3/account';

/** account-manager SECRET_MASK: the "keep the stored secret" placeholder on update. */
const SECRET_MASK = '********';

const REQUEST_TIMEOUT_MS = 15_000;
const ERROR_BODY_MAX_BYTES = 4 * 1024;
const SEND_RESPONSE_MAX_BYTES = 64 * 1024;
const MAX_RATE_LIMIT_RESET_MS = 24 * 60 * 60 * 1000;

/**
 * Brevo's total size limit for a transactional email, content and
 * attachments included (Brevo help center "Add an attachment to a
 * transactional email": 20 MB). Compared with the JSON request body, in which
 * attachments are base64, so the check is on the safe side.
 */
const BREVO_MAX_MESSAGE_BYTES = 20 * 1024 * 1024;

/** Display names: "Maximum length is 70 characters" (sender, to, cc, bcc, replyTo). */
const MAX_NAME_LENGTH = 70;

/**
 * Attachment file extensions Brevo accepts ("Supported file extensions" of
 * the `attachment` field, send-transac-email reference).
 */
const ATTACHMENT_EXTENSIONS = new Set(
  (
    'xlsx xls ods docx docm doc csv pdf txt gif jpg jpeg png tif tiff rtf bmp cgm css shtml ' +
    'html htm zip xml ppt pptx tar ez ics mobi msg pub eps odt mp3 m4a m4v wma ogg flac wav ' +
    'aif aifc aiff mp4 mov avi mkv mpeg mpg wmv pkpass xlsm'
  ).split(' ')
);

/**
 * Caller headers Brevo interprets itself. `X-Mailin-custom` carries Magic
 * Mail's correlation id, `X-Sib-Sandbox: drop` discards the message (sandbox
 * mode); a caller must not be able to set either.
 */
const RESERVED_HEADER_PREFIXES = ['x-mailin-', 'x-sib-'];

/** Correlation value in `X-Mailin-custom` (echoed in every webhook event). */
const CORRELATION_PREFIX = 'magicmail_id=';
const CORRELATION_PATTERN = /^magicmail_id=([A-Za-z0-9]{1,64})$/;

const LIST_PAGE_SIZE = 50;
const MAX_LIST_PAGES = 10;

const API_KEY_PATTERN = /^[\x21-\x7e]{16,512}$/;
const WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const BEARER_PATTERN = /^bearer[ \t]+([\x21-\x7e]{1,512})$/i;
/** Custom header for Brevo's webhook `headers` option (alternative to bearer auth). */
const WEBHOOK_TOKEN_HEADER = 'x-magic-mail-webhook-token';

/** Upper bound of events taken from one webhook request (a batch holds up to 500). */
const MAX_WEBHOOK_EVENTS = 1000;
const MIN_EVENT_TIME_MS = Date.UTC(2000, 0, 1);
const MAX_EVENT_SKEW_MS = 24 * 3600_000;

const PLAN_TYPES = new Set(['payAsYouGo', 'free', 'subscription', 'sms']);

/**
 * Brevo transactional event name -> Magic Mail delivery outcome.
 *
 * Event names as posted (transactional-webhooks page): request, click,
 * deferred, delivered, soft_bounce, hard_bounce, spam, unique_opened, opened,
 * invalid_email, blocked, error, unsubscribed, proxy_open, unique_proxy_open.
 * The camelCase names of the webhook configuration (hardBounce, softBounce,
 * invalid) are accepted as aliases.
 *
 * - hard_bounce, invalid_email: permanent; may feed the suppression list.
 * - soft_bounce, deferred: temporary (Brevo retries).
 * - blocked: Brevo did not send (recipient on Brevo's blocklist); no suppression.
 * - error: Brevo could not send; never delivered.
 * - opened -> opened (every open), click -> clicked with `link`.
 * - unique_opened is ignored: Brevo posts it next to `opened` for the first
 *   open, so counting both would count the first open twice.
 * - proxy_open and unique_proxy_open are ignored: opens by a privacy proxy
 *   (for example Apple Mail Privacy Protection), not by the reader.
 * - request (sent) is ignored: Magic Mail records the send itself.
 */
const EVENT_MAP = Object.freeze({
  delivered: { kind: 'delivered' },
  hard_bounce: { kind: 'bounced', suppress: 'bounce' },
  hardBounce: { kind: 'bounced', suppress: 'bounce', code: 'hard_bounce' },
  invalid_email: { kind: 'bounced', suppress: 'bounce', notDelivered: true },
  invalid: { kind: 'bounced', suppress: 'bounce', notDelivered: true, code: 'invalid_email' },
  soft_bounce: { kind: 'deferred' },
  softBounce: { kind: 'deferred', code: 'soft_bounce' },
  deferred: { kind: 'deferred' },
  blocked: { kind: 'blocked', notDelivered: true },
  spam: { kind: 'complained', suppress: 'complaint' },
  unsubscribed: { kind: 'unsubscribed' },
  error: { kind: 'dropped', notDelivered: true },
  opened: { kind: 'opened' },
  click: { kind: 'clicked' },
});

/**
 * Stable hint codes (client-errors / connection check). The texts are
 * English; the admin UI translates by code.
 */
const HINTS = Object.freeze({
  BREVO_INVALID_KEY:
    'Brevo rejected the API key. Create an API key under SMTP & API > API keys (not an SMTP key) and paste it completely.',
  BREVO_IP_NOT_AUTHORIZED:
    'Brevo blocked the request because the server IP address is not authorised. Add the IP address of this Strapi server under Security > Authorised IPs in Brevo, or turn off blocking of unknown IP addresses.',
  BREVO_FORBIDDEN:
    'Brevo refused the request. Check that the API key may send transactional email and that the Brevo account is fully activated.',
  BREVO_ACCOUNT_UNDER_VALIDATION:
    'The Brevo account is still being validated. Sending works once Brevo has activated the account.',
  BREVO_SENDER_NOT_VERIFIED:
    'Brevo rejected the sender. Add and verify the From address under Senders, Domains & Dedicated IPs in Brevo, or authenticate its domain.',
  BREVO_NO_CREDITS:
    'The Brevo account has no email credits left. Check the plan and credits in Brevo.',
  BREVO_TEMPLATE_NOT_FOUND:
    'Brevo does not know this template or it is inactive. Activate it in Brevo and sync the provider templates again.',
  BREVO_TOO_LARGE:
    'Brevo rejected the message as too large. Brevo accepts at most 20 MB including attachments.',
  BREVO_RATE_LIMITED:
    'Brevo is rate limiting requests. Wait a moment and try again; the queue retries automatically.',
  BREVO_UNAVAILABLE: 'Brevo is not reachable right now. Try again later.',
});

/** Brevo error `code` values (send-transac-email 400 enum) with their hint. */
const BODY_CODE_HINTS = Object.freeze({
  not_enough_credits: 'BREVO_NO_CREDITS',
  'Insufficient credits': 'BREVO_NO_CREDITS',
  account_under_validation: 'BREVO_ACCOUNT_UNDER_VALIDATION',
  permission_denied: 'BREVO_FORBIDDEN',
});

/**
 * Message fragments Brevo uses for an unauthorised IP, an unverified sender
 * and an unknown template. Not documented in the API reference; matched
 * only against at most 1000 characters of the body message, never stored or
 * logged. One bounded quantifier per pattern, so matching is linear.
 */
const IP_MESSAGE = /unrecogni[sz]ed ip|authori[sz]ed[ _]ips?\b/i;
const SENDER_MESSAGE = /sender[^.]{0,120}(?:not valid|invalid|not verified)|validate your sender/i;
const TEMPLATE_MESSAGE = /template[^.]{0,60}(?:not found|does not exist|not active|inactive)/i;

/**
 * Throws the config ValidationError (never echoes a value).
 *
 * @param {string} message
 * @param {string[]} details
 * @returns {never}
 * @throws {errors.ValidationError}
 */
function configError(message, details) {
  throw new errors.ValidationError(message, { config: details });
}

/**
 * Validated, normalised copy of a Brevo account config. Only `apiKey` and
 * `webhookToken` are kept (unknown keys are dropped).
 *
 * On create (`creating`), `apiKey` is required. On update, `apiKey` and
 * `webhookToken` may be SECRET_MASK or left out: the stored values are kept
 * (account-manager _mergeConfig). An empty `webhookToken` is treated as left
 * out, so an edit can never clear the token by accident.
 *
 * @param {unknown} config
 * @param {{creating?: boolean}} [options]
 * @returns {{apiKey?: string, webhookToken?: string}}
 * @throws {errors.ValidationError} With `details.config` naming the field
 */
function normalizeConfig(config, { creating = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    configError('Invalid configuration', ['Required']);
  }
  const out = {};
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : config.apiKey;
  if (apiKey === undefined || apiKey === null || apiKey === '' || apiKey === SECRET_MASK) {
    if (creating) configError('The Brevo API key is required', ['apiKey: Required']);
    if (apiKey === SECRET_MASK) out.apiKey = apiKey;
  } else if (typeof apiKey !== 'string' || !API_KEY_PATTERN.test(apiKey)) {
    configError('The Brevo API key has an invalid format', [
      'apiKey: must be the API key from Brevo (SMTP & API > API keys), without spaces',
    ]);
  } else {
    out.apiKey = apiKey;
  }

  const token =
    typeof config.webhookToken === 'string' ? config.webhookToken.trim() : config.webhookToken;
  if (token === undefined || token === null || token === '') {
    // Generated on create (prepareConfigForCreate); kept on update.
  } else if (token === SECRET_MASK) {
    if (!creating) out.webhookToken = token;
  } else if (typeof token !== 'string' || !WEBHOOK_TOKEN_PATTERN.test(token)) {
    configError('The webhook token has an invalid format', [
      'webhookToken: 32 to 256 characters A-Z, a-z, 0-9, "-" or "_"',
    ]);
  } else {
    out.webhookToken = token;
  }
  return out;
}

/**
 * Adds a random webhook token on create when none was given.
 *
 * @param {{apiKey?: string, webhookToken?: string}} config - Normalised config
 * @returns {{apiKey?: string, webhookToken: string}}
 */
function prepareConfigForCreate(config) {
  const out = { ...config };
  if (typeof out.webhookToken !== 'string' || !WEBHOOK_TOKEN_PATTERN.test(out.webhookToken)) {
    out.webhookToken = crypto.randomBytes(32).toString('base64url');
  }
  return out;
}

/** @param {unknown} value @returns {boolean} a usable (non-mask) secret */
const usableSecret = (value) =>
  typeof value === 'string' && value.length > 0 && value !== SECRET_MASK;

/**
 * @param {unknown} name
 * @returns {string} Display name cut to Brevo's 70 characters ('' for none)
 */
const displayName = (name) => (typeof name === 'string' ? name.slice(0, MAX_NAME_LENGTH) : '');

/**
 * @param {{email: string, name?: string}} entry
 * @returns {{email: string, name?: string}}
 */
const recipient = (entry) => {
  const name = displayName(entry.name);
  return name ? { email: entry.email, name } : { email: entry.email };
};

/**
 * Outbound headers without the ones Brevo interprets itself (X-Mailin-*,
 * X-Sib-*), plus the correlation header.
 *
 * @param {Record<string, string>} headers - From h.buildOutboundHeaders
 * @param {string|null} magicmailId
 * @returns {Record<string, string>}
 */
function brevoHeaders(headers, magicmailId) {
  const out = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const lower = name.toLowerCase();
    if (RESERVED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    out[name] = value;
  }
  if (magicmailId) out['X-Mailin-custom'] = `${CORRELATION_PREFIX}${magicmailId}`;
  return out;
}

/**
 * Lower-case file extension of an attachment name, or ''.
 *
 * @param {unknown} name
 * @returns {string}
 */
function extensionOf(name) {
  if (typeof name !== 'string') return '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Builds the JSON body of POST /v3/smtp/email. No network.
 *
 * - Recipients: every address once across to, cc, bcc (h.uniqueRecipients),
 *   display names cut to 70 characters.
 * - Reply-To: Brevo accepts exactly one `replyTo` object. Several reply-to
 *   addresses are refused with a ValidationError rather than silently
 *   dropping all but one.
 * - Attachments: base64 `content` + `name`. Brevo API v3 has no inline (cid)
 *   images ("API V3 doesn't support it directly", Brevo FAQ) and accepts only
 *   the listed file extensions: both are refused with a ValidationError.
 * - Headers: h.buildOutboundHeaders without X-Mailin-* / X-Sib-*, plus
 *   `X-Mailin-custom: magicmail_id=<log documentId>` (Brevo echoes it as
 *   `X-Mailin-custom` in every webhook event).
 * - Tags: 'magic-mail' and the allowlisted email type.
 * - Template: numeric `templateId` and `params` = the template data (Brevo
 *   templates read `{{ params.key }}`). The template's own subject applies
 *   unless the caller set one. Body fields are not sent ("Ignored when
 *   templateId is provided").
 * - Tracking: Brevo's open/click tracking is an account setting; the API has
 *   no per-message switch (only `removeTrackingPixel`, Enterprise plans with
 *   the consent feature), so h.providerTrackingOf can not turn it on or off
 *   per message. Brevo open/click events are counted only for logs sent with
 *   provider tracking (delivery-webhooks recordEngagement).
 *
 * @param {{account: object, emailData: object, template: object|null, h: object}} input
 * @returns {object} Request body
 * @throws {Error} ValidationError for input Brevo can not send
 */
function buildSendRequest({ account, emailData, template, h }) {
  const recipients = h.uniqueRecipients(emailData);
  if (recipients.to.length === 0) {
    throw h.validationError('Brevo send requires at least one valid recipient');
  }
  const sender = h.senderFor(account, emailData);
  const senderName = displayName(sender.name);
  const type = h.EMAIL_TYPES.includes(emailData.type) ? emailData.type : 'transactional';
  const magicmailId = h.magicmailIdOf(emailData);

  const body = {
    sender: { email: sender.address, ...(senderName ? { name: senderName } : {}) },
    to: recipients.to.map(recipient),
    ...(recipients.cc.length > 0 ? { cc: recipients.cc.map(recipient) } : {}),
    ...(recipients.bcc.length > 0 ? { bcc: recipients.bcc.map(recipient) } : {}),
  };

  if (template) {
    if (!/^[1-9]\d{0,15}$/.test(String(template.remoteId))) {
      throw h.accountConfigError('The Brevo template id is not a number; sync the templates again');
    }
    body.templateId = Number(template.remoteId);
    const variables = template.variables;
    body.params =
      variables && typeof variables === 'object' && !Array.isArray(variables) ? variables : {};
    if (emailData.subject) body.subject = h.stripHeaderInjection(emailData.subject);
  } else {
    body.subject = h.stripHeaderInjection(emailData.subject);
    if (emailData.html) body.htmlContent = emailData.html;
    if (emailData.text) body.textContent = emailData.text;
  }

  const replyTo = h.resolveReplyTo(emailData.replyTo || account.replyTo);
  if (replyTo && replyTo.length > 1) {
    throw h.validationError('Brevo accepts one reply-to address only');
  }
  if (replyTo && replyTo.length === 1) {
    const name = displayName(replyTo[0].name);
    body.replyTo = { email: replyTo[0].address, ...(name ? { name } : {}) };
  }

  const attachments = h.normalizeAttachments(emailData.attachments);
  if (attachments.length > 0) {
    body.attachment = attachments.map((attachment) => {
      if (attachment.cid) {
        throw h.validationError(
          'Brevo does not support inline (cid) images; link the image or attach it normally'
        );
      }
      if (!ATTACHMENT_EXTENSIONS.has(extensionOf(attachment.filename))) {
        throw h.validationError('Brevo does not accept this attachment file type');
      }
      return { content: attachment.content.toString('base64'), name: attachment.filename };
    });
  }

  body.headers = brevoHeaders(h.buildOutboundHeaders(emailData), magicmailId);
  body.tags = ['magic-mail', type];
  return body;
}

/**
 * Milliseconds until Brevo's rate limit resets: `x-sib-ratelimit-reset` is
 * the time remaining "in the granularity unit (typically seconds)"
 * (limit-headers page). 0 when missing, not an integer or over 24 h.
 *
 * @param {Response|object} response
 * @returns {number}
 */
function rateLimitResetMs(response) {
  const raw = response?.headers?.get?.('x-sib-ratelimit-reset');
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw.trim())) return 0;
  const ms = Number(raw.trim()) * 1000;
  return ms > 0 && ms <= MAX_RATE_LIMIT_RESET_MS ? ms : 0;
}

/**
 * Hint code for a Brevo error body (`{ code, message }`), or null. The body
 * is only compared, never kept, logged or returned.
 *
 * @param {string|null} text - At most 4 KB of the body
 * @param {number} status
 * @returns {string|null} A HINTS key
 */
function errorBodyHint(text, status) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(0, ERROR_BODY_MAX_BYTES));
  } catch {
    return null;
  }
  const code = typeof parsed?.code === 'string' ? parsed.code.slice(0, 100) : '';
  const message = typeof parsed?.message === 'string' ? parsed.message.slice(0, 1000) : '';
  if ((status === 401 || status === 403) && IP_MESSAGE.test(message)) {
    return 'BREVO_IP_NOT_AUTHORIZED';
  }
  if (Object.hasOwn(BODY_CODE_HINTS, code)) return BODY_CODE_HINTS[code];
  if (status === 400 || status === 403) {
    if (SENDER_MESSAGE.test(message)) return 'BREVO_SENDER_NOT_VERIFIED';
    if (TEMPLATE_MESSAGE.test(message)) return 'BREVO_TEMPLATE_NOT_FOUND';
  }
  return null;
}

/**
 * Hint code for a failure: a specific BREVO_* `code` wins, then the HTTP
 * status or the ProviderApiError code.
 *
 * @param {number|undefined} status
 * @param {string|undefined} [code]
 * @returns {string|null} A HINTS key or null
 */
function hintFor(status, code) {
  if (typeof code === 'string' && Object.hasOwn(HINTS, code)) return code;
  if (status === 401 || (code === 'AUTH' && status !== 403)) return 'BREVO_INVALID_KEY';
  if (status === 403) return 'BREVO_FORBIDDEN';
  if (status === 413 || code === 'MAGIC_MAIL_MESSAGE_TOO_LARGE') return 'BREVO_TOO_LARGE';
  if (status === 429 || code === 'RATE_LIMITED') return 'BREVO_RATE_LIMITED';
  if ((Number.isInteger(status) && status >= 500) || code === 'UNAVAILABLE') {
    return 'BREVO_UNAVAILABLE';
  }
  return null;
}

/**
 * Sends one message (POST /v3/smtp/email).
 *
 * @param {{account: object, config: object, emailData: object, h: object}} input
 * @returns {Promise<{messageId: string|null, response: string}>} Brevo `messageId`
 *   without angle brackets (the first of `messageIds` for a batch)
 * @throws {Error} Account configuration error (no key), ValidationError,
 *   size error (h.tooLargeError) or "Brevo API request failed: <status>"
 *   with `status`, `provider`, `retryAfterMs` (429) and a BREVO_* `code`
 *   when the body names the cause
 * @sideeffect One HTTPS request to api.brevo.com with recipients and content.
 */
async function send({ account, config, emailData, h }) {
  if (!usableSecret(config?.apiKey)) throw h.accountConfigError('Brevo API key not configured');
  const template = h.providerTemplateFor(account, emailData);
  h.validateEmailSecurity(emailData);

  const body = JSON.stringify(buildSendRequest({ account, emailData, template, h }));
  if (Buffer.byteLength(body) >= BREVO_MAX_MESSAGE_BYTES) {
    throw h.tooLargeError(
      template,
      'The message is larger than Brevo accepts (20 MB including attachments)'
    );
  }

  const response = await fetch(`${API_BASE}${SEND_PATH}`, {
    ...h.fetchBounds(emailData),
    method: 'POST',
    redirect: 'error',
    headers: {
      'api-key': config.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const hint = errorBodyHint(await h.readProviderErrorBody(response), response.status);
    const error = h.providerHttpError('Brevo', response.status, {
      retryAfterMs: response.status === 429 ? rateLimitResetMs(response) : 0,
    });
    if (hint && !error.code) error.code = hint;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(await readBounded(response, SEND_RESPONSE_MAX_BYTES));
  } catch {
    parsed = null;
  }
  const id =
    typeof parsed?.messageId === 'string'
      ? parsed.messageId
      : Array.isArray(parsed?.messageIds)
        ? parsed.messageIds.find((entry) => typeof entry === 'string')
        : null;
  return { messageId: normalizeMessageId(id), response: 'Accepted' };
}

/**
 * GETs a JSON document from the Brevo API. Failures become ProviderApiError
 * with the status and, when the body names the cause, a BREVO_* code.
 *
 * @param {string} pathAndQuery - Path under https://api.brevo.com
 * @param {string} apiKey
 * @returns {Promise<any>}
 * @throws {ProviderApiError}
 */
async function getJson(pathAndQuery, apiKey) {
  let response;
  try {
    response = await fetch(`${API_BASE}${pathAndQuery}`, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/json', 'api-key': apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderApiError('NETWORK');
  }
  if (!response.ok) {
    let text;
    try {
      text = await readBounded(response, ERROR_BODY_MAX_BYTES);
    } catch {
      text = null;
    }
    const error = new ProviderApiError(codeForStatus(response.status), response.status);
    const hint = errorBodyHint(text, response.status);
    if (hint) error.code = hint;
    throw error;
  }
  const text = await readBounded(response, MAX_RESPONSE_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderApiError('BAD_RESPONSE');
  }
}

/**
 * Read-only credential check (GET /v3/account). Returns only non-personal
 * details: whether transactional email is enabled, the enterprise flag and
 * the plan types with their remaining credits. Never the login email, names,
 * company, address, SMTP relay login or ids.
 *
 * @param {{apiKey?: string}} config - Normalised, decrypted config
 * @returns {Promise<{ok: true, details: {transactionalEnabled: boolean, enterprise: boolean, plans: object[]}}>}
 * @throws {ProviderApiError} CREDENTIALS (no key), AUTH, RATE_LIMITED,
 *   UNAVAILABLE, NETWORK, BAD_RESPONSE, or BREVO_IP_NOT_AUTHORIZED
 * @sideeffect One HTTPS GET to api.brevo.com.
 */
async function checkConnection(config) {
  if (!usableSecret(config?.apiKey)) throw new ProviderApiError('CREDENTIALS');
  const body = await getJson(ACCOUNT_PATH, config.apiKey);
  if (!body || typeof body !== 'object') throw new ProviderApiError('BAD_RESPONSE');
  const plans = (Array.isArray(body.plan) ? body.plan : [])
    .slice(0, 10)
    .filter((plan) => plan && PLAN_TYPES.has(plan.type))
    .map((plan) => {
      const credits =
        typeof plan.credits === 'number' || typeof plan.credits === 'string'
          ? Number(plan.credits)
          : NaN;
      return {
        type: plan.type,
        ...(plan.creditsType === 'sendLimit' ? { creditsType: 'sendLimit' } : {}),
        ...(Number.isFinite(credits) ? { credits } : {}),
      };
    });
  return {
    ok: true,
    details: {
      transactionalEnabled: body.relay?.enabled === true,
      enterprise: body.enterprise === true,
      plans,
    },
  };
}

const asString = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/**
 * Lists the account's transactional templates (GET /v3/smtp/templates,
 * offset paging in creation order, at most MAX_LIST_PAGES pages). The list
 * response already carries `htmlContent` and `subject`, so no detail call is
 * needed. Inactive templates get `activeVersion: null` (shown as unpublished;
 * Brevo can not send them). Brevo templates have no plain-text part.
 *
 * @param {{apiKey?: string}} config
 * @param {{pageSize?: number}} [options] - 1..1000 (default 50; tests force paging)
 * @returns {Promise<{templates: object[], warning: string|null}>} RemoteTemplate
 *   list (utils/provider-api.js); `warning` 'TRUNCATED' when the account has
 *   more templates than were read
 * @throws {ProviderApiError}
 * @sideeffect HTTPS GETs to api.brevo.com (they count against Brevo's hourly
 *   limit for /v3/smtp/* endpoints).
 */
async function listTemplates(config, { pageSize = LIST_PAGE_SIZE } = {}) {
  if (!usableSecret(config?.apiKey)) throw new ProviderApiError('CREDENTIALS');
  const limit = Math.min(1000, Math.max(1, Math.trunc(pageSize) || LIST_PAGE_SIZE));
  const items = [];
  let truncated = false;
  for (let page = 0; ; page += 1) {
    if (page >= MAX_LIST_PAGES) {
      truncated = true;
      break;
    }
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(page * limit),
      sort: 'asc',
    });
    const body = await getJson(`${TEMPLATES_PATH}?${query}`, config.apiKey);
    const list = Array.isArray(body?.templates) ? body.templates : [];
    items.push(...list);
    if (list.length < limit) break;
    if (Number.isSafeInteger(body?.count) && (page + 1) * limit >= body.count) break;
  }

  const seen = new Set();
  const templates = [];
  for (const item of items) {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0) continue;
    const remoteId = String(item.id);
    if (seen.has(remoteId)) continue;
    seen.add(remoteId);
    const updatedAt = toIso(item.modifiedAt) || toIso(item.createdAt);
    templates.push({
      remoteId,
      name: asString(item.name, 200) || `Template ${remoteId}`,
      scope: 'default',
      activeVersion: item.isActive === true ? updatedAt || 'active' : null,
      subject: asString(item.subject, 998),
      html: asString(item.htmlContent, 1_000_000),
      text: '',
      updatedAt,
    });
  }
  return { templates, warning: truncated ? 'TRUNCATED' : null };
}

const PATH_CHAR = /[A-Za-z0-9_.]/;

/**
 * Variables a Brevo template reads from `params` (Brevo template language:
 * `{{ params.name }}`, `{{ params.order.id | default: "-" }}`,
 * `{% if params.vip %}`, `{% for item in params.items %}`). Each detected
 * `params.<path>` maps to the Magic Mail data key `<path>`: the template data
 * is sent as Brevo `params` unchanged, so `data.name` is `{{ params.name }}`.
 * Contact attributes (`{{ contact.FIRSTNAME }}`) are not Magic Mail data and
 * are not reported.
 *
 * Linear: `indexOf` scanning over the source; tags longer than 1000
 * characters are skipped. Same result shape as detectTemplateVariables
 * (utils/template-variables.js); `blocks` lists the statement keywords
 * (`if`, `for`, ...) that use the path.
 *
 * @param {unknown} source - Template subject and HTML
 * @param {{maxVariables?: number}} [options]
 * @returns {{variables: {path: string, root: string, raw: boolean, scoped: boolean, blocks: string[]}[], truncated: boolean}}
 */
function templateVariables(source, { maxVariables = 200 } = {}) {
  const text = typeof source === 'string' ? source.slice(0, 1_000_000) : '';
  const limit = Number.isInteger(maxVariables) && maxVariables > 0 ? maxVariables : 200;
  const found = new Map();
  let at = 0;
  while (at < text.length) {
    const expr = text.indexOf('{{', at);
    const stmt = text.indexOf('{%', at);
    if (expr === -1 && stmt === -1) break;
    const isStatement = expr === -1 || (stmt !== -1 && stmt < expr);
    const start = isStatement ? stmt : expr;
    const end = text.indexOf(isStatement ? '%}' : '}}', start + 2);
    if (end === -1) break;
    at = end + 2;
    if (end - start > 1000) continue;
    const inner = text.slice(start + 2, end);
    const keyword = isStatement ? /^\s*-?\s*([a-z]{1,20})/.exec(inner)?.[1] || null : null;
    let from = 0;
    for (;;) {
      const hit = inner.indexOf('params.', from);
      if (hit === -1) break;
      let cursor = hit + 7;
      while (cursor < inner.length && PATH_CHAR.test(inner[cursor])) cursor += 1;
      from = cursor;
      if (hit > 0 && PATH_CHAR.test(inner[hit - 1])) continue;
      const path = inner.slice(hit + 7, cursor).replace(/\.+$/, '');
      if (!path || path.length > 128 || path.includes('..') || !/^[A-Za-z_]/.test(path)) continue;
      let entry = found.get(path);
      if (!entry) {
        entry = { path, root: path.split('.')[0], raw: false, scoped: false, blocks: new Set() };
        found.set(path, entry);
      }
      if (keyword) entry.blocks.add(keyword);
    }
  }
  const variables = [...found.values()]
    .map((entry) => ({ ...entry, blocks: [...entry.blocks] }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const truncated = variables.length > limit;
  return { variables: truncated ? variables.slice(0, limit) : variables, truncated };
}

/**
 * The token a webhook request presents: `Authorization: Bearer <token>`
 * (Brevo webhook `auth: { type: 'bearer', token }`) or the custom header
 * `X-Magic-Mail-Webhook-Token` (Brevo webhook `headers` option). An
 * Authorization header with another scheme presents no token.
 *
 * @param {Record<string, string|string[]|undefined>} headers - Lower-case names (Koa)
 * @returns {string|null}
 */
function presentedToken(headers) {
  const auth = headers?.authorization;
  if (typeof auth === 'string' && auth.length > 0) {
    const match = BEARER_PATTERN.exec(auth.trim());
    return match ? match[1] : null;
  }
  const custom = headers?.[WEBHOOK_TOKEN_HEADER];
  if (typeof custom === 'string' && custom.length > 0 && custom.length <= 512) {
    return custom.trim();
  }
  return null;
}

/**
 * Constant-time comparison of two tokens of any length: both are hashed
 * first, so timingSafeEqual always compares equal-length buffers.
 *
 * @param {string} presented
 * @param {string} expected
 * @returns {boolean}
 */
function tokensMatch(presented, expected) {
  const a = crypto.createHash('sha256').update(presented, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Event time in ms: `ts_event` (seconds, "when the webhook event occurred"),
 * else `ts` (seconds), else `ts_epoch` (documented as milliseconds; several
 * official examples show seconds, so values below 1e11 are read as seconds).
 * Null outside [2000-01-01, now + 1 day].
 *
 * @param {Record<string, unknown>} event
 * @param {number} now
 * @returns {number|null}
 */
function eventTimeMs(event, now) {
  const seconds = [event.ts_event, event.ts].find(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  );
  let ms = null;
  if (seconds !== undefined) ms = Math.round(seconds * 1000);
  else if (typeof event.ts_epoch === 'number' && Number.isFinite(event.ts_epoch)) {
    ms = event.ts_epoch < 1e11 ? Math.round(event.ts_epoch * 1000) : Math.round(event.ts_epoch);
  }
  if (ms === null || ms < MIN_EVENT_TIME_MS || ms > now + MAX_EVENT_SKEW_MS) return null;
  return ms;
}

/**
 * @param {unknown} value
 * @returns {string|null} Lower-cased plausible address (memory only)
 */
function normalizeRecipient(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  if (address.length < 3 || address.length > 254) return null;
  return /^[^\s@]+@[^\s@]+$/.test(address) ? address : null;
}

/**
 * Maps one Brevo transactional event to a delivery event (see EVENT_MAP).
 *
 * Brevo events carry no event id (`id` is the webhook id), so `eventId` is a
 * SHA-256 over event name, message id, recipient and the event timestamps
 * (and the link for clicks): a retried delivery of the same event gives the
 * same id. Two opens in the same second share it and count once.
 *
 * @param {unknown} event
 * @param {number} [now]
 * @returns {object|null} DeliveryEvent (services/delivery-webhooks.js) or null when ignored
 */
function mapEvent(event, now = Date.now()) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const name = typeof event.event === 'string' ? event.event : '';
  if (!Object.hasOwn(EVENT_MAP, name)) return null;
  const mapping = EVENT_MAP[name];
  const canonical = mapping.code || name;
  const messageId = normalizeMessageId(event['message-id']);
  const custom = typeof event['X-Mailin-custom'] === 'string' ? event['X-Mailin-custom'] : '';
  const correlation = custom.length <= 200 ? CORRELATION_PATTERN.exec(custom.trim()) : null;
  const recipientAddress = normalizeRecipient(event.email);
  const url = mapping.kind === 'clicked' && typeof event.link === 'string' ? event.link : null;
  const eventId = crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        canonical,
        messageId,
        recipientAddress,
        typeof event.ts_event === 'number' ? event.ts_event : null,
        typeof event.ts === 'number' ? event.ts : null,
        typeof event.ts_epoch === 'number' ? event.ts_epoch : null,
        url ? url.slice(0, 2048) : null,
      ])
    )
    .digest('hex');
  return {
    eventId,
    messageId,
    magicmailId: correlation ? correlation[1] : null,
    kind: mapping.kind,
    reasonCode: `BREVO_${canonical.toUpperCase()}`,
    recipient: recipientAddress,
    occurredAt: eventTimeMs(event, now),
    suppress: mapping.suppress || null,
    notDelivered: mapping.notDelivered === true,
    ...(mapping.kind === 'clicked' ? { url } : {}),
  };
}

/**
 * Authenticates and parses one Brevo webhook request.
 *
 * Brevo transactional webhooks are not signed (secured-webhooks page: IP
 * allowlist, basic auth in the URL, bearer token or custom headers). The
 * account's random `webhookToken` must be presented as bearer token or in
 * X-Magic-Mail-Webhook-Token; no token in the config means 401. The body is
 * one event object or, for batched webhooks, an array of events; at most
 * MAX_WEBHOOK_EVENTS are read. `replayKey` is the SHA-256 of the raw body, so
 * a retried delivery of the same request is acknowledged without work.
 *
 * @param {{config: object, rawBody: Buffer, headers: Record<string, string|undefined>, now?: number}} input
 * @returns {Promise<{status: 200|400|401, events: object[], replayKey?: string}>}
 */
async function webhook({ config, rawBody, headers, now = Date.now() }) {
  const expected = config?.webhookToken;
  if (!usableSecret(expected)) return { status: 401, events: [] };
  const presented = presentedToken(headers || {});
  if (!presented || !tokensMatch(presented, expected)) return { status: 401, events: [] };
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return { status: 400, events: [] };
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, events: [] };
  }
  if (!payload || typeof payload !== 'object') return { status: 400, events: [] };
  const list = Array.isArray(payload) ? payload.slice(0, MAX_WEBHOOK_EVENTS) : [payload];
  const events = list.map((event) => mapEvent(event, now)).filter(Boolean);
  return {
    status: 200,
    events,
    replayKey: crypto.createHash('sha256').update(rawBody).digest('hex'),
  };
}

module.exports = {
  id: 'brevo',
  label: 'Brevo',
  SECRET_FIELDS: Object.freeze(['apiKey', 'webhookToken']),
  IDENTITY_FIELDS: Object.freeze([]),
  HINTS,
  hintFor,
  normalizeConfig,
  prepareConfigForCreate,
  send,
  templates: Object.freeze({ list: listTemplates }),
  checkConnection,
  webhook,
  templateVariables,
  WEBHOOK_TOKEN_HEADER,
  __test__: {
    API_BASE,
    ATTACHMENT_EXTENSIONS,
    BREVO_MAX_MESSAGE_BYTES,
    EVENT_MAP,
    IP_MESSAGE,
    MAX_WEBHOOK_EVENTS,
    SENDER_MESSAGE,
    TEMPLATE_MESSAGE,
    buildSendRequest,
    errorBodyHint,
    eventTimeMs,
    listTemplates,
    mapEvent,
    presentedToken,
    rateLimitResetMs,
    tokensMatch,
  },
};
