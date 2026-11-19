'use strict';

const crypto = require('crypto');
const { decryptCredentials } = require('../utils/encryption');
const { normalizeMessageId, messageIdCandidates } = require('../utils/message-id');
const { verifySendGridSignature, verifyMailgunSignature } = require('../utils/webhook-signatures');
const coordination = require('../utils/coordination');
const { getAdapter, WEBHOOK_PROVIDERS } = require('../providers');

/**
 * Signed delivery webhooks (SendGrid Event Webhook, Mailgun webhooks).
 *
 * - Off unless the account stores a verification secret
 *   (`config.webhookPublicKey` for SendGrid, `config.webhookSigningKey` for
 *   Mailgun). Both live in the encrypted account config.
 * - Every request is authenticated with the provider signature and a bounded
 *   timestamp; Mailgun tokens and provider event ids are de-duplicated.
 *   De-duplication is shared by every process: the first process to insert
 *   the claim row (`magic_mail_claims`, primary key) processes the item; a
 *   retry that lands on another replica or pm2 worker meanwhile is
 *   acknowledged without work. A failed item releases its claim so the
 *   provider's next retry is processed. The in-memory map is a first-level
 *   cache in front of the table.
 * - Outcomes (see README "Bounces and complaints"):
 *   bounced (hard bounce), blocked (SendGrid block or Mailgun `espblock`,
 *   final), dropped (SendGrid drop for a sender-side reason, or a Mailgun
 *   template that no longer exists, final), deferred, delivered, complained,
 *   unsubscribed, resubscribed. Each is stored on the email log (primary
 *   recipient only) plus one email event, and emitted on `strapi.eventHub` as
 *   `magic-mail.delivery.<outcome>` with
 *   `{ provider, messageId, reasonCode, primary }`.
 * - Events are applied in provider-timestamp order; a final state (bounced,
 *   blocked, failed) is never downgraded and an older deferred never
 *   overrides a newer delivery.
 * - Hard bounces (and, with `webhooks.suppressComplaints`, complaints) feed
 *   the suppression list while "Block hard-bounced recipients" is on. Only a
 *   keyed hash and a masked address are stored.
 * - No address, subject or provider text is logged or emitted. Secondary
 *   recipients (cc, bcc, further to) appear only as a masked address in the
 *   email event metadata.
 */

const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';

const PROVIDERS = new Set(WEBHOOK_PROVIDERS);
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
/** Mailgun delivery-status code for "Template not found" (Mailgun-internal, not SMTP). */
const MAILGUN_TEMPLATE_NOT_FOUND_CODE = 621;

/** Log documentId sent as SendGrid custom_args / Mailgun v: variable `magicmail_id`. */
const MAGICMAIL_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
const EVENT_ID_PATTERN = /^[\x21-\x7e]{1,128}$/;
const MAX_LOOKUP_IDS = 100;
/** Provider timestamps outside [2000-01-01, now + 1 day] are ignored. */
const MIN_EVENT_TIME_MS = Date.UTC(2000, 0, 1);
const MAX_EVENT_SKEW_MS = 24 * 3600_000;

const SEEN_TTL_MS = 2 * 60 * 60 * 1000;
const SEEN_MAX = 20_000;
/** @type {Map<string, number>} key -> expiresAt */
const seen = new Map();

/**
 * @typedef {'bounced'|'complained'|'blocked'|'dropped'|'deferred'|'delivered'|'unsubscribed'|'resubscribed'|'opened'|'clicked'} DeliveryKind
 */

/**
 * @typedef {object} DeliveryEvent
 * @property {string|null} eventId Provider event id (de-duplication).
 * @property {string|null} messageId Provider message id as reported.
 * @property {string|null} [smtpId] SendGrid `smtp-id` (fallback lookup).
 * @property {unknown} [magicmailId] `magicmail_id` custom argument / user variable (fallback lookup).
 * @property {DeliveryKind} kind
 * @property {string} reasonCode Sanitized, allowlisted code such as `SENDGRID_BOUNCE_500`.
 * @property {string|null} [recipient] Lower-cased event recipient; memory only, never stored.
 * @property {number|null} [occurredAt] Provider event time in ms.
 * @property {'bounce'|'complaint'|null} [suppress] Whether the outcome may feed the suppression list.
 * @property {boolean} [notDelivered] SendGrid drop: the mail never left the provider.
 * @property {string|null} [url] Clicked link ('clicked' only); memory only, see engagementUrl().
 */

/** Email event type per outcome. */
const EVENT_TYPES = Object.freeze({
  bounced: 'bounce',
  complained: 'complaint',
  blocked: 'blocked',
  dropped: 'dropped',
  deferred: 'deferred',
  delivered: 'delivered',
  unsubscribed: 'unsubscribe',
  resubscribed: 'resubscribe',
});

/** Provider engagement kinds (counted only for provider-tracked logs). */
const ENGAGEMENT_KINDS = new Set(['opened', 'clicked']);
const ENGAGEMENT_EVENT_TYPES = Object.freeze({ opened: 'open', clicked: 'click' });
const MAX_LINK_URL_LENGTH = 2048;

/** States a later event never changes. */
const FINAL_STATUSES = new Set(['bounced', 'blocked', 'failed']);

/**
 * SendGrid drop reasons, exactly as listed under "Dropped" on
 * https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event.
 * Unknown reasons become `dropped` with code SENDGRID_DROPPED_OTHER, so a
 * wording change on SendGrid's side cannot produce a false hard bounce.
 */
const SENDGRID_DROP_REASONS = Object.freeze({
  'Bounced Address': { kind: 'bounced', suppress: 'bounce' },
  Invalid: { kind: 'bounced', suppress: 'bounce' },
  'Spam Reporting Address': { kind: 'complained', suppress: 'complaint' },
  'Unsubscribed Address': { kind: 'unsubscribed' },
  'Group Unsubscribe': { kind: 'unsubscribed' },
  'Invalid SMTPAPI header': { kind: 'dropped' },
  'Invalid Template': { kind: 'dropped' },
  'Template Render Failure': { kind: 'dropped' },
  'Domain is not allowed': { kind: 'dropped' },
  Expired: { kind: 'dropped' },
});

/**
 * @param {string} key - Mailgun token or provider event id
 * @param {number} [now]
 * @returns {boolean} true while the key is inside the replay window
 */
function wasSeen(key, now = Date.now()) {
  const expiresAt = seen.get(key);
  return Boolean(expiresAt && expiresAt > now);
}

/**
 * Remembers a key for the replay window. Called only after the work for the
 * key succeeded, so a provider retry after a failure is processed again.
 *
 * @param {string} key
 * @param {number} [now]
 */
function remember(key, now = Date.now()) {
  if (seen.size >= SEEN_MAX) {
    for (const [entry, until] of seen) {
      if (until <= now || seen.size >= SEEN_MAX) seen.delete(entry);
      if (seen.size < SEEN_MAX * 0.9) break;
    }
  }
  seen.set(key, now + SEEN_TTL_MS);
}

/**
 * Claims a de-duplication key across processes.
 *
 * @param {object} strapi
 * @param {string} key
 * @returns {Promise<string|null|undefined>} token (won), null (already claimed),
 *   undefined (no database: in-memory de-duplication only)
 */
async function claimOnce(strapi, key) {
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  return coordination.claim(strapi, `webhook:${hashed}`, SEEN_TTL_MS);
}

/**
 * Releases a claim after a failure so a provider retry is processed again.
 *
 * @param {object} strapi
 * @param {string} key
 * @param {string|null|undefined} token
 */
async function releaseClaim(strapi, key, token) {
  if (!token) return;
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  try {
    await coordination.release(strapi, `webhook:${hashed}`, token);
  } catch {
    // The claim expires with SEEN_TTL_MS.
  }
}

/** @param {unknown} value @returns {string} upper-case code fragment */
const codePart = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

/**
 * Builds a reason code such as `SENDGRID_BOUNCE_550` from provider fields.
 *
 * @param {string} provider
 * @param {string} kind
 * @param {unknown} [smtpCode]
 * @returns {string}
 */
function reasonCode(provider, kind, smtpCode) {
  const code = /^[2-5]\d\d$/.test(String(smtpCode ?? '')) ? `_${smtpCode}` : '';
  return `${codePart(provider)}_${codePart(kind) || 'EVENT'}${code}`.slice(0, 64);
}

/**
 * Lower-cased event recipient, or null when it is not a plausible address.
 * Kept in memory only (comparison with the log, suppression hash, mask).
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeRecipient(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  if (address.length < 3 || address.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+$/.test(address)) return null;
  return address;
}

/**
 * Provider event time (Unix seconds, SendGrid integer, Mailgun float) in ms.
 *
 * @param {unknown} value
 * @param {number} [now]
 * @returns {number|null} null when missing or implausible
 */
function eventTime(value, now = Date.now()) {
  const seconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const ms = Math.round(seconds * 1000);
  if (ms < MIN_EVENT_TIME_MS || ms > now + MAX_EVENT_SKEW_MS) return null;
  return ms;
}

/**
 * Masks an address for event metadata ("j***@example.com").
 *
 * @param {string} address
 * @returns {string}
 */
function maskAddress(address) {
  const [local, domain] = String(address).split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`.slice(0, 120);
}

/**
 * Maps one SendGrid event object to a delivery event.
 *
 * Source: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event
 * - bounce, type bounce: hard bounce (permanent) -> bounced, suppressible.
 * - bounce, type blocked: "a temporary delivery denial"; SendGrid does not
 *   document a retry, so it is a final non-delivery -> blocked.
 * - dropped: by `reason` (SENDGRID_DROP_REASONS); never delivered.
 * - spamreport -> complained; deferred; delivered; unsubscribe and
 *   group_unsubscribe -> unsubscribed; group_resubscribe -> resubscribed.
 * - open -> opened, click -> clicked (counted only for logs sent with
 *   provider tracking, see recordEngagement).
 * Other events (processed, ...) are ignored.
 *
 * @param {Record<string, unknown>} event
 * @returns {DeliveryEvent|null}
 */
function mapSendGridEvent(event) {
  const type = event.event;
  /** @type {Partial<DeliveryEvent>|null} */
  let mapped = null;
  if (type === 'bounce') {
    const status = /^([45])\.\d+\.\d+$/.exec(String(event.status || ''));
    const blocked = event.type === 'blocked';
    mapped = {
      kind: blocked ? 'blocked' : 'bounced',
      reasonCode: reasonCode(
        'sendgrid',
        blocked ? 'blocked' : 'bounce',
        status ? `${status[1]}00` : null
      ),
      suppress: blocked ? null : 'bounce',
    };
  } else if (type === 'dropped') {
    const reason = typeof event.reason === 'string' ? event.reason : '';
    const known = Object.hasOwn(SENDGRID_DROP_REASONS, reason)
      ? SENDGRID_DROP_REASONS[reason]
      : null;
    mapped = {
      kind: known ? known.kind : 'dropped',
      reasonCode: `SENDGRID_DROPPED_${known ? codePart(reason) : 'OTHER'}`,
      suppress: known?.suppress || null,
      notDelivered: true,
    };
  } else if (type === 'spamreport') {
    mapped = {
      kind: 'complained',
      reasonCode: reasonCode('sendgrid', 'spamreport'),
      suppress: 'complaint',
    };
  } else if (type === 'deferred') {
    mapped = { kind: 'deferred', reasonCode: reasonCode('sendgrid', 'deferred') };
  } else if (type === 'delivered') {
    mapped = { kind: 'delivered', reasonCode: reasonCode('sendgrid', 'delivered') };
  } else if (type === 'unsubscribe' || type === 'group_unsubscribe') {
    mapped = { kind: 'unsubscribed', reasonCode: reasonCode('sendgrid', type) };
  } else if (type === 'group_resubscribe') {
    mapped = { kind: 'resubscribed', reasonCode: reasonCode('sendgrid', type) };
  } else if (type === 'open') {
    mapped = { kind: 'opened', reasonCode: reasonCode('sendgrid', 'open') };
  } else if (type === 'click') {
    mapped = {
      kind: 'clicked',
      reasonCode: reasonCode('sendgrid', 'click'),
      url: typeof event.url === 'string' ? event.url : null,
    };
  }
  if (!mapped) return null;
  return {
    eventId: typeof event.sg_event_id === 'string' ? event.sg_event_id : null,
    messageId: typeof event.sg_message_id === 'string' ? event.sg_message_id : null,
    smtpId: typeof event['smtp-id'] === 'string' ? event['smtp-id'] : null,
    magicmailId: event.magicmail_id,
    recipient: normalizeRecipient(event.email),
    occurredAt: eventTime(event.timestamp),
    suppress: null,
    notDelivered: false,
    ...mapped,
  };
}

/**
 * Maps a SendGrid event batch to delivery events. The whole array is
 * processed (the raw-body limit bounds its size); events of other types are
 * skipped before any work is done.
 *
 * @param {unknown} payload - parsed JSON body (array of events)
 * @returns {DeliveryEvent[]}
 */
function parseSendGridEvents(payload) {
  if (!Array.isArray(payload)) return [];
  const out = [];
  for (const event of payload) {
    if (!event || typeof event !== 'object') continue;
    const mapped = mapSendGridEvent(event);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Maps one Mailgun webhook (`event-data`) to a delivery event.
 *
 * Sources: https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks
 * (event types), the Mailgun API bundle `EventSeverityType` (temporary =
 * Mailgun retries, permanent = no retry) and the Mailgun OpenAPI metrics
 * (`hard_bounces` / `soft_bounces` by `delivery-status.bounce-type`,
 * `esp_block` by reason `espblock`).
 * - failed + permanent -> bounced; suppressible unless the reason is
 *   `suppress-*` (Mailgun's own list already blocked it) or `old`, or
 *   Mailgun classified it as a soft bounce (`bounce-type: soft`).
 * - failed + permanent + reason `espblock` -> blocked, never suppressed: the
 *   recipient's provider refused the sender (reputation, authentication),
 *   not the address. Seen live 2026-11-19: 550 5.7.40 with `bounce-type:
 *   soft`; Mailgun did not add the address to its own bounce list.
 * - failed + delivery-status code 621 ("Template not found", a Mailgun code,
 *   not SMTP; seen live 2026-11-19 as severity temporary, retried every
 *   600 s) -> deferred while temporary, dropped (failed) when permanent;
 *   reason code MAILGUN_TEMPLATE_NOT_FOUND, never suppressed.
 * - failed + temporary -> deferred, never suppressed.
 * - complained, unsubscribed, delivered.
 * - opened, clicked (counted only for provider-tracked logs).
 *
 * @param {unknown} eventData
 * @returns {DeliveryEvent[]}
 */
function parseMailgunEvent(eventData) {
  if (!eventData || typeof eventData !== 'object') return [];
  const headers = eventData.message && eventData.message.headers;
  const variables =
    eventData['user-variables'] && typeof eventData['user-variables'] === 'object'
      ? eventData['user-variables']
      : {};
  const base = {
    eventId: typeof eventData.id === 'string' ? eventData.id : null,
    messageId: headers && typeof headers['message-id'] === 'string' ? headers['message-id'] : null,
    smtpId: null,
    magicmailId: variables.magicmail_id,
    recipient: normalizeRecipient(eventData.recipient),
    occurredAt: eventTime(eventData.timestamp),
    suppress: null,
    notDelivered: false,
  };
  const status =
    eventData['delivery-status'] && typeof eventData['delivery-status'] === 'object'
      ? eventData['delivery-status']
      : {};
  const smtp = status.code;
  const templateMissing = Number(smtp) === MAILGUN_TEMPLATE_NOT_FOUND_CODE;
  if (eventData.event === 'failed' && eventData.severity === 'permanent') {
    const reason = typeof eventData.reason === 'string' ? eventData.reason : '';
    if (templateMissing) {
      return [
        { ...base, kind: 'dropped', reasonCode: reasonCode('mailgun', 'template-not-found') },
      ];
    }
    if (reason === 'espblock') {
      return [{ ...base, kind: 'blocked', reasonCode: reasonCode('mailgun', reason, smtp) }];
    }
    const suppressible =
      !reason.startsWith('suppress-') && reason !== 'old' && status['bounce-type'] !== 'soft';
    return [
      {
        ...base,
        kind: 'bounced',
        reasonCode: reasonCode('mailgun', reason || 'failed', smtp),
        suppress: suppressible ? 'bounce' : null,
      },
    ];
  }
  if (eventData.event === 'failed' && eventData.severity === 'temporary') {
    return [
      {
        ...base,
        kind: 'deferred',
        reasonCode: templateMissing
          ? reasonCode('mailgun', 'template-not-found')
          : reasonCode('mailgun', 'deferred', smtp),
      },
    ];
  }
  if (eventData.event === 'complained') {
    return [
      {
        ...base,
        kind: 'complained',
        reasonCode: reasonCode('mailgun', 'complained'),
        suppress: 'complaint',
      },
    ];
  }
  if (eventData.event === 'unsubscribed') {
    return [{ ...base, kind: 'unsubscribed', reasonCode: reasonCode('mailgun', 'unsubscribed') }];
  }
  if (eventData.event === 'delivered') {
    return [{ ...base, kind: 'delivered', reasonCode: reasonCode('mailgun', 'delivered') }];
  }
  if (eventData.event === 'opened') {
    return [{ ...base, kind: 'opened', reasonCode: reasonCode('mailgun', 'opened') }];
  }
  if (eventData.event === 'clicked') {
    return [
      {
        ...base,
        kind: 'clicked',
        reasonCode: reasonCode('mailgun', 'clicked'),
        url: typeof eventData.url === 'string' ? eventData.url : null,
      },
    ];
  }
  return [];
}

/**
 * Sorts events by provider time (stable; events without a time keep their
 * position after the timed ones), so one batch is applied in event order.
 *
 * @param {DeliveryEvent[]} events
 * @returns {DeliveryEvent[]}
 */
function orderEvents(events) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const ta = a.event.occurredAt ?? Number.POSITIVE_INFINITY;
      const tb = b.event.occurredAt ?? Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ event }) => event);
}

/**
 * Lookup candidates from a SendGrid `smtp-id` (`<x-message-id@host>`): the
 * local part is the X-Message-Id the send API returned.
 *
 * @param {unknown} smtpId
 * @returns {string[]}
 */
function smtpIdCandidates(smtpId) {
  const id = normalizeMessageId(smtpId);
  if (!id) return [];
  const local = id.split('@')[0];
  return local && local !== id ? [local, id] : [id];
}

/** @param {unknown} value @returns {number|null} */
const toMs = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Whether the event concerns the log's primary recipient (`email-log.recipient`).
 * Events without a recipient are treated as primary (single-recipient logs,
 * async bounces).
 *
 * @param {{recipient?: string|null}} log
 * @param {string|null|undefined} recipient
 * @returns {boolean}
 */
function isPrimaryRecipient(log, recipient) {
  if (!recipient) return true;
  const primary = String(log.recipient || '')
    .trim()
    .toLowerCase();
  return !primary || primary === recipient;
}

/**
 * Log fields for one primary-recipient outcome, honouring event order:
 * final states (bounced, blocked, failed) are never downgraded, a hard bounce
 * always wins, and deferred/delivered only move the status when the event is
 * not older than the last delivery event already applied.
 *
 * @param {DeliveryEvent} event
 * @param {Record<string, any>} log - current log row
 * @param {Date} at - provider event time (or receipt time)
 * @param {string} provider
 * @returns {Record<string, unknown>|null} fields to update, or null for none
 */
function logUpdateFor(event, log, at, provider) {
  const status = log.deliveryStatus ?? null;
  const time = at.getTime();
  const last = toMs(log.lastDeliveryEventAt);
  const newer = last === null || time >= last;
  const lastDeliveryEventAt = new Date(Math.max(time, last ?? time));
  const failure = { bounceReason: event.reasonCode, bounceSource: provider };
  switch (event.kind) {
    case 'bounced':
      return {
        bounced: true,
        bouncedAt: at,
        deliveryStatus: 'bounced',
        lastDeliveryEventAt,
        ...failure,
      };
    case 'blocked':
    case 'dropped':
      if (status === 'bounced') return null;
      return {
        deliveryStatus: event.kind === 'blocked' ? 'blocked' : 'failed',
        lastDeliveryEventAt,
        ...failure,
      };
    case 'deferred':
      if (FINAL_STATUSES.has(status) || !newer) return null;
      return { deliveryStatus: 'deferred', lastDeliveryEventAt: at, ...failure };
    case 'delivered': {
      const data = {};
      if (!log.deliveryConfirmedAt) data.deliveryConfirmedAt = at;
      if (!FINAL_STATUSES.has(status) && newer) {
        data.deliveryStatus = 'sent';
        data.lastDeliveryEventAt = at;
        if (status === 'deferred') data.bounceReason = null;
      }
      return Object.keys(data).length ? data : null;
    }
    case 'complained':
    case 'unsubscribed': {
      const data =
        event.kind === 'complained'
          ? { complained: true, complainedAt: at }
          : { unsubscribed: true, ...(log.unsubscribed === true ? {} : { unsubscribedAt: at }) };
      if (event.notDelivered && status !== 'bounced') {
        Object.assign(data, { deliveryStatus: 'failed', lastDeliveryEventAt, ...failure });
      }
      return data;
    }
    case 'resubscribed': {
      const unsubscribedAt = toMs(log.unsubscribedAt);
      if (log.unsubscribed !== true) return null;
      if (unsubscribedAt !== null && time < unsubscribedAt) return null;
      return { unsubscribed: false };
    }
    default:
      return null;
  }
}

/**
 * The clicked link as stored on a click event: an absolute http(s) URL
 * without query string and fragment, or null for anything else and for
 * sensitive links (password reset, confirmation, magic links, token-bearing
 * paths). Provider-reported URLs are those in the provider-rendered body, so
 * they can carry tokens; only the origin and path are kept.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function engagementUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  // Query and fragment are dropped first; the remaining origin + path is
  // checked against the sensitive-link policy (reset, confirm, magic links).
  const stripped = `${parsed.origin}${parsed.pathname}`;
  if (stripped.length > MAX_LINK_URL_LENGTH) return null;
  const { isSensitiveTrackingUrl } = require('../utils/tracking-url-policy');
  try {
    if (isSensitiveTrackingUrl(stripped)) return null;
  } catch {
    return null;
  }
  return stripped;
}

/**
 * @param {Buffer} raw
 * @returns {unknown} parsed JSON or undefined
 */
function parseJson(raw) {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return undefined;
  }
}

const LOG_FIELDS = [
  'id',
  'documentId',
  'providerTracking',
  'providerMessageId',
  'recipient',
  'accountId',
  'deliveryStatus',
  'deliveryConfirmedAt',
  'lastDeliveryEventAt',
  'bounced',
  'unsubscribed',
  'unsubscribedAt',
];

module.exports = ({ strapi }) => ({
  /**
   * Verifies and processes one webhook request.
   *
   * The signature is checked over the raw body before anything is parsed.
   * Every relevant event of a batch is processed (no event cap; the raw-body
   * limit bounds the work), in provider-timestamp order. A valid request
   * always answers 200, also when events match no email log (counted and
   * logged without personal data), so the provider does not retry it for 24 h.
   *
   * @param {{provider: string, accountId: string, rawBody: Buffer|undefined, headers: Record<string, string|undefined>}} input
   * @returns {Promise<{status: 200|400|401, processed: number, unmatched: number}>}
   *   401 for unknown account, missing secret or bad signature (indistinguishable on purpose).
   * @throws {Error} When the database fails while recording; the controller answers 500 and the provider retries.
   * @sideeffect Updates email logs, creates email events, may add suppression rows, emits eventHub events, writes de-duplication claims.
   */
  async handleWebhook({ provider, accountId, rawBody, headers }) {
    const rejected = (status) => ({ status, processed: 0, unmatched: 0 });
    if (!PROVIDERS.has(provider) || !ACCOUNT_ID_PATTERN.test(String(accountId || ''))) {
      return rejected(401);
    }
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return rejected(400);

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({ documentId: accountId });
    if (!account || account.provider !== provider) return rejected(401);

    let config;
    try {
      config = decryptCredentials(account.config) || {};
    } catch {
      strapi.log.warn('[magic-mail] Delivery webhook: account credentials are unreadable');
      return rejected(401);
    }

    let events;
    let replayKey = null;
    if (provider === 'sendgrid') {
      const valid = verifySendGridSignature({
        publicKey: config.webhookPublicKey,
        rawBody,
        signature: headers['x-twilio-email-event-webhook-signature'],
        timestamp: headers['x-twilio-email-event-webhook-timestamp'],
      });
      if (!valid) return rejected(401);
      const payload = parseJson(rawBody);
      if (payload === undefined) return rejected(400);
      events = parseSendGridEvents(payload);
    } else if (getAdapter(provider)) {
      // Brevo, Amazon SES: the adapter authenticates and parses the request.
      const result = await getAdapter(provider).webhook({
        config,
        rawBody,
        headers,
        now: Date.now(),
      });
      if (!result || result.status !== 200) return rejected(result?.status === 400 ? 400 : 401);
      events = Array.isArray(result.events) ? result.events : [];
      if (typeof result.replayKey === 'string' && result.replayKey) {
        replayKey = `${provider}:${result.replayKey}`.slice(0, 300);
        if (wasSeen(replayKey)) return { status: 200, processed: 0, unmatched: 0 };
      }
    } else {
      const payload = parseJson(rawBody);
      if (!payload || typeof payload !== 'object') return rejected(400);
      const signature = payload.signature || {};
      const valid = verifyMailgunSignature({
        signingKey: config.webhookSigningKey,
        timestamp: signature.timestamp,
        token: signature.token,
        signature: signature.signature,
      });
      if (!valid) return rejected(401);
      // Replayed token: already processed, acknowledge without work.
      replayKey = `mailgun-token:${signature.token}`;
      if (wasSeen(replayKey)) return { status: 200, processed: 0, unmatched: 0 };
      events = parseMailgunEvent(payload['event-data']);
    }

    let replayClaim;
    if (replayKey) {
      replayClaim = await claimOnce(strapi, replayKey);
      if (replayClaim === null) return { status: 200, processed: 0, unmatched: 0 };
    }

    const context = { accountId, unmatched: 0, settings: null };
    let processed = 0;
    try {
      for (const event of orderEvents(events)) {
        if (await this.recordEvent(provider, event, context)) processed += 1;
      }
    } catch (error) {
      await releaseClaim(strapi, replayKey, replayClaim);
      throw error;
    }
    if (replayKey) remember(replayKey);
    if (context.unmatched > 0) {
      strapi.log.warn(
        `[magic-mail] Delivery webhook (${provider}): ${context.unmatched} delivery event(s) matched no email log`
      );
    }
    return { status: 200, processed, unmatched: context.unmatched };
  },

  /**
   * Stores one verified delivery event and emits the matching eventHub event.
   *
   * The log is found by provider message id, then by the `magicmail_id`
   * custom argument (a log documentId of the webhook's own account), then by
   * the SendGrid `smtp-id`. An event without any of these is counted as
   * unmatched and skipped.
   *
   * @param {string} provider
   * @param {DeliveryEvent} event
   * @param {{accountId?: string, unmatched?: number, settings?: Promise<object>|null}} [context]
   *   Per-request state; `unmatched` is incremented in place.
   * @returns {Promise<boolean>} true when the event was new and recorded or emitted
   * @sideeffect See handleWebhook.
   */
  async recordEvent(provider, event, context = {}) {
    const lookup = {
      candidates: messageIdCandidates(provider, event.messageId),
      smtpCandidates: provider === 'sendgrid' ? smtpIdCandidates(event.smtpId) : [],
      magicmailId:
        typeof event.magicmailId === 'string' && MAGICMAIL_ID_PATTERN.test(event.magicmailId)
          ? event.magicmailId
          : null,
    };
    if (ENGAGEMENT_KINDS.has(event.kind))
      return this.recordEngagement(provider, event, lookup, context);
    if (!lookup.candidates.length && !lookup.smtpCandidates.length && !lookup.magicmailId) {
      context.unmatched = (context.unmatched || 0) + 1;
      return false;
    }

    const eventId =
      event.eventId && EVENT_ID_PATTERN.test(event.eventId) ? `${provider}:${event.eventId}` : null;
    let eventClaim;
    if (eventId) {
      if (wasSeen(`event:${eventId}`)) return false;
      // Cross-process claim first, then the stored events (older than the
      // claim window) as the long-term record.
      eventClaim = await claimOnce(strapi, `event:${eventId}`);
      if (eventClaim === null) return false;
      try {
        const existing = await strapi.db
          .query(EMAIL_EVENT_UID)
          .findOne({ where: { providerEventId: eventId }, select: ['id'] });
        if (existing) {
          remember(`event:${eventId}`);
          return false;
        }
      } catch (error) {
        await releaseClaim(strapi, `event:${eventId}`, eventClaim);
        throw error;
      }
    }

    try {
      return await this._applyEvent(provider, event, lookup, eventId, context);
    } catch (error) {
      if (eventId) await releaseClaim(strapi, `event:${eventId}`, eventClaim);
      throw error;
    }
  },

  /**
   * Counts a provider open or click on its email log.
   *
   * Only logs sent with provider tracking (`providerTracking: true`, set for
   * provider-template sends while "Count provider opens and clicks" is on)
   * are counted: Magic Mail's own pixel and link rewrite cover every other
   * mail, and counting both would double the numbers. Events for other logs
   * and events without a log are ignored silently (not "unmatched": providers
   * also report opens of mails that Magic Mail tracks itself).
   *
   * De-duplicated by provider event id when the provider sends one. The
   * clicked URL is reduced by engagementUrl(); no IP or user agent from the
   * provider is stored.
   *
   * @param {string} provider
   * @param {DeliveryEvent} event - kind 'opened' or 'clicked'
   * @param {{candidates: string[], smtpCandidates: string[], magicmailId: string|null}} lookup
   * @param {{accountId?: string}} context
   * @returns {Promise<boolean>} true when counted
   * @sideeffect Increments openCount/clickCount (and first/lastOpenedAt) and
   *   creates one open/click email event.
   */
  async recordEngagement(provider, event, lookup, context = {}) {
    if (!lookup.candidates.length && !lookup.smtpCandidates.length && !lookup.magicmailId) {
      return false;
    }
    const log = await this._findLog(lookup, context.accountId);
    if (!log || log.providerTracking !== true) return false;
    if (!isPrimaryRecipient(log, event.recipient)) return false;

    const eventId =
      event.eventId && EVENT_ID_PATTERN.test(event.eventId) ? `${provider}:${event.eventId}` : null;
    let claim;
    if (eventId) {
      if (wasSeen(`event:${eventId}`)) return false;
      claim = await claimOnce(strapi, `event:${eventId}`);
      if (claim === null) return false;
    }
    try {
      if (eventId) {
        const existing = await strapi.db
          .query(EMAIL_EVENT_UID)
          .findOne({ where: { providerEventId: eventId }, select: ['id'] });
        if (existing) {
          remember(`event:${eventId}`);
          return false;
        }
      }
      const at = new Date(event.occurredAt ?? Date.now());
      const opened = event.kind === 'opened';
      const fields = opened
        ? { counter: 'openCount', first: 'firstOpenedAt', last: 'lastOpenedAt' }
        : { counter: 'clickCount' };
      const { incrementCounter } = require('./analytics');
      const atomic = await incrementCounter(
        strapi,
        EMAIL_LOG_UID,
        log.documentId,
        fields,
        at
      ).catch(() => false);
      if (!atomic) {
        const current = await strapi.db.query(EMAIL_LOG_UID).findOne({
          where: { documentId: log.documentId },
          select: ['openCount', 'clickCount', 'firstOpenedAt'],
        });
        const data = opened
          ? {
              openCount: (current?.openCount || 0) + 1,
              firstOpenedAt: current?.firstOpenedAt || at,
              lastOpenedAt: at,
            }
          : { clickCount: (current?.clickCount || 0) + 1 };
        await strapi.documents(EMAIL_LOG_UID).update({ documentId: log.documentId, data });
      }
      const linkUrl = opened ? null : engagementUrl(event.url);
      await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: log.documentId,
          type: ENGAGEMENT_EVENT_TYPES[event.kind],
          timestamp: at,
          providerEventId: eventId,
          ...(linkUrl ? { linkUrl } : {}),
          metadata: { provider, source: 'provider-tracking' },
        },
      });
      if (eventId) remember(`event:${eventId}`);
      return true;
    } catch (error) {
      if (eventId) await releaseClaim(strapi, `event:${eventId}`, claim);
      throw error;
    }
  },

  /**
   * Finds the email log of an event (see recordEvent for the order).
   *
   * @private
   * @param {{candidates: string[], smtpCandidates: string[], magicmailId: string|null}} lookup
   * @param {string|undefined} accountId - webhook account; binds the magicmail_id lookup
   * @returns {Promise<Record<string, any>|null>}
   */
  async _findLog(lookup, accountId) {
    const byIds = async (ids) => {
      if (!ids.length) return null;
      const rows = await strapi.db.query(EMAIL_LOG_UID).findMany({
        where: { providerMessageId: { $in: ids } },
        select: LOG_FIELDS,
        limit: ids.length,
      });
      // Prefer the longest (most specific) candidate.
      for (const id of ids) {
        const row = rows.find((candidate) => candidate.providerMessageId === id);
        if (row) return row;
      }
      return null;
    };
    const byMessageId = await byIds(lookup.candidates);
    if (byMessageId) return byMessageId;
    if (lookup.magicmailId && accountId) {
      const byDocumentId = await strapi.db.query(EMAIL_LOG_UID).findOne({
        where: { documentId: lookup.magicmailId, accountId },
        select: LOG_FIELDS,
      });
      if (byDocumentId) return byDocumentId;
    }
    return byIds(lookup.smtpCandidates);
  },

  /**
   * Writes one verified, de-duplicated event and emits it on the eventHub.
   *
   * Only an event for the log's primary recipient changes log-level fields;
   * other recipients get an email event with a masked address and
   * `primary: false`. A failing suppression write or eventHub listener is
   * logged and does not fail the webhook.
   *
   * @private
   * @param {string} provider
   * @param {DeliveryEvent} event
   * @param {{candidates: string[], smtpCandidates: string[], magicmailId: string|null}} lookup
   * @param {string|null} eventId
   * @param {{accountId?: string, unmatched?: number, settings?: Promise<object>|null}} context
   * @returns {Promise<boolean>}
   */
  async _applyEvent(provider, event, lookup, eventId, context) {
    const log = await this._findLog(lookup, context.accountId);
    const at = new Date(event.occurredAt ?? Date.now());
    const messageId =
      log?.providerMessageId ||
      lookup.candidates[lookup.candidates.length - 1] ||
      lookup.smtpCandidates[0] ||
      null;
    const primary = log ? isPrimaryRecipient(log, event.recipient) : null;

    if (log) {
      if (primary) {
        const data = logUpdateFor(event, log, at, provider);
        if (data)
          await strapi.documents(EMAIL_LOG_UID).update({ documentId: log.documentId, data });
      }
      await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: log.documentId,
          type: EVENT_TYPES[event.kind],
          timestamp: at,
          providerEventId: eventId,
          metadata: {
            provider,
            reasonCode: event.reasonCode,
            primary,
            ...(primary ? {} : { recipient: maskAddress(event.recipient) }),
          },
        },
      });
    } else {
      context.unmatched = (context.unmatched || 0) + 1;
    }

    if (eventId) remember(`event:${eventId}`);

    if (event.suppress) {
      const address = log && primary ? log.recipient : event.recipient;
      await this._suppress(provider, event, address, context);
    }

    if (!log && !messageId) return false;
    try {
      // eventHub.emit awaits every listener; a failing listener must not
      // turn the provider's delivery into an error (it would retry forever).
      await strapi.eventHub.emit(`magic-mail.delivery.${event.kind}`, {
        provider,
        messageId,
        reasonCode: event.reasonCode,
        primary,
      });
    } catch (error) {
      strapi.log.warn(`[magic-mail] Delivery event listener failed: ${error?.name || 'Error'}`);
    }
    return true;
  },

  /**
   * Adds the address of a hard bounce (or, with `webhooks.suppressComplaints`,
   * a complaint) to the suppression list while the admin setting "Block
   * hard-bounced recipients" is on. Never throws.
   *
   * @private
   * @param {string} provider
   * @param {DeliveryEvent} event
   * @param {string|null|undefined} address
   * @param {{accountId?: string, settings?: Promise<object>|null}} context
   * @returns {Promise<void>}
   * @sideeffect Upserts one suppressed-recipient row (keyed hash + masked address).
   */
  async _suppress(provider, event, address, context) {
    if (typeof address !== 'string' || !address.includes('@')) return;
    try {
      if (!context.settings) {
        context.settings = Promise.resolve()
          .then(() => strapi.plugin('magic-mail').service('plugin-settings').getSettings())
          .then((value) => value || {})
          .catch(() => ({}));
      }
      const settings = await context.settings;
      if (settings.suppressHardBounces !== true) return;
      if (event.suppress === 'complaint') {
        const webhooks = strapi.config?.get?.('plugin::magic-mail.webhooks') || {};
        if (webhooks.suppressComplaints !== true) return;
      }
      await strapi.plugin('magic-mail').service('bounce-monitor').suppressAddress({
        address,
        reasonCode: event.reasonCode,
        source: provider,
        accountId: context.accountId,
      });
    } catch (error) {
      strapi.log.warn(
        `[magic-mail] Delivery webhook: suppression failed (${error?.name || 'Error'})`
      );
    }
  },

  /**
   * Bounce/complaint state for provider message ids (as returned by `send()`).
   *
   * @param {unknown[]} messageIds - at most 100 are looked up
   * @returns {Promise<Array<{messageId: string, bounced: boolean, complained: boolean, reasonCode: string|null}>>}
   */
  async getDeliveryEvents(messageIds) {
    if (!Array.isArray(messageIds)) return [];
    const ids = [...new Set(messageIds.map(normalizeMessageId).filter(Boolean))].slice(
      0,
      MAX_LOOKUP_IDS
    );
    if (ids.length === 0) return [];
    const logs = await strapi.db.query(EMAIL_LOG_UID).findMany({
      where: { providerMessageId: { $in: ids } },
      select: ['providerMessageId', 'bounced', 'bounceReason', 'complained'],
    });
    return logs.map((log) => ({
      messageId: log.providerMessageId,
      bounced: log.bounced === true,
      complained: log.complained === true,
      reasonCode:
        typeof log.bounceReason === 'string' && /^[A-Z0-9_]{1,64}$/.test(log.bounceReason)
          ? log.bounceReason
          : null,
    }));
  },
});

module.exports.__test__ = {
  engagementUrl,
  parseSendGridEvents,
  parseMailgunEvent,
  reasonCode,
  orderEvents,
  logUpdateFor,
  wasSeen,
  remember,
  resetSeen: () => seen.clear(),
};
