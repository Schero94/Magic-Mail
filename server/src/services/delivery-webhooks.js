'use strict';

const crypto = require('crypto');
const { decryptCredentials } = require('../utils/encryption');
const { normalizeMessageId, messageIdCandidates } = require('../utils/message-id');
const { verifySendGridSignature, verifyMailgunSignature } = require('../utils/webhook-signatures');
const coordination = require('../utils/coordination');

/**
 * Signed bounce / complaint webhooks (SendGrid, Mailgun).
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
 * - Only bounce and complaint events are stored: on the email log
 *   (`bounced`/`complained`, sanitized reason code) plus one email event.
 * - `magic-mail.delivery.bounced` / `magic-mail.delivery.complained` are
 *   emitted on `strapi.eventHub` with `{ provider, messageId, reasonCode }`.
 *   No addresses, subjects or provider texts leave this service.
 */

const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';

const PROVIDERS = new Set(['sendgrid', 'mailgun']);
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
const EVENT_ID_PATTERN = /^[\x21-\x7e]{1,128}$/;
const MAX_EVENTS_PER_REQUEST = 1000;
const MAX_LOOKUP_IDS = 100;

const SEEN_TTL_MS = 2 * 60 * 60 * 1000;
const SEEN_MAX = 20_000;
/** @type {Map<string, number>} key -> expiresAt */
const seen = new Map();

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
 * Maps a SendGrid event batch to delivery events.
 * bounce (type bounce|blocked) and dropped -> bounced; spamreport -> complained.
 *
 * @param {unknown} payload - parsed JSON body (array of events)
 * @returns {Array<{eventId: string|null, messageId: string|null, kind: 'bounced'|'complained', reasonCode: string}>}
 */
function parseSendGridEvents(payload) {
  if (!Array.isArray(payload)) return [];
  const out = [];
  for (const event of payload.slice(0, MAX_EVENTS_PER_REQUEST)) {
    if (!event || typeof event !== 'object') continue;
    const type = event.event;
    let kind = null;
    let reason = null;
    if (type === 'bounce') {
      kind = 'bounced';
      const status = /^([45])\.\d+\.\d+$/.exec(String(event.status || ''));
      reason = reasonCode(
        'sendgrid',
        event.type === 'blocked' ? 'blocked' : 'bounce',
        status ? `${status[1]}00` : null
      );
    } else if (type === 'dropped') {
      kind = 'bounced';
      reason = reasonCode('sendgrid', 'dropped');
    } else if (type === 'spamreport') {
      kind = 'complained';
      reason = reasonCode('sendgrid', 'spamreport');
    }
    if (!kind) continue;
    out.push({
      eventId: typeof event.sg_event_id === 'string' ? event.sg_event_id : null,
      messageId: typeof event.sg_message_id === 'string' ? event.sg_message_id : null,
      kind,
      reasonCode: reason,
    });
  }
  return out;
}

/**
 * Maps one Mailgun webhook (`event-data`) to a delivery event.
 * failed + severity permanent -> bounced; complained -> complained.
 * Temporary failures are ignored (Mailgun keeps retrying).
 *
 * @param {unknown} eventData
 * @returns {Array<{eventId: string|null, messageId: string|null, kind: 'bounced'|'complained', reasonCode: string}>}
 */
function parseMailgunEvent(eventData) {
  if (!eventData || typeof eventData !== 'object') return [];
  const headers = eventData.message && eventData.message.headers;
  const messageId =
    headers && typeof headers['message-id'] === 'string' ? headers['message-id'] : null;
  const eventId = typeof eventData.id === 'string' ? eventData.id : null;
  if (eventData.event === 'failed' && eventData.severity === 'permanent') {
    const smtp = eventData['delivery-status'] && eventData['delivery-status'].code;
    return [
      {
        eventId,
        messageId,
        kind: 'bounced',
        reasonCode: reasonCode('mailgun', eventData.reason || 'failed', smtp),
      },
    ];
  }
  if (eventData.event === 'complained') {
    return [
      { eventId, messageId, kind: 'complained', reasonCode: reasonCode('mailgun', 'complained') },
    ];
  }
  return [];
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

module.exports = ({ strapi }) => ({
  /**
   * Verifies and processes one webhook request.
   *
   * @param {{provider: string, accountId: string, rawBody: Buffer|undefined, headers: Record<string, string|undefined>}} input
   * @returns {Promise<{status: 200|400|401, processed: number}>}
   *   401 for unknown account, missing secret or bad signature (indistinguishable on purpose).
   */
  async handleWebhook({ provider, accountId, rawBody, headers }) {
    if (!PROVIDERS.has(provider) || !ACCOUNT_ID_PATTERN.test(String(accountId || ''))) {
      return { status: 401, processed: 0 };
    }
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return { status: 400, processed: 0 };

    const account = await strapi.documents(EMAIL_ACCOUNT_UID).findOne({ documentId: accountId });
    if (!account || account.provider !== provider) return { status: 401, processed: 0 };

    let config;
    try {
      config = decryptCredentials(account.config) || {};
    } catch {
      strapi.log.warn('[magic-mail] Delivery webhook: account credentials are unreadable');
      return { status: 401, processed: 0 };
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
      if (!valid) return { status: 401, processed: 0 };
      const payload = parseJson(rawBody);
      if (payload === undefined) return { status: 400, processed: 0 };
      events = parseSendGridEvents(payload);
    } else {
      const payload = parseJson(rawBody);
      if (!payload || typeof payload !== 'object') return { status: 400, processed: 0 };
      const signature = payload.signature || {};
      const valid = verifyMailgunSignature({
        signingKey: config.webhookSigningKey,
        timestamp: signature.timestamp,
        token: signature.token,
        signature: signature.signature,
      });
      if (!valid) return { status: 401, processed: 0 };
      // Replayed token: already processed, acknowledge without work.
      replayKey = `mailgun-token:${signature.token}`;
      if (wasSeen(replayKey)) return { status: 200, processed: 0 };
      events = parseMailgunEvent(payload['event-data']);
    }

    let replayClaim;
    if (replayKey) {
      replayClaim = await claimOnce(strapi, replayKey);
      if (replayClaim === null) return { status: 200, processed: 0 };
    }

    let processed = 0;
    try {
      for (const event of events) {
        if (await this.recordEvent(provider, event)) processed += 1;
      }
    } catch (error) {
      await releaseClaim(strapi, replayKey, replayClaim);
      throw error;
    }
    if (replayKey) remember(replayKey);
    return { status: 200, processed };
  },

  /**
   * Stores one verified bounce/complaint and emits the matching eventHub event.
   *
   * @param {string} provider
   * @param {{eventId: string|null, messageId: string|null, kind: 'bounced'|'complained', reasonCode: string}} event
   * @returns {Promise<boolean>} true when the event was new
   */
  async recordEvent(provider, event) {
    const candidates = messageIdCandidates(provider, event.messageId);
    if (candidates.length === 0) return false;

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
      return await this._applyEvent(provider, event, candidates, eventId);
    } catch (error) {
      if (eventId) await releaseClaim(strapi, `event:${eventId}`, eventClaim);
      throw error;
    }
  },

  /**
   * Writes one verified, de-duplicated event and emits it on the eventHub.
   *
   * @private
   * @param {string} provider
   * @param {{messageId: string|null, kind: 'bounced'|'complained', reasonCode: string}} event
   * @param {string[]} candidates - normalized provider message ids
   * @param {string|null} eventId
   * @returns {Promise<boolean>}
   */
  async _applyEvent(provider, event, candidates, eventId) {
    const log = await strapi.db.query(EMAIL_LOG_UID).findOne({
      where: { providerMessageId: { $in: candidates } },
      select: ['id', 'documentId', 'providerMessageId'],
    });
    const messageId = log?.providerMessageId || candidates[candidates.length - 1];
    const now = new Date();

    if (log) {
      const data =
        event.kind === 'bounced'
          ? { bounced: true, bounceReason: event.reasonCode }
          : { complained: true, complainedAt: now };
      await strapi.documents(EMAIL_LOG_UID).update({ documentId: log.documentId, data });
      await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: log.documentId,
          type: event.kind === 'bounced' ? 'bounce' : 'complaint',
          timestamp: now,
          providerEventId: eventId,
          metadata: { provider, reasonCode: event.reasonCode },
        },
      });
    }

    if (eventId) remember(`event:${eventId}`);
    try {
      // eventHub.emit awaits every listener; a failing listener must not
      // turn the provider's delivery into an error (it would retry forever).
      await strapi.eventHub.emit(`magic-mail.delivery.${event.kind}`, {
        provider,
        messageId,
        reasonCode: event.reasonCode,
      });
    } catch (error) {
      strapi.log.warn(`[magic-mail] Delivery event listener failed: ${error?.name || 'Error'}`);
    }
    return true;
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
  parseSendGridEvents,
  parseMailgunEvent,
  reasonCode,
  wasSeen,
  remember,
  resetSeen: () => seen.clear(),
};
