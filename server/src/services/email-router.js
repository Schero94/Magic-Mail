'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');
const { decryptCredentials } = require('../utils/encryption');
const { normalizeMessageId } = require('../utils/message-id');
const { mailgunApiBaseUrl, resolveMailgunRegion } = require('../utils/mailgun-region');
const { routingRuleEvaluationSort } = require('../utils/routing-order');
const coordination = require('../utils/coordination');
const { checkRecipientDomains } = require('../utils/recipient-domains');
const {
  classifyDeliveryError,
  combineOutcome,
  failoverAllowed,
  createSmtpProbe,
  tagSmtpStage,
  tagPreDispatch,
  tagProviderError,
  sanitizeErrorCode,
} = require('../utils/delivery-outcome');

const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const ROUTING_RULE_UID = 'plugin::magic-mail.routing-rule';

const EMAIL_TYPES = ['transactional', 'marketing', 'notification'];
const PRIORITIES = ['high', 'normal', 'low'];

const MAX_TO_RECIPIENTS = 100;
const MAX_COPY_RECIPIENTS = 50;
const MAX_REPLY_TO = 10;
const MAX_RECIPIENT_ADDRESS_LENGTH = 320;
const MAX_RECIPIENT_LIST_LENGTH = 4000;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_CUSTOM_HEADERS = 20;
const MAX_ROUTING_CANDIDATES = 25;

// Refresh OAuth tokens this long before they expire (clock skew, slow sends).
const OAUTH_EXPIRY_SKEW_MS = 60_000;
// In-flight token refreshes per account (single-flight per process; the
// database lease in currentOAuthToken serialises processes).
const oauthRefreshes = new Map();

const EMAIL_PATTERN = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

/**
 * CSS that can execute script in legacy clients or pull remote resources
 * outside the message. A `<style>` block or `style` attribute containing any
 * of these is dropped entirely.
 */
const UNSAFE_CSS =
  /expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding|<\s*\/?\s*(?:script|style)/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;

/**
 * Allowlist-based HTML sanitizer configuration for outbound email bodies.
 *
 * The allowlist covers the markup that email designers (Unlayer and
 * hand-written templates) rely on: `<style>` blocks for responsive layout,
 * table layout attributes (bgcolor, align, valign, role, background,
 * cellpadding, ...) and legacy presentational tags such as `<center>` and
 * `<font>`. Scripts, frames, forms, event handlers and `javascript:` URLs
 * stay blocked, and CSS is filtered for script-capable constructs.
 *
 * `sanitize-html` is a hard runtime dependency: there is deliberately no
 * regex fallback. If the dependency is missing the module fails to load,
 * which fails closed.
 */
const HTML_SANITIZE_OPTIONS = {
  allowedTags: [
    'html',
    'body',
    'head',
    'title',
    'meta',
    'style',
    'div',
    'span',
    'p',
    'br',
    'hr',
    'a',
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'strike',
    'del',
    'ins',
    'mark',
    'small',
    'sup',
    'sub',
    'abbr',
    'cite',
    'q',
    'font',
    'center',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'table',
    'caption',
    'colgroup',
    'col',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'blockquote',
    'code',
    'pre',
    'address',
    'figure',
    'figcaption',
  ],
  // `<style>` is allowed on purpose (email layout depends on it). Its
  // content is filtered by `exclusiveFilter` below.
  allowVulnerableTags: true,
  nonTextTags: ['script', 'textarea', 'option', 'noscript'],
  allowedAttributes: {
    '*': [
      'style',
      'class',
      'id',
      'align',
      'valign',
      'bgcolor',
      'dir',
      'lang',
      'role',
      'title',
      'width',
      'height',
      'aria-*',
    ],
    html: ['xmlns', 'xmlns:v', 'xmlns:o'],
    a: ['href', 'target', 'rel', 'name'],
    img: ['src', 'alt', 'border'],
    table: ['border', 'cellspacing', 'cellpadding', 'background', 'summary'],
    td: ['colspan', 'rowspan', 'background', 'nowrap'],
    th: ['colspan', 'rowspan', 'background', 'nowrap', 'scope'],
    col: ['span'],
    colgroup: ['span'],
    font: ['color', 'face', 'size'],
    style: ['type', 'media'],
    // `meta http-equiv=refresh` enables redirect-based attacks, so it is
    // intentionally excluded from the meta allowlist.
    meta: ['name', 'content', 'charset'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'cid'],
  allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'] },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'background'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  exclusiveFilter: (frame) => frame.tag === 'style' && UNSAFE_CSS.test(frame.text || ''),
  transformTags: {
    '*': (tagName, attribs) => {
      const next = { ...attribs };
      if (typeof next.style === 'string' && UNSAFE_CSS.test(next.style)) delete next.style;
      if (
        tagName === 'img' &&
        typeof next.src === 'string' &&
        /^\s*data:/i.test(next.src) &&
        !SAFE_DATA_IMAGE.test(next.src.trim())
      ) {
        delete next.src;
      }
      return { tagName, attribs: next };
    },
  },
};

/** Custom header names callers may set besides `X-*` (case-insensitive). */
const ALLOWED_CUSTOM_HEADERS = new Map([
  ['list-id', 'List-Id'],
  ['precedence', 'Precedence'],
  ['auto-submitted', 'Auto-Submitted'],
  ['in-reply-to', 'In-Reply-To'],
  ['references', 'References'],
]);
/** `X-*` headers that only MagicMail itself sets. */
const RESERVED_X_HEADERS = new Set([
  'x-mailer',
  'x-email-type',
  'x-priority',
  'x-entity-ref-id',
  'x-content-type-options',
  'x-magicmail-outbox',
]);

/** Bounded timeouts for queue (worker) sends; the lease must exceed their sum. */
const BOUNDED_SMTP_TIMEOUTS = Object.freeze({
  connectionTimeout: 30_000,
  greetingTimeout: 30_000,
  socketTimeout: 60_000,
});
const BOUNDED_FETCH_TIMEOUT_MS = 60_000;
/** Upper bound for one OAuth token refresh request in bounded (queue) sends. */
const BOUNDED_OAUTH_REFRESH_TIMEOUT_MS = 30_000;

/**
 * fetch options for a provider request: an abort signal for bounded (queue)
 * sends, nothing otherwise (4.3 behaviour).
 *
 * @param {object} emailData
 * @returns {{signal?: AbortSignal}}
 */
function fetchBounds(emailData) {
  return emailData?.__dispatch?.bounded
    ? { signal: AbortSignal.timeout(BOUNDED_FETCH_TIMEOUT_MS) }
    : {};
}

/**
 * fetch options for an OAuth token refresh: an abort signal for bounded
 * (queue) sends, so a stalled token endpoint can not outlive the claim.
 * Created per call, so the timeout starts when the request starts.
 *
 * @param {object} emailData
 * @returns {{signal?: AbortSignal}}
 */
function oauthRefreshBounds(emailData) {
  return emailData?.__dispatch?.bounded
    ? { signal: AbortSignal.timeout(BOUNDED_OAUTH_REFRESH_TIMEOUT_MS) }
    : {};
}

/**
 * Strips CR/LF from a string to prevent SMTP header injection.
 * Safe to call on any value - returns empty string for non-strings.
 * @param {*} value
 * @returns {string}
 */
function stripHeaderInjection(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]/g, '').trim();
}

/**
 * Creates an error that marks invalid caller input. Uses Strapi's
 * ValidationError when available so Content-API callers receive a 400.
 *
 * @param {string} message - Client-safe message without personal data
 * @returns {Error}
 */
function validationError(message, reason) {
  let error;
  try {
    const { errors } = require('@strapi/utils');
    error = new errors.ValidationError(message);
  } catch {
    error = new Error(message);
    error.name = 'ValidationError';
  }
  error.code = 'MAGIC_MAIL_VALIDATION';
  if (reason) error.details = { reason };
  return error;
}

/**
 * Error for `queue: true` when the outbox table is missing.
 * @returns {Error}
 */
function queueUnavailableError() {
  const error = new Error('The send queue is not available');
  error.code = 'MAGIC_MAIL_QUEUE_UNAVAILABLE';
  return error;
}

/**
 * Creates an error for an account that cannot send (missing or unreadable
 * credentials). Such errors never reach a provider, so failover is safe.
 *
 * @param {string} message
 * @returns {Error}
 */
function accountConfigError(message) {
  const error = new Error(message);
  error.code = 'MAGIC_MAIL_ACCOUNT_CONFIG';
  return error;
}

/**
 * Creates the error for a non-success provider HTTP response. Whether the
 * next account may be tried is decided from `status` by `failoverAllowed`
 * (utils/delivery-outcome.js).
 *
 * @param {string} provider
 * @param {number} status
 * @returns {Error}
 */
function providerHttpError(provider, status) {
  const error = new Error(`${provider} API request failed: ${status}`);
  error.status = status;
  return error;
}

/**
 * Returns true when a send error guarantees that no provider accepted the
 * message, so trying the next account cannot cause duplicate delivery.
 * Same rule for inline and queue sends (see `failoverAllowed`).
 *
 * @param {*} error
 * @returns {boolean}
 */
function isSafeToRetry(error) {
  return failoverAllowed(error);
}

/** @returns {Function} nodemailer's RFC 5322 address parser */
function getAddressParser() {
  const parser = require('nodemailer/lib/addressparser');
  return parser.default || parser;
}

/**
 * Parses an address header value with RFC 5322 rules (the same parser the
 * transports use), flattening groups.
 *
 * @param {*} value - String, array of strings, or `{ name, address }` objects
 * @returns {{name: string, address: string, group?: boolean}[]}
 */
function parseAddressList(value) {
  if (value === undefined || value === null || value === '') return [];
  const items = Array.isArray(value) ? value : [value];
  const out = [];
  const parse = getAddressParser();
  for (const item of items) {
    if (item && typeof item === 'object' && typeof item.address === 'string') {
      out.push({ name: stripHeaderInjection(item.name || ''), address: item.address.trim() });
      continue;
    }
    if (typeof item !== 'string') {
      out.push({ name: '', address: '', invalid: true });
      continue;
    }
    for (const entry of parse(stripHeaderInjection(item))) {
      if (Array.isArray(entry.group)) {
        out.push({ name: entry.name || '', address: '', group: true });
        continue;
      }
      out.push({ name: entry.name || '', address: (entry.address || '').trim() });
    }
  }
  return out;
}

/**
 * Returns the bare, lower-cased addresses of a recipient value.
 * @param {*} value
 * @returns {string[]}
 */
function listAddresses(value) {
  return parseAddressList(value)
    .map((entry) => entry.address.toLowerCase())
    .filter((address) => address.length > 0);
}

/**
 * Parses exactly one mailbox. Returns null for groups, lists, or anything the
 * transport would not interpret as a single valid address.
 *
 * @param {*} value
 * @returns {{name: string, address: string}|null}
 */
function parseSingleMailbox(value) {
  const entries = parseAddressList(value);
  if (entries.length !== 1) return null;
  const [entry] = entries;
  if (entry.group || entry.invalid || !EMAIL_PATTERN.test(entry.address)) return null;
  return { name: stripHeaderInjection(entry.name), address: entry.address };
}

/**
 * Formats a mailbox for APIs that take a single header string (Mailgun).
 * @param {{name?: string, address: string}} mailbox
 * @returns {string}
 */
function formatAddress(mailbox) {
  const name = stripHeaderInjection(mailbox.name || '');
  if (!name) return mailbox.address;
  return `"${name.replace(/["\\]/g, '\\$&')}" <${mailbox.address}>`;
}

/**
 * Compatibility helper: bare address of a single mailbox ('' if invalid).
 * @param {*} value
 * @returns {string}
 */
function extractEmailAddress(value) {
  const mailbox = parseSingleMailbox(value);
  return mailbox ? mailbox.address : '';
}

/**
 * Returns true if a candidate sender is exactly one mailbox whose address
 * equals the account's `fromEmail` (case-insensitive). Parsing uses the same
 * RFC 5322 parser as the transports, so forms such as
 * `"<allowed@x>" evil@y` or `evil@y (<allowed@x>)` are rejected.
 *
 * @param {*} candidate - Raw `from` value from the caller
 * @param {string} accountFrom - Account's trusted fromEmail
 * @returns {boolean}
 */
function isFromAllowed(candidate, accountFrom) {
  if (!candidate) return true;
  const mailbox = parseSingleMailbox(candidate);
  const accountAddress = String(accountFrom || '')
    .trim()
    .toLowerCase();
  return Boolean(mailbox && accountAddress && mailbox.address.toLowerCase() === accountAddress);
}

/**
 * Builds the trusted sender mailbox for an account. The address always comes
 * from the account; a caller display name is kept only when the caller's
 * address matches the account.
 *
 * @param {object} account
 * @param {*} candidate - Caller `from` value
 * @param {string} [defaultName] - Plugin-settings display-name fallback
 * @returns {{sender: {name: string, address: string}, rejected: boolean}}
 */
function resolveSender(account, candidate, defaultName) {
  const address = String(account.fromEmail || '').trim();
  let name =
    stripHeaderInjection(account.fromName || '') || stripHeaderInjection(defaultName || '');
  let rejected = false;

  if (candidate) {
    const mailbox = parseSingleMailbox(candidate);
    if (mailbox && mailbox.address.toLowerCase() === address.toLowerCase()) {
      if (mailbox.name) name = mailbox.name;
    } else {
      rejected = true;
    }
  }

  return { sender: { name, address }, rejected };
}

/**
 * Validates a Reply-To value and returns it as mailbox objects.
 *
 * @param {*} value
 * @returns {{name: string, address: string}[]|undefined}
 * @throws {Error} ValidationError for an invalid address or too many entries
 */
function resolveReplyTo(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const entries = parseAddressList(value);
  if (entries.length === 0 || entries.length > MAX_REPLY_TO) {
    throw validationError('Invalid replyTo address');
  }
  return entries.map((entry) => {
    if (entry.group || entry.invalid || !EMAIL_PATTERN.test(entry.address)) {
      throw validationError('Invalid replyTo address');
    }
    return { name: stripHeaderInjection(entry.name), address: entry.address };
  });
}

/**
 * Decodes quoted-printable text into bytes.
 * @param {string} input
 * @returns {Buffer}
 */
function decodeQuotedPrintable(input) {
  const cleaned = input.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(char, 'utf-8'));
    }
  }
  return Buffer.from(bytes);
}

/**
 * Converts attachment content into bytes, honouring `encoding`.
 * @param {*} content
 * @param {string} [encoding]
 * @returns {Buffer}
 */
function decodeAttachmentContent(content, encoding) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content !== 'string') {
    throw validationError('Attachment content must be a string or Buffer');
  }
  switch (String(encoding || 'utf-8').toLowerCase()) {
    case 'base64':
      return Buffer.from(content.replace(/\s+/g, ''), 'base64');
    case 'hex':
      return Buffer.from(content, 'hex');
    case 'binary':
    case 'latin1':
      return Buffer.from(content, 'latin1');
    case 'ascii':
      return Buffer.from(content, 'ascii');
    case 'quoted-printable':
      return decodeQuotedPrintable(content);
    case 'utf-8':
    case 'utf8':
    case '7bit':
    case '8bit':
      return Buffer.from(content, 'utf-8');
    default:
      throw validationError('Unsupported attachment encoding');
  }
}

/**
 * Normalizes attachments once for every provider: content becomes a Buffer,
 * metadata is validated, and file-path / URL attachments are rejected so no
 * provider adapter can read local files or fetch remote URLs.
 *
 * @param {*} list
 * @returns {{filename?: string, content: Buffer, contentType: string, cid?: string}[]}
 * @throws {Error} ValidationError for path/href attachments or invalid entries
 */
function normalizeAttachments(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw validationError('attachments must be an array');
  if (list.length > MAX_ATTACHMENTS) throw validationError('Too many attachments');

  return list.map((attachment, index) => {
    if (!attachment || typeof attachment !== 'object') {
      throw validationError('Invalid attachment');
    }
    if (
      attachment.path !== undefined ||
      attachment.href !== undefined ||
      attachment.raw !== undefined
    ) {
      throw validationError(
        'File-path and URL attachments are not supported; pass the file content instead'
      );
    }
    if (attachment.content === undefined || attachment.content === null) {
      throw validationError('Attachment content is required');
    }

    const content = decodeAttachmentContent(attachment.content, attachment.encoding);
    if (content.length > MAX_ATTACHMENT_BYTES) throw validationError('Attachment is too large');

    let cid;
    if (attachment.cid !== undefined && attachment.cid !== null && attachment.cid !== '') {
      if (
        typeof attachment.cid !== 'string' ||
        !/^[A-Za-z0-9._%+\-@]{1,128}$/.test(attachment.cid)
      ) {
        throw validationError('Invalid attachment content id');
      }
      cid = attachment.cid;
    }

    const contentType =
      typeof attachment.contentType === 'string' &&
      /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(attachment.contentType)
        ? attachment.contentType
        : 'application/octet-stream';

    const filename =
      stripHeaderInjection(attachment.filename || '').slice(0, 255) ||
      (cid ? undefined : `attachment-${index + 1}`);

    return { filename, content, contentType, cid };
  });
}

/**
 * Maps normalized attachments to nodemailer / MailComposer options. File and
 * URL access stay disabled because only Buffers are passed.
 *
 * @param {Array} attachments
 * @returns {Array}
 */
function toNodemailerAttachments(attachments) {
  return normalizeAttachments(attachments).map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    contentType: attachment.contentType,
    ...(attachment.cid ? { cid: attachment.cid } : {}),
    contentDisposition: attachment.cid ? 'inline' : 'attachment',
  }));
}

/**
 * Filters caller headers to the allowlist (`X-*` except plugin-owned ones,
 * List-Id, Precedence, Auto-Submitted, In-Reply-To, References).
 *
 * @param {*} source
 * @returns {Record<string, string>}
 */
function filterCustomHeaders(source) {
  const out = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;

  let count = 0;
  for (const [rawName, rawValue] of Object.entries(source)) {
    if (count >= MAX_CUSTOM_HEADERS) break;
    const name = stripHeaderInjection(rawName);
    const value = stripHeaderInjection(typeof rawValue === 'string' ? rawValue : '');
    const lower = name.toLowerCase();

    if (!name || !value || name.length > 128 || value.length > 4000) continue;
    if (!/^[A-Za-z0-9-]+$/.test(name)) continue;

    let canonical = null;
    if (ALLOWED_CUSTOM_HEADERS.has(lower)) canonical = ALLOWED_CUSTOM_HEADERS.get(lower);
    else if (lower.startsWith('x-') && !RESERVED_X_HEADERS.has(lower)) canonical = name;
    if (!canonical) continue;

    out[canonical] = value;
    count += 1;
  }
  return out;
}

/**
 * Merges allowed caller headers with MagicMail's own headers. MagicMail's
 * headers always win, compared case-insensitively.
 *
 * @param {Record<string, string>} pluginHeaders
 * @param {*} customSource
 * @returns {Record<string, string>}
 */
function mergeHeaders(pluginHeaders, customSource) {
  const taken = new Set(Object.keys(pluginHeaders).map((key) => key.toLowerCase()));
  const merged = {};
  for (const [name, value] of Object.entries(filterCustomHeaders(customSource))) {
    if (!taken.has(name.toLowerCase())) merged[name] = value;
  }
  return { ...merged, ...pluginHeaders };
}

/**
 * Backwards-compatible in-place variant of {@link mergeHeaders}.
 * @param {Record<string, string>} target
 * @param {*} source
 */
function mergeSafeHeaders(target, source) {
  const merged = mergeHeaders({ ...target }, source);
  Object.assign(target, merged);
}

/**
 * Returns true when the List-Unsubscribe header should be emitted: always for
 * marketing mail, for other types only when the admin enabled
 * `enableUnsubscribeHeader`.
 *
 * @param {object} emailData
 * @returns {boolean}
 */
function shouldEmitUnsubscribe(emailData) {
  if (!emailData || !emailData.unsubscribeUrl) return false;
  if (emailData.type === 'marketing') return true;
  return emailData.__forceUnsubscribe === true;
}

/**
 * Resolves the unsubscribe URL for this message. `{{email}}` is replaced with
 * the URL-encoded recipient when there is exactly one recipient; with several
 * recipients a per-recipient URL is impossible, so no header is emitted.
 *
 * @param {object} emailData
 * @returns {string|null}
 */
function resolveUnsubscribeUrl(emailData) {
  const raw = emailData && emailData.unsubscribeUrl;
  if (!raw || typeof raw !== 'string') return null;
  let url = raw.trim();
  if (url.includes('{{email}}')) {
    const recipients = listAddresses(emailData.to);
    if (recipients.length !== 1) return null;
    url = url.split('{{email}}').join(encodeURIComponent(recipients[0]));
  }
  if (/[\s<>"]/.test(url)) return null;
  try {
    const { protocol } = new URL(url);
    if (!['https:', 'http:', 'mailto:'].includes(protocol)) return null;
  } catch {
    return null;
  }
  return url;
}

/**
 * List-Unsubscribe headers (RFC 2369 / RFC 8058). One-Click is only
 * announced for https URLs, as RFC 8058 requires.
 *
 * @param {object} emailData
 * @returns {Record<string, string>}
 */
function unsubscribeHeaders(emailData) {
  if (!shouldEmitUnsubscribe(emailData)) return {};
  const url = resolveUnsubscribeUrl(emailData);
  if (!url) return {};
  const headers = { 'List-Unsubscribe': `<${url}>` };
  if (url.toLowerCase().startsWith('https:')) {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return headers;
}

/**
 * Builds the complete header set every provider adapter sends: MagicMail's
 * classification/priority headers, unsubscribe headers, and the allowed
 * caller headers.
 *
 * @param {object} emailData
 * @returns {Record<string, string>}
 */
function buildOutboundHeaders(emailData) {
  const type = EMAIL_TYPES.includes(emailData.type) ? emailData.type : 'transactional';
  const headers = {
    'X-Mailer': 'MagicMail/1.0',
    'X-Email-Type': type,
  };
  if (emailData.priority === 'high') {
    headers['X-Priority'] = '1 (Highest)';
    headers.Importance = 'high';
  } else if (emailData.priority === 'low') {
    headers['X-Priority'] = '5 (Lowest)';
    headers.Importance = 'low';
  }
  if (type === 'notification') headers['Auto-Submitted'] = 'auto-generated';

  const unsubscribe = unsubscribeHeaders(emailData);
  Object.assign(headers, unsubscribe);
  if (type === 'marketing' && unsubscribe['List-Unsubscribe']) headers.Precedence = 'bulk';
  // Queue sends carry their outbox id (diagnostics, duplicate detection).
  if (
    typeof emailData.__outboxId === 'string' &&
    /^[A-Za-z0-9]{1,64}$/.test(emailData.__outboxId)
  ) {
    headers['X-MagicMail-Outbox'] = emailData.__outboxId;
  }

  return mergeHeaders(headers, emailData.headers);
}

/**
 * Sender mailbox for an adapter. Re-applies alignment so adapters that are
 * called directly can never send from a foreign address.
 *
 * @param {object} account
 * @param {object} emailData
 * @returns {{name: string, address: string}}
 */
function senderFor(account, emailData) {
  return resolveSender(account, emailData.from).sender;
}

/**
 * Message-ID for the account's domain. Queue sends pass a stable local part,
 * so every attempt of one queued message uses the same Message-ID.
 *
 * @param {object} account
 * @param {string} [localPart]
 * @returns {string}
 */
function createMessageId(account, localPart) {
  const domain = String(account.fromEmail || '').split('@')[1] || 'localhost';
  if (typeof localPart === 'string' && /^[a-z0-9]{8,64}$/.test(localPart)) {
    return `<${localPart}@${domain}>`;
  }
  return `<${Date.now()}.${Math.random().toString(36).substring(2)}@${domain}>`;
}

/**
 * Decrypts an account secret, mapping failures to a non-sensitive
 * account-configuration error (safe to fail over).
 *
 * @param {*} value
 * @returns {object}
 */
function readAccountSecret(value) {
  try {
    return decryptCredentials(value) || {};
  } catch {
    throw accountConfigError('Account credentials could not be read. Please re-enter them.');
  }
}

/**
 * SET clause that counts one send in the current quota windows. Windows only
 * move forward: the keys (`YYYY-MM-DD`, `YYYY-MM-DDTHH`) sort as strings, so
 * a stored key at or after this process's key is kept and counted (a replica
 * whose clock lags slightly can not reset a window another one opened); an
 * older or missing key starts a new window at 1. Counter assignments come
 * before the key assignments (MySQL evaluates SET left to right).
 *
 * @param {Function} knex
 * @param {{day: string, hour: string}} keys
 * @returns {object}
 */
function forwardOnlyQuotaUpdate(knex, keys) {
  return {
    emails_sent_today: knex.raw(
      'CASE WHEN quota_day_key >= ? THEN COALESCE(emails_sent_today, 0) + 1 ELSE 1 END',
      [keys.day]
    ),
    emails_sent_this_hour: knex.raw(
      'CASE WHEN quota_hour_key >= ? THEN COALESCE(emails_sent_this_hour, 0) + 1 ELSE 1 END',
      [keys.hour]
    ),
    quota_day_key: knex.raw('CASE WHEN quota_day_key >= ? THEN quota_day_key ELSE ? END', [
      keys.day,
      keys.day,
    ]),
    quota_hour_key: knex.raw('CASE WHEN quota_hour_key >= ? THEN quota_hour_key ELSE ? END', [
      keys.hour,
      keys.hour,
    ]),
  };
}

/**
 * Returns true for loopback SMTP hosts (local mail catchers).
 * @param {*} host
 * @returns {boolean}
 */
function isLoopbackHost(host) {
  const value = String(host || '')
    .trim()
    .toLowerCase();
  return (
    value === 'localhost' ||
    value === '::1' ||
    value === '[::1]' ||
    /^127\.\d+\.\d+\.\d+$/.test(value)
  );
}

/**
 * Current quota window keys. Windows are aligned to the clock hour and the
 * calendar day in the configured time zone (default UTC), so restarts never
 * shift or skip a reset.
 *
 * @param {Date} [date]
 * @param {string} [timeZone]
 * @returns {{day: string, hour: string}}
 */
function quotaWindowKeys(date = new Date(), timeZone = 'UTC') {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  }
  const get = (type) => (parts.find((part) => part.type === type) || {}).value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return { day, hour: `${day}T${get('hour')}` };
}

/**
 * Builds a complete RFC 822 MIME message for the API providers (Gmail and
 * Microsoft Graph) using nodemailer's MailComposer. File and URL access are
 * disabled; attachments are always in-memory Buffers.
 *
 * @param {object} account - Sending account (fromEmail/fromName/replyTo)
 * @param {object} emailData - Normalized, already-sanitized email payload
 * @returns {Promise<Buffer>} Raw MIME message
 */
function buildRawMimeMessage(account, emailData) {
  const MailComposerModule = require('nodemailer/lib/mail-composer');
  const MailComposer = MailComposerModule.default || MailComposerModule;

  const attachments = toNodemailerAttachments(emailData.attachments);
  const replyTo = resolveReplyTo(emailData.replyTo || account.replyTo);

  const mailOptions = {
    from: senderFor(account, emailData),
    to: emailData.to,
    cc: emailData.cc || undefined,
    bcc: emailData.bcc || undefined,
    replyTo: replyTo || undefined,
    subject: stripHeaderInjection(emailData.subject),
    text: emailData.text || undefined,
    html: emailData.html || undefined,
    headers: buildOutboundHeaders(emailData),
    attachments: attachments.length ? attachments : undefined,
    messageId: createMessageId(account, emailData.__messageIdLocal),
    date: new Date(),
    disableFileAccess: true,
    disableUrlAccess: true,
  };

  return new Promise((resolve, reject) => {
    const compiledMessage = new MailComposer(mailOptions).compile();

    // MailComposer removes Bcc by default because SMTP transports deliver
    // those recipients through a separate envelope. Gmail and Microsoft Graph
    // receive only this raw MIME message, so they require the Bcc header to
    // route hidden recipients. Both providers suppress it from recipient
    // copies after delivery.
    compiledMessage.keepBcc = true;

    compiledMessage.build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

/**
 * Shallow-copies the caller payload so `send()` never mutates the caller's
 * object (reusing one object for several recipients must not leak the first
 * recipient's tracking data into later mails).
 *
 * @param {object} input
 * @returns {object}
 */
function cloneEmailData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Email data must be an object');
  }
  const copy = { ...input };
  for (const key of ['to', 'cc', 'bcc', 'attachments']) {
    if (Array.isArray(copy[key])) copy[key] = [...copy[key]];
  }
  if (copy.headers && typeof copy.headers === 'object') copy.headers = { ...copy.headers };
  // Internal markers are set by MagicMail only, never by callers.
  for (const key of Object.keys(copy)) {
    if (key.startsWith('__')) delete copy[key];
  }
  return copy;
}

/**
 * Email Router Service
 * Routes each email to an account (routing rules, primary, priority order),
 * enforces quotas atomically, fails over on errors that guarantee
 * non-delivery, and records one delivery log per attempt.
 */
module.exports = ({ strapi }) => ({
  /**
   * Send email with smart routing.
   *
   * @param {Object} input - { to, from, cc, bcc, subject, text, html, replyTo, attachments, type, priority, accountName, templateId, templateReferenceId, templateData | data, headers, unsubscribeUrl, enableTracking, skipLinkTracking, userId, recipientName }
   * @param {Object} [options]
   * @param {string} [options.accountDocumentId] - Send through exactly this account (no failover)
   * @param {boolean} [options.allowInactive] - With accountDocumentId: allow an inactive account (account test)
   * @param {Function} [options.fallbackSend] - Called when no MagicMail account can take the message (native interception)
   * @param {string} [options.source] - Caller identifier ('strapi-email', 'content-api', ...)
   * @param {boolean|'auto'} [options.queue] - true: deliver through the outbox (returns
   *   `{ success, queued: true, status, outboxId, emailId }` without sending inline);
   *   false: never queue; 'auto'/omitted: capture failed sends when the owner setting
   *   `queueFailedSends` is on
   * @param {string} [options.idempotencyKey] - De-duplicates queued sends per source (and scope)
   * @param {string} [options.idempotencyScope] - Caller identity the key is scoped to
   *   (the Content API passes `token:<id>` or `user:<id>`)
   * @param {Date} [options.notAfter] - A queued message is never sent after this time
   * @returns {Promise<Object>} Send result
   * @throws {Error} The provider error (unchanged), with `magicMailOutboxId` when an
   *   ambiguous failure was recorded as uncertain in the outbox
   */
  async send(input, options = {}) {
    const data = cloneEmailData(input);
    const source = options.source || 'service';
    // Idempotency keys are scoped by source and, when given, by the caller.
    const keyScope = options.idempotencyScope
      ? `${source}:${String(options.idempotencyScope)}`
      : source;

    if (!data.templateData && data.data) data.templateData = data.data;

    if (!data.to || (typeof data.to === 'string' && data.to.trim().length === 0)) {
      throw validationError('Recipient email address (to) is required');
    }

    // Normalize addresses (RFC 5321: the domain part is case-insensitive).
    const normalizeAddr = (addr) => {
      if (typeof addr !== 'string') return addr;
      if (addr.includes('<') && addr.includes('>')) {
        return addr.replace(/<([^>]+)>/, (_, email) => `<${email.trim().toLowerCase()}>`);
      }
      return addr.trim().toLowerCase();
    };
    const normalizeAddrs = (value) => {
      if (!value) return value;
      if (Array.isArray(value)) return value.map(normalizeAddr);
      if (typeof value === 'string' && value.includes(',')) {
        return value.split(',').map(normalizeAddr).join(', ');
      }
      return normalizeAddr(value);
    };
    data.to = normalizeAddrs(data.to);
    if (data.cc) data.cc = normalizeAddrs(data.cc);
    if (data.bcc) data.bcc = normalizeAddrs(data.bcc);

    if (data.skipLinkTracking) {
      strapi.log.debug('[magic-mail] [SKIP-TRACK] Link tracking disabled for this email');
    }

    // Template rendering (templateId or templateReferenceId).
    let renderedTemplate = null;
    if (data.templateId || data.templateReferenceId) {
      renderedTemplate = await this.renderTemplateFor(data);
      data.html = renderedTemplate.html;
      data.text = renderedTemplate.text;
      data.subject = data.subject || renderedTemplate.subject;
    }

    // Email type: explicit caller type, else the template category, else
    // transactional. (A destructuring default used to hide the category.)
    if (!EMAIL_TYPES.includes(data.type)) {
      data.type =
        renderedTemplate && EMAIL_TYPES.includes(renderedTemplate.category)
          ? renderedTemplate.category
          : 'transactional';
    }
    if (!PRIORITIES.includes(data.priority)) data.priority = 'normal';

    let pluginSettings = {};
    try {
      pluginSettings =
        (await strapi.plugin('magic-mail').service('plugin-settings').getSettings()) || {};
    } catch (error) {
      strapi.log.warn(
        `[magic-mail] Plugin settings unavailable; using defaults: ${error?.name || 'Error'}`
      );
    }

    // Unsubscribe: per-email URL wins. The global URL and the "emit for every
    // email type" behaviour both depend on `enableUnsubscribeHeader`.
    const unsubscribeEnabled = pluginSettings.enableUnsubscribeHeader === true;
    if (!data.unsubscribeUrl && unsubscribeEnabled && pluginSettings.unsubscribeUrl) {
      data.unsubscribeUrl = pluginSettings.unsubscribeUrl;
    }
    data.__forceUnsubscribe = unsubscribeEnabled;
    if (data.type === 'marketing' && !resolveUnsubscribeUrl(data)) {
      strapi.log.warn(
        '[magic-mail] Marketing email without a usable unsubscribe URL; List-Unsubscribe is not sent'
      );
    }

    // Reject invalid input before anything is logged or dispatched.
    data.replyTo = resolveReplyTo(data.replyTo);
    data.attachments = normalizeAttachments(data.attachments);
    this.validateEmailSecurity(data);
    await this.assertRecipientsDeliverable(data, pluginSettings);

    // One stable Message-ID local part for every attempt of this mail (inline
    // failover and outbox retries): bounce reports return the Message-ID, so
    // mailbox bounce monitoring can match them to the delivery log.
    if (
      typeof data.__messageIdLocal !== 'string' ||
      !/^[a-z0-9]{8,64}$/.test(data.__messageIdLocal)
    ) {
      data.__messageIdLocal = crypto.randomBytes(12).toString('hex');
    }

    // Send queue: `queue: true` stores the prepared message for the worker;
    // 'auto' (default) captures failed sends when the owner enabled it.
    const queueMode = options.queue === true ? 'queue' : options.queue === false ? 'off' : 'auto';
    const explicitAccount = Boolean(options.accountDocumentId || data.accountName);
    const queueService = queueMode === 'off' ? null : this.queueService();
    if (queueMode === 'queue') {
      if (!queueService) throw queueUnavailableError();
      if (options.allowInactive || source === 'admin-test') {
        throw validationError('Test sends can not be queued');
      }
      const duplicate = await queueService.findDuplicate(keyScope, options.idempotencyKey);
      if (duplicate) return duplicate;
      queueService.assertQueueable(data);
    }
    const captureEnabled =
      queueMode === 'auto' &&
      pluginSettings.queueFailedSends === true &&
      Boolean(queueService) &&
      !explicitAccount &&
      options.allowInactive !== true &&
      source !== 'admin-test';

    // One delivery log per attempt, whether or not tracking is enabled.
    const emailLog = await this.createDeliveryLog(data, renderedTemplate, source);
    const trackingEnabled = data.enableTracking !== false;
    if (emailLog && trackingEnabled && data.html) {
      data.html = await this.applyTracking(data, emailLog, pluginSettings);
    }

    if (queueMode === 'queue') {
      return queueService.enqueue(data, {
        emailLog,
        source,
        idempotencyKey: options.idempotencyKey,
        keyScope,
        notAfter: options.notAfter,
        accountDocumentId: options.accountDocumentId,
        createdByUser: options.createdByUser,
      });
    }

    const defaultFromName = pluginSettings.defaultFromName || '';
    const attempted = [];
    const skipped = [];
    const routingCtx = {
      ...options,
      defaultFromName,
      attempted,
      skipped,
      source,
      // Every send records the SMTP stage and the class of each failed
      // attempt: failover needs proof that a provider did not accept it.
      trackOutcome: true,
      attemptOutcomes: [],
    };

    /**
     * Captures a failed send into the outbox (owner setting). Returns the
     * row, or null when it was not captured.
     */
    const captureFailure = async (error, errorClass) => {
      if (!captureEnabled) return null;
      return queueService.capture(data, {
        emailLog,
        source,
        error,
        errorClass,
        attempted,
        lastAccountDocumentId: routingCtx.lastAccountDocumentId,
        idempotencyKey: options.idempotencyKey,
        keyScope,
        notAfter: options.notAfter,
      });
    };

    /** Resolves a captured send as queued (Magic Mail now owns delivery). */
    const resolveQueued = async (row) => {
      await this.markLog(
        emailLog,
        { deliveryStatus: 'pending' },
        { attempted, skipped, queue: { outboxId: row.documentId, status: row.status } }
      );
      strapi.log.warn('[magic-mail] [QUEUE] Send failed; queued for a retry');
      queueService.nudge();
      return queueService.queuedResult(row);
    };

    try {
      const routing = await this.routeAndDispatch(data, routingCtx);

      await this.markLog(
        emailLog,
        {
          accountId: routing.account.documentId,
          accountName: routing.account.name,
          deliveredAt: new Date(),
          deliveryStatus: 'sent',
          // Real provider id (or null): bounce/complaint webhooks match on it.
          providerMessageId: normalizeMessageId(routing.result?.messageId),
        },
        { attempted, skipped }
      );

      strapi.log.info('[magic-mail] [SUCCESS] Email accepted by the provider');
      return {
        success: true,
        accountUsed: routing.account.name,
        messageId: routing.result?.messageId,
        ...(emailLog?.emailId ? { emailId: emailLog.emailId } : {}),
      };
    } catch (error) {
      const fallbackAllowed =
        typeof options.fallbackSend === 'function' &&
        ['MAGIC_MAIL_NO_ACCOUNT', 'MAGIC_MAIL_QUOTA_EXHAUSTED'].includes(error?.code);

      if (fallbackAllowed) {
        strapi.log.warn(
          '[magic-mail] No MagicMail account can send this email; using the Strapi email provider'
        );
        try {
          const result = await options.fallbackSend();
          await this.markLog(
            emailLog,
            {
              accountName: 'strapi-email-provider',
              deliveredAt: new Date(),
              deliveryStatus: 'sent',
              providerMessageId: normalizeMessageId(result?.messageId),
            },
            { attempted, skipped, fallback: 'strapi-email-provider' }
          );
          return {
            success: true,
            accountUsed: null,
            fallback: 'strapi-email-provider',
            messageId: result?.messageId,
          };
        } catch (fallbackError) {
          // Capture only when a MagicMail account can send it later (quota
          // window). With no account at all the worker could never deliver
          // it (it does not use the Strapi provider), so the error reaches
          // the caller as in 4.3.
          if (
            captureEnabled &&
            error?.code === 'MAGIC_MAIL_QUOTA_EXHAUSTED' &&
            classifyDeliveryError(fallbackError) === 'transient'
          ) {
            const row = await captureFailure(fallbackError, 'transient');
            if (row) return resolveQueued(row);
          }
          await this.markLog(
            emailLog,
            { deliveryStatus: 'failed' },
            { attempted, skipped, fallback: 'strapi-email-provider' }
          );
          strapi.log.error(
            `[magic-mail] [ERROR] Strapi email provider fallback failed: ${fallbackError?.name || 'Error'}`
          );
          throw fallbackError;
        }
      }

      let queueInfo;
      if (captureEnabled) {
        const errorClass = combineOutcome(routingCtx.attemptOutcomes, error);
        if (errorClass === 'transient' || errorClass === 'capacity') {
          const row = await captureFailure(error, errorClass);
          if (row) return resolveQueued(row);
        } else if (errorClass === 'ambiguous') {
          const row = await captureFailure(error, errorClass);
          if (row) {
            queueInfo = { outboxId: row.documentId, status: 'uncertain' };
            try {
              Object.defineProperty(error, 'magicMailOutboxId', {
                value: row.documentId,
                enumerable: true,
                configurable: true,
                writable: true,
              });
            } catch {
              // frozen error: the outbox row still exists
            }
          }
        }
      }

      await this.markLog(
        emailLog,
        { deliveryStatus: 'failed' },
        { attempted, skipped, ...(queueInfo ? { queue: queueInfo } : {}) }
      );
      strapi.log.error(
        `[magic-mail] [ERROR] Email send failed: ${error?.name || 'Error'} (${sanitizeErrorCode(error)})`
      );
      throw error;
    }
  },

  /**
   * The queue service, or null when the plugin runs without it (unit-test
   * doubles) or its table is missing.
   *
   * @returns {object|null}
   */
  queueService() {
    try {
      const service = strapi.plugin('magic-mail').service('queue');
      return service && typeof service.isAvailable === 'function' && service.isAvailable()
        ? service
        : null;
    } catch {
      return null;
    }
  },

  /**
   * Rejects recipients that can not receive mail before anything is sent:
   * reserved or test domains (RFC 2606/6761), well-known typo domains, the
   * hard-bounce suppression list and, optionally, domains without MX/A.
   *
   * @param {object} data - prepared email (to/cc/bcc)
   * @param {object} settings - plugin settings
   * @returns {Promise<void>}
   * @throws {Error} code INVALID_RECIPIENT_DOMAIN / RECIPIENT_DOMAIN_TYPO /
   *   MAGIC_MAIL_RECIPIENT_SUPPRESSED (permanent, never failed over or queued)
   */
  async assertRecipientsDeliverable(data, settings = {}) {
    const addresses = [
      ...listAddresses(data.to),
      ...listAddresses(data.cc),
      ...listAddresses(data.bcc),
    ];
    const problem = await checkRecipientDomains(addresses, {
      enabled: settings.checkRecipientDomains !== false,
      // Unset: test domains are allowed outside production (development
      // hosts), rejected in production.
      allowReserved:
        typeof settings.allowReservedRecipientDomains === 'boolean'
          ? settings.allowReservedRecipientDomains
          : process.env.NODE_ENV !== 'production',
      verifyMx: settings.verifyRecipientMx === true,
    });
    if (problem) {
      const error = validationError(
        problem.code === 'RECIPIENT_DOMAIN_TYPO'
          ? `The recipient domain looks like a typo of ${problem.suggestion}`
          : 'The recipient domain can not receive email',
        problem.code
      );
      error.code = problem.code;
      error.details = {
        reason: problem.code,
        ...(problem.suggestion ? { suggestion: problem.suggestion } : {}),
      };
      throw error;
    }
    if (settings.suppressHardBounces === true) {
      const monitor = strapi.plugin('magic-mail').service('bounce-monitor');
      for (const address of addresses.slice(0, 200)) {
        if (await monitor.isSuppressed(address)) {
          const error = validationError(
            'A recipient is on the suppression list after a hard bounce',
            'MAGIC_MAIL_RECIPIENT_SUPPRESSED'
          );
          error.code = 'MAGIC_MAIL_RECIPIENT_SUPPRESSED';
          throw error;
        }
      }
    }
  },

  /**
   * Bare, lower-cased recipient addresses (used by the queue for hashing).
   * @param {*} value
   * @returns {string[]}
   */
  listRecipientAddresses(value) {
    return listAddresses(value);
  },

  /**
   * Validation error in the router's format (MAGIC_MAIL_VALIDATION).
   * @param {string} message
   * @param {string} [reason]
   * @returns {Error}
   */
  createValidationError(message, reason) {
    return validationError(message, reason);
  },

  /**
   * Renders the requested template and records its identity on `data`.
   * @param {object} data - Working copy (mutated)
   * @returns {Promise<object>} Rendered template
   */
  async renderTemplateFor(data) {
    try {
      let referenceId = data.templateReferenceId ? String(data.templateReferenceId).trim() : null;
      let templateRecord = null;

      if (!referenceId && data.templateId) {
        const numericTemplateId = Number(data.templateId);
        if (Number.isInteger(numericTemplateId)) {
          templateRecord = await strapi
            .plugin('magic-mail')
            .service('email-designer')
            .findOne(numericTemplateId);
          if (!templateRecord) throw new Error(`Template with ID ${numericTemplateId} not found`);
          if (!templateRecord.templateReferenceId) {
            throw new Error(`Template ${numericTemplateId} has no reference ID set`);
          }
          referenceId = String(templateRecord.templateReferenceId).trim();
        } else {
          referenceId = String(data.templateId).trim();
        }
      }
      if (!referenceId) throw new Error('No template reference ID could be resolved');

      const rendered = await strapi
        .plugin('magic-mail')
        .service('email-designer')
        .renderTemplate(referenceId, {
          ...(data.templateData && typeof data.templateData === 'object' ? data.templateData : {}),
          // Server-owned {{system.*}} merge tags; callers cannot override them.
          system: await this.systemMergeTagsFor(data),
        });

      data.templateReferenceId = referenceId;
      if (!data.templateName) data.templateName = templateRecord?.name || rendered.templateName;
      strapi.log.debug('[magic-mail] [EMAIL] Template rendered');
      return { ...rendered, templateReferenceId: referenceId };
    } catch (error) {
      strapi.log.error(`[magic-mail] [ERROR] Template rendering failed: ${error?.name || 'Error'}`);
      throw new Error(`Template rendering failed: ${error.message}`, { cause: error });
    }
  },

  /**
   * Values for the `{{system.*}}` template merge tags (date, year,
   * unsubscribe, webview). `system.unsubscribe` is the per-email
   * `unsubscribeUrl` or the plugin-wide unsubscribe URL, with `{{email}}`
   * replaced for single-recipient mails; empty when none is usable.
   *
   * @param {object} data - Working copy of the email
   * @returns {Promise<{date: string, year: string, unsubscribe: string, webview: string}>}
   */
  async systemMergeTagsFor(data) {
    let settings;
    try {
      settings = (await strapi.plugin('magic-mail').service('plugin-settings').getSettings()) || {};
    } catch {
      settings = {};
    }
    const unsubscribeUrl = resolveUnsubscribeUrl({
      ...data,
      unsubscribeUrl: data.unsubscribeUrl || settings.unsubscribeUrl || null,
    });
    const analyticsService = strapi.plugin('magic-mail').service('analytics');
    if (analyticsService && typeof analyticsService.buildSystemMergeTags === 'function') {
      return analyticsService.buildSystemMergeTags({ unsubscribeUrl });
    }
    const now = new Date();
    return {
      date: now.toISOString().slice(0, 10),
      year: String(now.getUTCFullYear()),
      unsubscribe: unsubscribeUrl || '',
      webview: '',
    };
  },

  /**
   * Creates the pending delivery log. A logging failure never blocks sending.
   * @returns {Promise<object|null>}
   */
  async createDeliveryLog(data, renderedTemplate, source) {
    try {
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      return await analyticsService.createEmailLog({
        to: data.to,
        userId: data.userId || null,
        recipientName: data.recipientName || null,
        subject: data.subject,
        templateId: data.templateId || null,
        templateReferenceId:
          data.templateReferenceId || renderedTemplate?.templateReferenceId || null,
        templateName: data.templateName || renderedTemplate?.templateName || null,
        accountId: null,
        accountName: null,
        messageIdLocal: data.__messageIdLocal,
        metadata: {
          type: data.type,
          priority: data.priority,
          hasAttachments: data.attachments.length > 0,
          tracking: data.enableTracking !== false && Boolean(data.html),
          source,
        },
      });
    } catch (error) {
      strapi.log.warn(
        `[magic-mail] Delivery log could not be created; sending without it: ${error?.name || 'Error'}`
      );
      return null;
    }
  },

  /**
   * Injects the open pixel and rewrites links (subject to global settings).
   * @returns {Promise<string>} Tracked HTML (original HTML on failure)
   */
  async applyTracking(data, emailLog, pluginSettings) {
    let html = data.html;
    try {
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      const recipientHash = analyticsService.generateRecipientHash(emailLog.emailId, data.to);

      const openTracking = pluginSettings.enableOpenTracking !== false;
      const linkTracking = pluginSettings.enableLinkTracking !== false && !data.skipLinkTracking;

      if (typeof analyticsService.addTracking === 'function') {
        // One resolved public URL for pixel and links; without a public URL the
        // mail is sent untracked (never pointing at localhost in production).
        return await analyticsService.addTracking(html, emailLog.emailId, recipientHash, {
          openTracking,
          linkTracking,
          settings: pluginSettings,
        });
      }
      if (openTracking)
        html = analyticsService.injectTrackingPixel(html, emailLog.emailId, recipientHash);
      if (linkTracking)
        html = await analyticsService.rewriteLinksForTracking(
          html,
          emailLog.emailId,
          recipientHash
        );
      return html;
    } catch (error) {
      strapi.log.error(
        `[magic-mail] [WARNING] Tracking setup failed; continuing without tracking: ${error?.name || 'Error'}`
      );
      return data.html;
    }
  },

  /**
   * Updates the delivery log (best effort, never throws).
   */
  async markLog(emailLog, fields, routingInfo = {}) {
    if (!emailLog?.documentId) return;
    try {
      const metadata =
        emailLog.metadata && typeof emailLog.metadata === 'object' ? emailLog.metadata : {};
      const extra = {};
      if (routingInfo.attempted?.length) extra.attemptedAccounts = [...routingInfo.attempted];
      if (routingInfo.skipped?.length) extra.skippedAccounts = [...routingInfo.skipped];
      if (routingInfo.fallback) extra.fallback = routingInfo.fallback;
      if (routingInfo.queue) extra.queue = { ...(metadata.queue || {}), ...routingInfo.queue };
      await strapi.documents(EMAIL_LOG_UID).update({
        documentId: emailLog.documentId,
        data: Object.keys(extra).length
          ? { ...fields, metadata: { ...metadata, ...extra } }
          : fields,
      });
    } catch (error) {
      strapi.log.error(
        `[magic-mail] [RECONCILE] Email log update failed: ${error?.name || 'Error'}`
      );
    }
  },

  /**
   * Picks accounts in routing order and dispatches. Quota is reserved
   * atomically per candidate; errors that guarantee non-acceptance move on to
   * the next candidate. An explicitly requested account is never replaced.
   *
   * @param {object} data - Validated working copy
   * @param {object} ctx - Options plus `attempted`/`skipped` collectors
   * @returns {Promise<{account: object, result: object}>}
   */
  async routeAndDispatch(data, ctx) {
    const explicitAccount = await this.resolveExplicitAccount(data, ctx);
    const explicit = explicitAccount !== undefined;
    const excluded = [];
    let lastError = null;

    // Queue retries prefer another account than the one that failed last,
    // but still use it when it is the only one.
    let softExclude = explicit
      ? []
      : (Array.isArray(ctx.softExclude) ? ctx.softExclude : []).filter(Boolean);
    const dispatchOptions =
      ctx.bounded || ctx.trackOutcome
        ? {
            bounded: ctx.bounded === true,
            trackOutcome: ctx.trackOutcome === true,
            // Queue sends: re-checks the outbox claim right before a provider
            // request that followed a slow step (OAuth token refresh).
            ...(typeof ctx.confirmClaim === 'function' ? { confirmClaim: ctx.confirmClaim } : {}),
          }
        : null;

    for (let index = 0; index < MAX_ROUTING_CANDIDATES; index += 1) {
      let account;
      if (explicit) {
        account = index === 0 ? explicitAccount : null;
      } else {
        account = await this.selectAccount(
          data.type,
          data.priority,
          [...excluded, ...softExclude],
          data
        );
        if (!account && softExclude.length > 0) {
          softExclude = [];
          account = await this.selectAccount(data.type, data.priority, [...excluded], data);
        }
      }
      if (!account || (account.documentId && excluded.includes(account.documentId))) break;
      excluded.push(account.documentId);

      const reservation = await this.reserveQuota(account);
      if (!reservation) {
        ctx.skipped.push(account.name);
        continue;
      }

      const { sender, rejected } = resolveSender(account, data.from, ctx.defaultFromName);
      if (rejected) {
        const message =
          '[magic-mail] Rejected from-override that does not match the sending account; using the account address';
        if (ctx.source === 'strapi-email') strapi.log.debug(message);
        else strapi.log.warn(message);
      }
      const attempt = { ...data, from: sender };
      if (dispatchOptions) attempt.__dispatch = dispatchOptions;

      if (typeof ctx.onBeforeDispatch === 'function') {
        try {
          await ctx.onBeforeDispatch(account);
        } catch (error) {
          if (reservation === 'reserved') await this.releaseQuota(account);
          throw error;
        }
      }

      ctx.attempted.push(account.name);
      ctx.lastAccountDocumentId = account.documentId;
      try {
        const result = await this.sendViaAccount(account, attempt);
        try {
          await this.updateAccountStats(account.documentId, {
            countersReserved: reservation === 'reserved',
          });
        } catch (error) {
          strapi.log.error(
            `[magic-mail] [RECONCILE] Account stats update failed (message already accepted): ${error?.name || 'Error'}`
          );
        }
        return { account, result };
      } catch (error) {
        // Mark errors raised by the provider adapter: only those say anything
        // about delivery (queue.js treats any other error after dispatch as
        // ambiguous).
        tagProviderError(error);
        if (reservation === 'reserved') await this.releaseQuota(account);
        lastError = error;
        // Inline and queue sends fail over only on proven non-acceptance
        // (failoverAllowed). Ambiguous errors stop here: that provider may
        // have accepted the message, and another account would duplicate it.
        const canFailover = isSafeToRetry(error);
        if (!explicit && canFailover && Array.isArray(ctx.attemptOutcomes)) {
          ctx.attemptOutcomes.push(classifyDeliveryError(error));
        }
        if (!explicit && canFailover) {
          strapi.log.warn(
            `[magic-mail] [FAILOVER] Account could not send; trying the next account: ${error?.name || 'Error'} (${sanitizeErrorCode(error)})`
          );
          continue;
        }
        throw error;
      }
    }

    if (lastError) throw lastError;

    if (ctx.skipped.length > 0) {
      const error = new Error(
        explicit
          ? 'The requested email account is over its sending quota'
          : 'All eligible email accounts are over their sending quota'
      );
      error.code = 'MAGIC_MAIL_QUOTA_EXHAUSTED';
      if (explicit) error.code = 'MAGIC_MAIL_ACCOUNT_QUOTA';
      throw error;
    }

    const error = new Error('No email account available');
    error.code = 'MAGIC_MAIL_NO_ACCOUNT';
    throw error;
  },

  /**
   * Resolves an explicitly requested account (accountDocumentId option or
   * accountName). Returns undefined when routing should choose.
   *
   * @returns {Promise<object|undefined>}
   * @throws {Error} When the requested account does not exist or is inactive
   */
  async resolveExplicitAccount(data, ctx) {
    if (ctx.accountDocumentId) {
      const account = await strapi
        .documents(EMAIL_ACCOUNT_UID)
        .findOne({ documentId: ctx.accountDocumentId });
      if (!account || (!account.isActive && ctx.allowInactive !== true)) {
        const error = new Error('The requested email account is not available');
        error.code = 'MAGIC_MAIL_ACCOUNT_UNAVAILABLE';
        throw error;
      }
      return account;
    }
    if (data.accountName) {
      const account = await this.getAccountByName(data.accountName);
      if (!account) {
        const error = new Error('The requested email account is not available');
        error.code = 'MAGIC_MAIL_ACCOUNT_UNAVAILABLE';
        throw error;
      }
      return account;
    }
    return undefined;
  },

  /**
   * Select the best account based on routing rules.
   * @param {string} type - Email type (transactional, marketing, notification)
   * @param {string} priority - Priority level (high, normal, low)
   * @param {Array<string>} excludeDocumentIds - Accounts to skip
   * @param {Object} emailData - Email data for routing rule matching
   * @returns {Promise<Object|null>} Selected account or null
   */
  async selectAccount(type, priority, excludeDocumentIds = [], emailData = {}) {
    const filters = { isActive: true };
    if (excludeDocumentIds.length > 0) {
      filters.documentId = { $notIn: excludeDocumentIds };
    }

    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      filters,
      sort: [{ priority: 'desc' }],
    });
    if (!accounts || accounts.length === 0) return null;

    // Same order as GET /routing-rules (the admin list), so rules with equal
    // priority are evaluated in the order shown: oldest rule first.
    const allRules = await strapi.documents(ROUTING_RULE_UID).findMany({
      filters: { isActive: true },
      sort: routingRuleEvaluationSort(),
    });

    const byName = (name) => {
      const wanted = String(name || '').toLowerCase();
      return wanted
        ? accounts.find((a) => String(a.name || '').toLowerCase() === wanted)
        : undefined;
    };

    for (const rule of allRules || []) {
      if (!this.ruleMatches(rule, type, emailData)) continue;

      const account = byName(rule.accountName);
      if (account) {
        strapi.log.debug('[magic-mail] [ROUTE] Email routing rule matched');
        return account;
      }
      const fallbackAccount = byName(rule.fallbackAccountName);
      if (fallbackAccount) {
        strapi.log.debug('[magic-mail] [FALLBACK] Using the rule fallback account');
        return fallbackAccount;
      }
    }

    return accounts.find((a) => a.isPrimary) || accounts[0];
  },

  /**
   * Evaluates one routing rule against the email.
   *
   * Recipient rules: a value starting with `@` matches any recipient whose
   * address ends with it, a value containing `@` matches an exact address,
   * any other value matches recipients whose address contains it.
   *
   * @param {object} rule
   * @param {string} type
   * @param {object} emailData
   * @returns {boolean}
   */
  ruleMatches(rule, type, emailData = {}) {
    const value = String(rule.matchValue ?? '').trim();
    if (!value) return false;
    const lowerValue = value.toLowerCase();

    switch (rule.matchType) {
      case 'emailType':
        return value === type;
      case 'recipient': {
        const recipients = listAddresses(emailData.to);
        if (lowerValue.startsWith('@')) return recipients.some((r) => r.endsWith(lowerValue));
        if (lowerValue.includes('@')) return recipients.some((r) => r === lowerValue);
        return recipients.some((r) => r.includes(lowerValue));
      }
      case 'subject':
        return (
          typeof emailData.subject === 'string' &&
          emailData.subject.toLowerCase().includes(lowerValue)
        );
      case 'template':
        return (
          Boolean(emailData.templateName && emailData.templateName === value) ||
          Boolean(emailData.templateReferenceId && String(emailData.templateReferenceId) === value)
        );
      case 'custom':
        return (
          emailData.customField !== undefined &&
          emailData.customField !== null &&
          String(emailData.customField) === value
        );
      default:
        return false;
    }
  },

  /**
   * Pins `from` to the account address (compatibility helper). Prefer the
   * routing pipeline, which applies the same rule per attempt.
   *
   * @param {object} account
   * @param {object} emailData - mutated in place
   */
  enforceFromAlignment(account, emailData) {
    const { sender, rejected } = resolveSender(account, emailData.from);
    if (rejected) {
      strapi.log.warn(
        '[magic-mail] Rejected from-override that does not match the sending account; using the account address'
      );
    }
    emailData.from = sender;
  },

  /**
   * Dispatches through one account and records the result (compatibility
   * helper for callers that already picked an account).
   */
  async dispatchAndRecord(account, emailData, emailLog) {
    const result = await this.sendViaAccount(account, emailData);
    await this.markLog(emailLog, {
      accountId: account.documentId,
      accountName: account.name,
      deliveredAt: new Date(),
      deliveryStatus: 'sent',
    });
    try {
      await this.updateAccountStats(account.documentId);
    } catch (error) {
      strapi.log.error(
        `[magic-mail] [RECONCILE] Account stats update failed (message already accepted): ${error?.name || 'Error'}`
      );
    }
    return { success: true, accountUsed: account.name, messageId: result.messageId };
  },

  async sendViaAccount(account, emailData) {
    if (account.provider === 'gmail-oauth') return this.sendViaGmailOAuth(account, emailData);
    if (account.provider === 'microsoft-oauth')
      return this.sendViaMicrosoftOAuth(account, emailData);
    if (account.provider === 'yahoo-oauth') return this.sendViaYahooOAuth(account, emailData);
    if (account.provider === 'nodemailer' || account.provider === 'smtp')
      return this.sendViaSMTP(account, emailData);
    if (account.provider === 'sendgrid') return this.sendViaSendGrid(account, emailData);
    if (account.provider === 'mailgun') return this.sendViaMailgun(account, emailData);
    throw accountConfigError(`Unsupported provider: ${account.provider}`);
  },

  /**
   * Send via SMTP (Nodemailer). TLS is required and certificates are
   * verified. A per-account `allowInsecure: true` config flag disables both
   * for local mail catchers; it is honoured only outside production or for
   * loopback hosts.
   */
  async sendViaSMTP(account, emailData) {
    this.validateEmailSecurity(emailData);

    const config = readAccountSecret(account.config);
    const allowInsecure =
      config.allowInsecure === true &&
      (process.env.NODE_ENV !== 'production' || isLoopbackHost(config.host));
    if (allowInsecure) {
      strapi.log.warn(
        '[magic-mail] SMTP account uses an insecure (non-TLS) connection; use only for local testing'
      );
    }

    const transportConfig = {
      host: config.host,
      port: config.port || 587,
      secure: config.secure || false,
      ...(config.user || config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
      requireTLS: !allowInsecure,
      tls: {
        rejectUnauthorized: !allowInsecure,
        minVersion: 'TLSv1.2',
      },
      disableFileAccess: true,
      disableUrlAccess: true,
    };
    const dispatch = emailData.__dispatch || {};
    if (dispatch.bounded) Object.assign(transportConfig, BOUNDED_SMTP_TIMEOUTS);
    // A private logger records whether the server answered DATA (354), so a
    // dropped connection can be told apart before and after the message was
    // handed over. It keeps booleans only; the transaction text is never stored.
    const smtpProbe = dispatch.trackOutcome ? createSmtpProbe() : null;
    if (smtpProbe) {
      transportConfig.logger = smtpProbe.logger;
      transportConfig.transactionLog = true;
    }

    if (config.dkim) {
      transportConfig.dkim = {
        domainName: config.dkim.domainName,
        keySelector: config.dkim.keySelector,
        privateKey: config.dkim.privateKey,
      };
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const replyTo = resolveReplyTo(emailData.replyTo || account.replyTo);
    const headers = {
      ...buildOutboundHeaders(emailData),
      'X-Content-Type-Options': 'nosniff',
      'X-Entity-Ref-ID': `magicmail-${Date.now()}`,
    };
    const attachments = toNodemailerAttachments(emailData.attachments);

    const mailOptions = {
      from: senderFor(account, emailData),
      to: emailData.to,
      ...(emailData.cc && { cc: emailData.cc }),
      ...(emailData.bcc && { bcc: emailData.bcc }),
      ...(replyTo && { replyTo }),
      subject: stripHeaderInjection(emailData.subject),
      text: emailData.text,
      html: emailData.html,
      attachments,
      disableFileAccess: true,
      disableUrlAccess: true,
      date: new Date(),
      messageId: createMessageId(account, emailData.__messageIdLocal),
      headers,
      encoding: 'utf-8',
      textEncoding: 'base64',
    };

    if (!smtpProbe) return transporter.sendMail(mailOptions);
    try {
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      throw tagSmtpStage(error, smtpProbe.probe);
    }
  },

  /**
   * Returns a usable OAuth access token for the account (FUN-15).
   *
   * - Refreshes when the token expires within OAUTH_EXPIRY_SKEW_MS, or when
   *   `force` is set (after the provider answered 401).
   * - Persists the full token set through oauth.buildOAuthBlob, so a rotated
   *   refresh token (Microsoft, Yahoo) is stored and the old one is kept when
   *   the provider returns none.
   * - Concurrent sends of one account share a single refresh request; parallel
   *   refreshes would race and could invalidate each other's refresh token.
   *
   * @param {object} account - Account entity (needs documentId)
   * @param {object} oauth - Decrypted oauth blob; updated in place on refresh
   * @param {() => Promise<{accessToken: string, refreshToken?: string, expiresAt: Date|string}>} refresh
   * @param {{force?: boolean}} [options]
   * @returns {Promise<string>} Current access token
   */
  async currentOAuthToken(account, oauth, refresh, { force = false } = {}) {
    if (!force) {
      if (!oauth.expiresAt) return oauth.accessToken;
      const expiresAt = new Date(oauth.expiresAt).getTime();
      if (Number.isFinite(expiresAt) && expiresAt - OAUTH_EXPIRY_SKEW_MS > Date.now())
        return oauth.accessToken;
    }
    if (!oauth.refreshToken) {
      throw accountConfigError(
        'Access token expired and no refresh token available. Please re-authenticate.'
      );
    }

    const key = account.documentId || account.id;
    const pending = oauthRefreshes.get(key);
    if (pending) {
      const tokens = await pending;
      Object.assign(oauth, tokens);
      return tokens.accessToken;
    }

    const isFresh = (blob) => {
      if (!blob || !blob.accessToken) return false;
      if (!blob.expiresAt) return true;
      const expiry = new Date(blob.expiresAt).getTime();
      return Number.isFinite(expiry) && expiry - OAUTH_EXPIRY_SKEW_MS > Date.now();
    };
    const rejectedToken = force ? oauth.accessToken : null;

    // Cross-process: one refresh per account at a time (database lease).
    // After acquiring the lease the stored blob is read again: another
    // replica or worker may have refreshed already (then its token is used),
    // or rotated the refresh token (then the newest one is used).
    const refreshLocked = async () => {
      const stored = await this.readStoredOAuth(account.documentId);
      if (stored) {
        if (isFresh(stored) && stored.accessToken !== rejectedToken) {
          return {
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken || oauth.refreshToken,
            expiresAt: stored.expiresAt,
          };
        }
        Object.assign(oauth, stored);
      }
      return refreshAndStore();
    };

    const refreshAndStore = async () => {
      try {
        const newTokens = await refresh();
        const oauthService = strapi.plugin('magic-mail').service('oauth');
        let blob;
        if (oauthService && typeof oauthService.buildOAuthBlob === 'function') {
          blob = oauthService.buildOAuthBlob(oauth, newTokens);
        } else {
          const { encryptCredentials } = require('../utils/encryption');
          blob = encryptCredentials({
            ...oauth,
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken || oauth.refreshToken,
            expiresAt: newTokens.expiresAt,
          });
        }
        await strapi
          .documents(EMAIL_ACCOUNT_UID)
          .update({ documentId: account.documentId, data: { oauth: blob } });
        return {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken || oauth.refreshToken,
          expiresAt: newTokens.expiresAt,
        };
      } catch (refreshErr) {
        strapi.log.error(`[magic-mail] Token refresh failed: ${refreshErr?.name || 'Error'}`);
        throw accountConfigError(
          'Access token expired and refresh failed. Please re-authenticate this account.'
        );
      }
    };

    const run = (async () => {
      try {
        return await coordination.withLease(
          strapi,
          `oauth-refresh:${account.documentId || key}`,
          refreshLocked,
          { ttlMs: 60_000, waitMs: 20_000 }
        );
      } catch (error) {
        if (!(error instanceof coordination.LeaseTimeoutError)) throw error;
        // Another process is still refreshing: use its result when stored.
        const stored = await this.readStoredOAuth(account.documentId);
        if (isFresh(stored) && stored.accessToken !== rejectedToken) {
          return {
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken || oauth.refreshToken,
            expiresAt: stored.expiresAt,
          };
        }
        throw accountConfigError(
          'Access token refresh is in progress on another instance. Please retry shortly.'
        );
      }
    })();
    oauthRefreshes.set(key, run);
    try {
      const tokens = await run;
      Object.assign(oauth, tokens);
      return tokens.accessToken;
    } finally {
      oauthRefreshes.delete(key);
    }
  },

  /**
   * Reads and decrypts the stored `oauth` blob of an account. Only used when
   * a database connection exists (several processes may share the account).
   *
   * @param {string} documentId
   * @returns {Promise<object|null>}
   */
  async readStoredOAuth(documentId) {
    if (!documentId || !coordination.getDb(strapi)) return null;
    try {
      const row = await strapi
        .documents(EMAIL_ACCOUNT_UID)
        .findOne({ documentId, fields: ['oauth'] });
      if (!row || !row.oauth) return null;
      return decryptCredentials(row.oauth) || null;
    } catch {
      return null;
    }
  },

  /**
   * Queue sends: confirms (and extends) the outbox claim before a provider
   * request. A lost claim throws MAGIC_MAIL_LEASE_LOST, so a process whose
   * lease expired during a slow token refresh never sends. Any other error
   * here happened before the provider was contacted.
   *
   * @param {object|null} dispatch - `emailData.__dispatch`
   * @returns {Promise<void>}
   * @throws {Error} MAGIC_MAIL_LEASE_LOST, or a pre-dispatch tagged error
   */
  async confirmDispatchClaim(dispatch) {
    if (typeof dispatch?.confirmClaim !== 'function') return;
    try {
      await dispatch.confirmClaim();
    } catch (error) {
      if (error?.code === 'MAGIC_MAIL_LEASE_LOST') throw error;
      throw tagPreDispatch(error);
    }
  },

  /**
   * Runs an OAuth send and, when the provider rejects the access token
   * (HTTP 401 or SMTP EAUTH), refreshes it once and retries. A rejected token
   * guarantees the message was not accepted, so the retry cannot duplicate it.
   *
   * @param {object} account
   * @param {object} oauth
   * @param {() => Promise<object>} refresh
   * @param {(accessToken: string) => Promise<object>} send
   * @param {object} [dispatch] - `emailData.__dispatch` (queue: `confirmClaim`)
   * @returns {Promise<object>}
   */
  async withOAuthRetry(account, oauth, refresh, send, dispatch = null) {
    let accessToken;
    try {
      accessToken = await this.currentOAuthToken(account, oauth, refresh);
    } catch (error) {
      // Token refresh failed: nothing was sent.
      throw tagPreDispatch(error);
    }
    await this.confirmDispatchClaim(dispatch);
    try {
      return await send(accessToken);
    } catch (error) {
      const rejectedToken =
        error?.status === 401 || error?.code === 'EAUTH' || error?.responseCode === 535;
      if (!rejectedToken || !oauth.refreshToken) throw error;
      strapi.log.warn('[magic-mail] OAuth access token rejected; refreshing once and retrying');
      let renewed;
      try {
        renewed = await this.currentOAuthToken(account, oauth, refresh, { force: true });
      } catch (refreshError) {
        throw tagPreDispatch(refreshError);
      }
      await this.confirmDispatchClaim(dispatch);
      return send(renewed);
    }
  },

  /** Send via the Gmail API (raw MIME). */
  async sendViaGmailOAuth(account, emailData) {
    if (!account.oauth) {
      throw accountConfigError(
        'Gmail OAuth account not fully configured. Please complete the OAuth flow first.'
      );
    }
    const oauth = readAccountSecret(account.oauth);
    const config = readAccountSecret(account.config);
    if (!oauth.email || !oauth.accessToken) {
      throw accountConfigError('Missing OAuth credentials. Please re-authenticate this account.');
    }
    if (!config.clientId || !config.clientSecret) {
      throw accountConfigError('Missing OAuth client credentials.');
    }

    this.validateEmailSecurity(emailData);

    const refresh = () =>
      strapi
        .plugin('magic-mail')
        .service('oauth')
        .refreshGmailTokens(
          oauth.refreshToken,
          config.clientId,
          config.clientSecret,
          oauthRefreshBounds(emailData)
        );

    const rawMessage = await buildRawMimeMessage(account, emailData);
    return this.withOAuthRetry(
      account,
      oauth,
      refresh,
      (accessToken) => this.postGmailMessage(accessToken, rawMessage, fetchBounds(emailData)),
      emailData.__dispatch
    );
  },

  /** One Gmail API send request. */
  async postGmailMessage(accessToken, rawMessage, bounds = {}) {
    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        ...bounds,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawMessage.toString('base64url') }),
      });

      if (!response.ok) {
        strapi.log.error(`[magic-mail] Gmail API request failed: ${response.status}`);
        throw providerHttpError('Gmail', response.status);
      }

      const result = await response.json();
      return { messageId: result.id, response: 'OK' };
    } catch (err) {
      strapi.log.error(`[magic-mail] Gmail API send failed: ${err?.name || 'Error'}`);
      throw err;
    }
  },

  /** Send via Microsoft Graph (MIME). */
  async sendViaMicrosoftOAuth(account, emailData) {
    if (!account.oauth) {
      throw accountConfigError(
        'Microsoft OAuth account not fully configured. Please complete the OAuth flow first.'
      );
    }
    const oauth = readAccountSecret(account.oauth);
    const config = readAccountSecret(account.config);
    if (!oauth.email || !oauth.accessToken) {
      throw accountConfigError('Missing OAuth credentials. Please re-authenticate this account.');
    }
    if (!config.clientId || !config.clientSecret) {
      throw accountConfigError('Missing OAuth client credentials.');
    }

    this.validateEmailSecurity(emailData);

    const refresh = () => {
      if (!config.tenantId) {
        throw new Error('Tenant ID not found in config. Please re-configure this account.');
      }
      return strapi
        .plugin('magic-mail')
        .service('oauth')
        .refreshMicrosoftTokens(
          oauth.refreshToken,
          config.clientId,
          config.clientSecret,
          config.tenantId,
          // Keep Mail.Read (bounce monitoring) in refreshed access tokens.
          { ...oauthRefreshBounds(emailData), grantedScope: oauth.scope }
        );
    };

    const rawMessage = await buildRawMimeMessage(account, emailData);
    return this.withOAuthRetry(
      account,
      oauth,
      refresh,
      (accessToken) => this.postGraphMessage(accessToken, rawMessage, fetchBounds(emailData)),
      emailData.__dispatch
    );
  },

  /** One Microsoft Graph sendMail request. */
  async postGraphMessage(accessToken, rawMessage, bounds = {}) {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        ...bounds,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'text/plain',
        },
        body: rawMessage.toString('base64'),
      });

      // Microsoft Graph returns 202 Accepted on success, with no body and no
      // message id. Report none rather than a synthetic id that no delivery
      // event could ever match.
      if (response.status !== 202) {
        strapi.log.error(`[magic-mail] Microsoft Graph response status: ${response.status}`);
        throw providerHttpError('Microsoft Graph', response.status);
      }

      return { messageId: null, response: 'Accepted' };
    } catch (err) {
      strapi.log.error(`[magic-mail] Microsoft Graph API send failed: ${err?.name || 'Error'}`);
      throw err;
    }
  },

  /** Send via Yahoo SMTP with XOAUTH2. */
  async sendViaYahooOAuth(account, emailData) {
    if (!account.oauth) {
      throw accountConfigError(
        'Yahoo OAuth account not fully configured. Please complete the OAuth flow first.'
      );
    }
    const oauth = readAccountSecret(account.oauth);
    const config = readAccountSecret(account.config);
    if (!oauth.email || !oauth.accessToken) {
      throw accountConfigError('Missing OAuth credentials. Please re-authenticate this account.');
    }

    this.validateEmailSecurity(emailData);

    const refresh = () =>
      strapi
        .plugin('magic-mail')
        .service('oauth')
        .refreshYahooTokens(
          oauth.refreshToken,
          config.clientId,
          config.clientSecret,
          oauthRefreshBounds(emailData)
        );

    return this.withOAuthRetry(
      account,
      oauth,
      refresh,
      (accessToken) => this.sendYahooMessage(account, oauth, emailData, accessToken),
      emailData.__dispatch
    );
  },

  /** One Yahoo SMTP XOAUTH2 send. */
  async sendYahooMessage(account, oauth, emailData, accessToken) {
    try {
      const dispatch = emailData.__dispatch || {};
      const smtpProbe = dispatch.trackOutcome ? createSmtpProbe() : null;
      const transporter = nodemailer.createTransport({
        host: 'smtp.mail.yahoo.com',
        port: 465,
        secure: true,
        auth: { type: 'OAuth2', user: oauth.email, accessToken },
        disableFileAccess: true,
        disableUrlAccess: true,
        ...(dispatch.bounded ? BOUNDED_SMTP_TIMEOUTS : {}),
        ...(smtpProbe ? { logger: smtpProbe.logger, transactionLog: true } : {}),
      });

      const replyTo = resolveReplyTo(emailData.replyTo || account.replyTo);
      const mailOptions = {
        from: senderFor(account, emailData),
        to: emailData.to,
        ...(emailData.cc && { cc: emailData.cc }),
        ...(emailData.bcc && { bcc: emailData.bcc }),
        ...(replyTo && { replyTo }),
        subject: stripHeaderInjection(emailData.subject),
        text: emailData.text,
        html: emailData.html,
        attachments: toNodemailerAttachments(emailData.attachments),
        disableFileAccess: true,
        disableUrlAccess: true,
        headers: buildOutboundHeaders(emailData),
        messageId: createMessageId(account, emailData.__messageIdLocal),
        date: new Date(),
      };

      let result;
      try {
        result = await transporter.sendMail(mailOptions);
      } catch (error) {
        throw smtpProbe ? tagSmtpStage(error, smtpProbe.probe) : error;
      }
      return { messageId: result.messageId, response: result.response };
    } catch (err) {
      strapi.log.error(`[magic-mail] Yahoo OAuth send failed: ${err?.name || 'Error'}`);
      throw err;
    }
  },

  /** Send via the SendGrid v3 API. */
  async sendViaSendGrid(account, emailData) {
    const config = readAccountSecret(account.config);
    if (!config.apiKey) throw accountConfigError('SendGrid API key not configured');

    this.validateEmailSecurity(emailData);

    try {
      const toRecipientList = (value) => listAddresses(value).map((email) => ({ email }));

      const personalization = { to: toRecipientList(emailData.to) };
      if (personalization.to.length === 0) {
        throw validationError('SendGrid send requires at least one valid recipient');
      }
      const ccRecipients = toRecipientList(emailData.cc);
      if (ccRecipients.length > 0) personalization.cc = ccRecipients;
      const bccRecipients = toRecipientList(emailData.bcc);
      if (bccRecipients.length > 0) personalization.bcc = bccRecipients;

      const sender = senderFor(account, emailData);
      const msg = {
        personalizations: [personalization],
        from: { email: sender.address, ...(sender.name ? { name: sender.name } : {}) },
        subject: stripHeaderInjection(emailData.subject),
        content: [
          ...(emailData.text ? [{ type: 'text/plain', value: emailData.text }] : []),
          ...(emailData.html ? [{ type: 'text/html', value: emailData.html }] : []),
        ],
        // SendGrid v3 uses snake_case `custom_args`.
        custom_args: {
          magicmail_version: '1.0',
          email_type: emailData.type || 'transactional',
          priority: emailData.priority || 'normal',
        },
        headers: buildOutboundHeaders(emailData),
      };

      const replyTo = resolveReplyTo(emailData.replyTo || account.replyTo);
      if (replyTo && replyTo.length === 1) {
        msg.reply_to = {
          email: replyTo[0].address,
          ...(replyTo[0].name ? { name: replyTo[0].name } : {}),
        };
      } else if (replyTo) {
        msg.reply_to_list = replyTo.map((entry) => ({
          email: entry.address,
          ...(entry.name ? { name: entry.name } : {}),
        }));
      }

      const attachments = normalizeAttachments(emailData.attachments);
      if (attachments.length > 0) {
        msg.attachments = attachments.map((attachment) => ({
          content: attachment.content.toString('base64'),
          filename: attachment.filename || attachment.cid,
          type: attachment.contentType,
          disposition: attachment.cid ? 'inline' : 'attachment',
          ...(attachment.cid ? { content_id: attachment.cid } : {}),
        }));
      }

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        ...fetchBounds(emailData),
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(msg),
      });

      if (!response.ok) {
        strapi.log.error(`[magic-mail] SendGrid API request failed: ${response.status}`);
        throw providerHttpError('SendGrid', response.status);
      }

      return {
        // SendGrid's id; its webhooks report it as the `sg_message_id` prefix.
        messageId: normalizeMessageId(response.headers?.get?.('x-message-id')),
        response: 'Accepted',
      };
    } catch (err) {
      strapi.log.error(`[magic-mail] SendGrid send failed: ${err?.name || 'Error'}`);
      throw err;
    }
  },

  /** Send via the Mailgun API. */
  async sendViaMailgun(account, emailData) {
    const config = readAccountSecret(account.config);
    if (!config.apiKey || !config.domain) {
      throw accountConfigError('Mailgun API key and domain not configured');
    }
    const domain = String(config.domain).trim().toLowerCase();
    if (
      !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
        domain
      )
    ) {
      throw accountConfigError('Mailgun domain is not a valid host name');
    }
    const region = resolveMailgunRegion(config.region);
    if (!region) {
      throw accountConfigError('Mailgun region must be "us" or "eu"');
    }

    this.validateEmailSecurity(emailData);

    try {
      const form = new FormData();
      const joinAddrs = (value) => (Array.isArray(value) ? value.join(', ') : value);

      form.append('from', formatAddress(senderFor(account, emailData)));
      form.append('to', joinAddrs(emailData.to));
      if (emailData.cc) form.append('cc', joinAddrs(emailData.cc));
      if (emailData.bcc) form.append('bcc', joinAddrs(emailData.bcc));
      form.append('subject', stripHeaderInjection(emailData.subject));
      if (emailData.html) form.append('html', emailData.html);
      if (emailData.text) form.append('text', emailData.text);

      const replyTo = resolveReplyTo(emailData.replyTo || account.replyTo);
      if (replyTo) form.append('h:Reply-To', replyTo.map(formatAddress).join(', '));

      for (const [name, value] of Object.entries(buildOutboundHeaders(emailData))) {
        form.append(`h:${name}`, value);
      }

      for (const attachment of normalizeAttachments(emailData.attachments)) {
        form.append(
          attachment.cid ? 'inline' : 'attachment',
          new Blob([attachment.content], { type: attachment.contentType }),
          attachment.cid || attachment.filename
        );
      }

      // fetch derives the multipart boundary from the FormData body.
      const response = await fetch(
        `${mailgunApiBaseUrl(region)}/v3/${encodeURIComponent(domain)}/messages`,
        {
          ...fetchBounds(emailData),
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`,
          },
          body: form,
        }
      );

      if (!response.ok) {
        strapi.log.error(`[magic-mail] Mailgun API request failed: ${response.status}`);
        throw providerHttpError('Mailgun', response.status);
      }

      const result = await response.json();
      return {
        messageId: normalizeMessageId(result.id),
        response: result.message || 'Queued',
      };
    } catch (err) {
      strapi.log.error(`[magic-mail] Mailgun send failed: ${err?.name || 'Error'}`);
      throw err;
    }
  },

  /** @returns {string} Configured quota time zone (default UTC) */
  getQuotaTimeZone() {
    try {
      return strapi.config?.get?.('plugin::magic-mail.quotaTimezone', 'UTC') || 'UTC';
    } catch {
      return 'UTC';
    }
  },

  /**
   * Returns true if the account is within its quotas for the current
   * windows (read-only check, used when no database connection exists).
   */
  async checkRateLimits(account) {
    const keys = quotaWindowKeys(new Date(), this.getQuotaTimeZone());
    const sentToday = account.quotaDayKey === keys.day ? account.emailsSentToday || 0 : 0;
    const sentThisHour = account.quotaHourKey === keys.hour ? account.emailsSentThisHour || 0 : 0;
    if (account.dailyLimit > 0 && sentToday >= account.dailyLimit) return false;
    if (account.hourlyLimit > 0 && sentThisHour >= account.hourlyLimit) return false;
    return true;
  },

  /** @returns {{knex: Function, table: string}|null} */
  quotaTable() {
    try {
      const knex = strapi.db?.connection;
      const table = strapi.db?.metadata?.get(EMAIL_ACCOUNT_UID)?.tableName;
      return knex && table ? { knex, table } : null;
    } catch {
      return null;
    }
  },

  /**
   * Reserves one send from the account's hourly and daily quota with a single
   * conditional UPDATE, so concurrent sends cannot exceed a limit. Counters
   * of an expired window restart at 1.
   *
   * @param {object} account
   * @returns {Promise<'reserved'|'unchecked'|false>} false when over quota
   */
  async reserveQuota(account) {
    const db = this.quotaTable();
    if (!db) return (await this.checkRateLimits(account)) ? 'unchecked' : false;

    const { knex, table } = db;
    const keys = quotaWindowKeys(new Date(), this.getQuotaTimeZone());
    const affected = await knex(table)
      .where({ document_id: account.documentId })
      .andWhere((qb) =>
        qb
          .whereNull('daily_limit')
          .orWhere('daily_limit', '<=', 0)
          .orWhereNull('quota_day_key')
          .orWhere('quota_day_key', '<', keys.day)
          .orWhereRaw('COALESCE(emails_sent_today, 0) < daily_limit')
      )
      .andWhere((qb) =>
        qb
          .whereNull('hourly_limit')
          .orWhere('hourly_limit', '<=', 0)
          .orWhereNull('quota_hour_key')
          .orWhere('quota_hour_key', '<', keys.hour)
          .orWhereRaw('COALESCE(emails_sent_this_hour, 0) < hourly_limit')
      )
      // Counter assignments come before the key assignments: MySQL evaluates
      // SET left to right with already-updated values.
      .update(forwardOnlyQuotaUpdate(knex, keys));
    return affected > 0 ? 'reserved' : false;
  },

  /**
   * Returns a reservation after a failed dispatch.
   * @param {object} account
   */
  async releaseQuota(account) {
    const db = this.quotaTable();
    if (!db) return;
    try {
      const { knex, table } = db;
      const keys = quotaWindowKeys(new Date(), this.getQuotaTimeZone());
      await knex(table)
        .where({ document_id: account.documentId })
        .update({
          emails_sent_today: knex.raw(
            'CASE WHEN quota_day_key = ? AND emails_sent_today > 0 THEN emails_sent_today - 1 ELSE emails_sent_today END',
            [keys.day]
          ),
          emails_sent_this_hour: knex.raw(
            'CASE WHEN quota_hour_key = ? AND emails_sent_this_hour > 0 THEN emails_sent_this_hour - 1 ELSE emails_sent_this_hour END',
            [keys.hour]
          ),
        });
    } catch (error) {
      strapi.log.error(`[magic-mail] [RECONCILE] Quota release failed: ${error?.name || 'Error'}`);
    }
  },

  /**
   * Zeroes counters whose window has ended so the admin UI shows current
   * usage. Sending never depends on this (windows are evaluated lazily).
   */
  async refreshQuotaWindows() {
    const db = this.quotaTable();
    if (!db) return;
    const { knex, table } = db;
    const keys = quotaWindowKeys(new Date(), this.getQuotaTimeZone());
    // Forward only: a process whose clock lags never resets a window that
    // another process already opened.
    await knex(table)
      .where((qb) => qb.whereNull('quota_hour_key').orWhere('quota_hour_key', '<', keys.hour))
      .update({ emails_sent_this_hour: 0, quota_hour_key: keys.hour });
    await knex(table)
      .where((qb) => qb.whereNull('quota_day_key').orWhere('quota_day_key', '<', keys.day))
      .update({ emails_sent_today: 0, quota_day_key: keys.day });
  },

  /**
   * Records an accepted send. When the quota was reserved atomically only the
   * lifetime total and lastUsed change; otherwise all counters are updated.
   *
   * @param {string} documentId
   * @param {{countersReserved?: boolean}} [options]
   */
  async updateAccountStats(documentId, { countersReserved = false } = {}) {
    const now = new Date();
    const db = this.quotaTable();
    if (db) {
      const { knex, table } = db;
      const keys = quotaWindowKeys(now, this.getQuotaTimeZone());
      const update = {
        total_emails_sent: knex.raw('COALESCE(total_emails_sent, 0) + 1'),
        last_used: now,
        updated_at: now,
      };
      if (!countersReserved) Object.assign(update, forwardOnlyQuotaUpdate(knex, keys));
      const affected = await knex(table).where({ document_id: documentId }).update(update);
      if (affected > 0) return;
    }

    // Fallback: non-atomic read-modify-write (no database connection).
    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({ documentId });
    if (!account) return;
    const keys = quotaWindowKeys(now, this.getQuotaTimeZone());
    await strapi.documents(EMAIL_ACCOUNT_UID).update({
      documentId,
      data: {
        emailsSentToday: (account.quotaDayKey === keys.day ? account.emailsSentToday || 0 : 0) + 1,
        emailsSentThisHour:
          (account.quotaHourKey === keys.hour ? account.emailsSentThisHour || 0 : 0) + 1,
        quotaDayKey: keys.day,
        quotaHourKey: keys.hour,
        totalEmailsSent: (account.totalEmailsSent || 0) + 1,
        lastUsed: now,
      },
    });
  },

  /**
   * Get an active account by name (case-insensitive, like routing rules).
   */
  async getAccountByName(name) {
    const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { name: { $eqi: String(name) }, isActive: true },
      limit: 1,
    });
    return accounts && accounts.length > 0 ? accounts[0] : null;
  },

  /**
   * Validates and sanitizes email content:
   * - Header injection (CR/LF in subject and header fields)
   * - Recipient format (RFC 5322 parsing, same parser as the transports)
   * - Dangerous HTML (allowlist sanitizer)
   * - Missing subject / missing content
   *
   * Mutates `emailData` in place.
   *
   * @param {object} emailData - Email data to validate (mutated)
   * @throws {Error} ValidationError when validation fails
   */
  validateEmailSecurity(emailData) {
    if (!emailData || typeof emailData !== 'object' || Array.isArray(emailData)) {
      throw validationError('Email data must be an object');
    }

    for (const field of ['subject', 'from']) {
      if (typeof emailData[field] === 'string') {
        emailData[field] = stripHeaderInjection(emailData[field]);
      }
    }
    if (typeof emailData.replyTo === 'string' || Array.isArray(emailData.replyTo)) {
      emailData.replyTo = resolveReplyTo(emailData.replyTo);
    }

    /**
     * Validates one recipient field while retaining its input shape.
     * @returns {string|string[]|undefined}
     */
    const validateRecipients = (value, field, maximum) => {
      if (value === undefined || value === null || value === '') {
        if (field === 'to') throw validationError('Recipient email address (to) is required');
        return undefined;
      }
      if (typeof value !== 'string' && !Array.isArray(value)) {
        throw validationError(`Invalid ${field} recipient list`);
      }
      if (typeof value === 'string' && value.length > MAX_RECIPIENT_LIST_LENGTH) {
        throw validationError(`Too many characters in ${field} recipient list`);
      }

      const items = Array.isArray(value) ? value : [value];
      const safeItems = items.map((item) => {
        if (typeof item !== 'string') throw validationError(`Invalid ${field} recipient list`);
        const safe = stripHeaderInjection(item);
        if (
          !safe ||
          safe.length >
            (Array.isArray(value) ? MAX_RECIPIENT_ADDRESS_LENGTH : MAX_RECIPIENT_LIST_LENGTH)
        ) {
          throw validationError(`Invalid ${field} recipient format`);
        }
        return safe;
      });

      const entries = parseAddressList(safeItems);
      if (entries.length === 0 || entries.length > maximum) {
        throw validationError(`Too many ${field} recipients`);
      }
      for (const entry of entries) {
        if (
          entry.group ||
          entry.invalid ||
          entry.address.length > MAX_RECIPIENT_ADDRESS_LENGTH ||
          !EMAIL_PATTERN.test(entry.address)
        ) {
          throw validationError(`Invalid ${field} recipient format`);
        }
      }
      if (Array.isArray(value) && entries.length !== safeItems.length) {
        throw validationError(`Invalid ${field} recipient format`);
      }
      return Array.isArray(value) ? safeItems : safeItems[0];
    };

    emailData.to = validateRecipients(emailData.to, 'to', MAX_TO_RECIPIENTS);
    emailData.cc = validateRecipients(emailData.cc, 'cc', MAX_COPY_RECIPIENTS);
    emailData.bcc = validateRecipients(emailData.bcc, 'bcc', MAX_COPY_RECIPIENTS);

    const { subject, html, text } = emailData;
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      throw validationError('Email subject is required for security and deliverability');
    }
    if (subject.length > 200) {
      strapi.log.warn(
        '[magic-mail] Subject line exceeds 200 characters - may trigger spam filters'
      );
    }
    if (!html && !text) {
      throw validationError('Email must have either text or html content');
    }

    if (html) {
      emailData.html = sanitizeHtml(html, HTML_SANITIZE_OPTIONS);
    }
  },

  /**
   * Email message helper for the Content API `/send-message` route.
   * Plain `message` text becomes the text body.
   *
   * @param {{to: string|string[], cc?: string|string[], bcc?: string|string[], subject?: string, message?: string, text?: string, html?: string, templateId?: string|number, templateData?: object}} messageData
   * @param {object} [options] - Passed through to send()
   * @returns {Promise<Object>} Send result
   */
  async sendMessage(messageData, options = {}) {
    const { to, subject, message, text, html, templateId, templateData, ...rest } =
      messageData || {};

    const hasRecipient =
      (typeof to === 'string' && to.trim()) || (Array.isArray(to) && to.length > 0);
    if (!hasRecipient) {
      throw validationError('Email address (to) is required');
    }

    strapi.log.debug('[magic-mail] [SEND] Email message accepted for routing');
    return this.send(
      {
        to,
        subject,
        text: text || message,
        html,
        templateId,
        templateData,
        ...rest,
      },
      options
    );
  },
});

module.exports.__test__ = {
  HTML_SANITIZE_OPTIONS,
  createMessageId,
  buildOutboundHeaders,
  filterCustomHeaders,
  isFromAllowed,
  isSafeToRetry,
  mergeSafeHeaders,
  normalizeAttachments,
  parseSingleMailbox,
  quotaWindowKeys,
  resolveSender,
  resolveUnsubscribeUrl,
  extractEmailAddress,
};
