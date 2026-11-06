/**
 * Analytics Service
 * Handles email tracking, statistics, retention and user activity.
 */

'use strict';

const crypto = require('crypto');
const net = require('net');
const {
  isSensitiveTrackingUrl,
  isHostAllowed,
  redactUrlForLog,
} = require('../utils/tracking-url-policy');

// Content Type UIDs
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';
const EMAIL_LINK_UID = 'plugin::magic-mail.email-link';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tracking ids (emailId, linkHash, recipientHash) are 32 lower-case hex chars. */
const TRACKING_ID_PATTERN = /^[a-f0-9]{32}$/;
/** HTML above this size is sent without click tracking (bounded work per send). */
const MAX_TRACKED_HTML_LENGTH = 5 * 1024 * 1024;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_SUBJECT_LENGTH = 255;
const BATCH_SIZE = 200;
const LINK_STORE_CONCURRENCY = 10;
const TRACKING_KEY_LABEL = 'magic-mail tracking v2';

const TRACKING_DEFAULTS = Object.freeze({
  eventRetentionDays: 90,
  linkTtlDays: 180,
  logRetentionDays: 0,
  maxLinksPerEmail: 100,
  allowedLinkHosts: [],
  anonymizeIp: true,
});

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '::',
  '[::]',
]);

let warnedMissingBaseUrl = false;

const hashesEqual = (actual, expected) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Reads a Strapi config value without throwing on partial test doubles.
 * @param {object} strapi
 * @param {string} key
 * @param {*} [fallback]
 * @returns {*}
 */
const readConfig = (strapi, key, fallback) => {
  try {
    const value = strapi?.config?.get?.(key, fallback);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
};

/**
 * Effective `tracking` plugin config merged over safe defaults.
 * @param {object} strapi
 * @returns {typeof TRACKING_DEFAULTS}
 */
const getTrackingConfig = (strapi) => {
  const raw = readConfig(strapi, 'plugin::magic-mail.tracking', {});
  const configured = raw && typeof raw === 'object' ? raw : {};
  const out = { ...TRACKING_DEFAULTS };
  for (const key of ['eventRetentionDays', 'linkTtlDays', 'logRetentionDays', 'maxLinksPerEmail']) {
    if (Number.isInteger(configured[key]) && configured[key] >= 0) out[key] = configured[key];
  }
  if (Array.isArray(configured.allowedLinkHosts)) {
    out.allowedLinkHosts = configured.allowedLinkHosts.filter(
      (host) => typeof host === 'string' && host.trim()
    );
  }
  if (typeof configured.anonymizeIp === 'boolean') out.anonymizeIp = configured.anonymizeIp;
  return out;
};

/**
 * Truncates an IP address: IPv4 to /24, IPv6 to /48. IPv4-mapped IPv6
 * addresses are treated as IPv4. Returns null for anything that is not an IP.
 *
 * @param {*} value
 * @returns {string|null}
 */
const anonymizeIp = (value) => {
  if (typeof value !== 'string') return null;
  let ip = value.trim().split('%')[0];
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    const [head, tail = ''] = lower.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    // An embedded IPv4 tail counts as two groups; it never reaches the /48 prefix.
    const tailCount = tailGroups.reduce((sum, group) => sum + (group.includes('.') ? 2 : 1), 0);
    const groups = lower.includes('::')
      ? [
          ...headGroups,
          ...new Array(Math.max(0, 8 - headGroups.length - tailCount)).fill('0'),
          ...tailGroups,
        ]
      : headGroups;
    const prefix = groups.slice(0, 3).map((group) => (parseInt(group, 16) || 0).toString(16));
    while (prefix.length < 3) prefix.push('0');
    return `${prefix.join(':')}::`;
  }
  return null;
};

/**
 * Returns the bare, lower-cased first address of a recipient value
 * (string, CSV, display-name form, array or `{ address }` object).
 *
 * @param {*} value
 * @returns {string}
 */
const normalizeRecipient = (value) => {
  const first = Array.isArray(value) ? value.find((item) => item) : value;
  if (!first) return '';
  if (typeof first === 'object' && typeof first.address === 'string') {
    return first.address.trim().toLowerCase();
  }
  if (typeof first !== 'string') return '';
  if (!/[<,"(]/.test(first)) return first.trim().toLowerCase();
  try {
    // eslint-disable-next-line global-require
    let parse = require('nodemailer/lib/addressparser');
    parse = parse.default || parse;
    const flat = [];
    for (const entry of parse(first)) {
      if (Array.isArray(entry.group)) flat.push(...entry.group);
      else flat.push(entry);
    }
    const found = flat.find(
      (entry) => entry && typeof entry.address === 'string' && entry.address.includes('@')
    );
    if (found) return found.address.trim().toLowerCase();
  } catch {
    // fall through to the plain form
  }
  return first.split(',')[0].trim().toLowerCase();
};

/**
 * Validates a candidate public base URL: absolute http(s), no credentials,
 * and (in production) not a loopback / unspecified host.
 *
 * @param {*} value
 * @returns {string|null} Origin plus path, without trailing slash
 */
const toPublicBaseUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  if (isProduction() && LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())) return null;
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
};

/**
 * Normalised REST prefix (`api.rest.prefix`, default `/api`).
 * @param {object} strapi
 * @returns {string}
 */
const getRestPrefix = (strapi) => {
  const raw = readConfig(strapi, 'api.rest.prefix', '/api');
  if (typeof raw !== 'string' || !/^\/?[A-Za-z0-9._~\-/]*$/.test(raw.trim())) return '/api';
  const prefix = raw.trim();
  if (!prefix || prefix === '/') return '';
  const withSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return withSlash.replace(/\/+$/, '');
};

/**
 * Resolves the public URL the tracking pixel and click redirects point at:
 * plugin setting `trackingBaseUrl`, then `server.url`, then Strapi's computed
 * `server.absoluteUrl`. Returns null when no usable public URL exists; the
 * caller then sends the email untracked (never to localhost in production).
 *
 * @param {object} strapi
 * @param {object} [settings] - Plugin settings
 * @returns {string|null} e.g. `https://cms.example.com/api/magic-mail/track`
 */
const resolveTrackingEndpoint = (strapi, settings = {}) => {
  const base =
    toPublicBaseUrl(settings?.trackingBaseUrl) ||
    toPublicBaseUrl(readConfig(strapi, 'server.url', '')) ||
    toPublicBaseUrl(readConfig(strapi, 'server.absoluteUrl', ''));
  if (!base) {
    if (!warnedMissingBaseUrl) {
      warnedMissingBaseUrl = true;
      strapi?.log?.warn?.(
        '[magic-mail] No public URL for tracking. Set "Tracking base URL" in the MagicMail settings or ' +
          'server.url in config/server; emails are sent without open/click tracking until then.'
      );
    }
    return null;
  }
  return `${base}${getRestPrefix(strapi)}/magic-mail/track`;
};

// ---------------------------------------------------------------------------
// Link rewriting (linear time; no backtracking-prone regular expressions)
// ---------------------------------------------------------------------------

/**
 * `<a` followed by whitespace, `>` or `/`, then everything up to the next
 * `>` that is not interrupted by `<`. `[^<>]*` stops at the next tag start,
 * so every input character is examined a bounded number of times.
 */
const ANCHOR_TAG = /<a(?=[\s>/])[^<>]*>/gi;

const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/**
 * Decodes the HTML character references that can occur in an attribute value.
 * @param {string} value
 * @returns {string}
 */
const decodeAttributeValue = (value) =>
  value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (entity, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      } catch {
        return entity;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? entity : named;
  });

const escapeAttributeValue = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/**
 * Locates the `href` attribute value inside one anchor start tag with a
 * single left-to-right scan (attribute values are skipped as a whole, so an
 * `href=` inside another attribute's value is never matched).
 *
 * @param {string} tag - e.g. `<a class="x" href='https://…'>`
 * @returns {{start: number, end: number, quote: string, value: string}|null}
 */
const findHrefAttribute = (tag) => {
  const { length } = tag;
  let i = 2; // after "<a"
  while (i < length) {
    while (i < length && (isSpace(tag[i]) || tag[i] === '/')) i += 1;
    if (i >= length || tag[i] === '>') return null;
    const nameStart = i;
    while (i < length && !isSpace(tag[i]) && tag[i] !== '=' && tag[i] !== '>' && tag[i] !== '/')
      i += 1;
    const name = tag.slice(nameStart, i).toLowerCase();
    while (i < length && isSpace(tag[i])) i += 1;
    if (tag[i] !== '=') continue; // attribute without value
    i += 1;
    while (i < length && isSpace(tag[i])) i += 1;
    const quote = tag[i] === '"' || tag[i] === "'" ? tag[i] : '';
    let valueStart;
    let valueEnd;
    if (quote) {
      valueStart = i + 1;
      valueEnd = tag.indexOf(quote, valueStart);
      if (valueEnd === -1) return null;
      i = valueEnd + 1;
    } else {
      valueStart = i;
      while (i < length && !isSpace(tag[i]) && tag[i] !== '>') i += 1;
      valueEnd = i;
    }
    if (name === 'href') {
      return { start: valueStart, end: valueEnd, quote, value: tag.slice(valueStart, valueEnd) };
    }
  }
  return null;
};

/**
 * Calls `mapUrl` for the href of every anchor tag and replaces the href with
 * the returned string (or keeps it when `mapUrl` returns a falsy value).
 * Runs in linear time in the size of `html`.
 *
 * @param {string} html
 * @param {(url: string) => (string|null|undefined)} mapUrl - Receives the entity-decoded, trimmed href
 * @returns {string}
 */
const rewriteAnchorHrefs = (html, mapUrl) => {
  if (typeof html !== 'string' || html.length === 0) return html;
  return html.replace(ANCHOR_TAG, (tag) => {
    const href = findHrefAttribute(tag);
    if (!href) return tag;
    const url = decodeAttributeValue(href.value).trim();
    const replacement = url ? mapUrl(url) : null;
    if (!replacement) return tag;
    const value = escapeAttributeValue(replacement);
    if (href.quote) return `${tag.slice(0, href.start)}${value}${tag.slice(href.end)}`;
    return `${tag.slice(0, href.start)}"${value}"${tag.slice(href.end)}`;
  });
};

/**
 * Runs async tasks with bounded concurrency.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} worker
 * @returns {Promise<void>}
 */
const runWithConcurrency = async (items, limit, worker) => {
  let index = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      // eslint-disable-next-line no-await-in-loop
      await worker(item);
    }
  });
  await Promise.all(runners);
};

const toPositiveInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
};

// ---------------------------------------------------------------------------
// Tracking secrets
// ---------------------------------------------------------------------------

/**
 * Strapi app keys from config (`server.app.keys`) or the APP_KEYS env.
 * @param {object} strapi
 * @returns {string[]}
 */
const getAppKeys = (strapi) => {
  const configured = readConfig(strapi, 'server.app.keys', null);
  if (Array.isArray(configured)) return configured.filter((key) => typeof key === 'string' && key);
  return String(process.env.APP_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
};

/**
 * Derives a domain-separated HMAC key from a configured secret so that a
 * shared secret (e.g. the encryption key) is never used directly.
 * @param {string} secret
 * @returns {Buffer}
 */
const deriveTrackingKey = (secret) =>
  crypto.createHmac('sha256', secret).update(TRACKING_KEY_LABEL).digest();

const hmac32 = (key, message) =>
  crypto.createHmac('sha256', key).update(message).digest('hex').substring(0, 32);

module.exports = ({ strapi }) => ({
  /**
   * Generate unique email ID for tracking
   */
  generateEmailId() {
    return crypto.randomBytes(16).toString('hex');
  },

  /**
   * The secret new tracking hashes are signed with. A dedicated, stable
   * secret is preferred: MAGIC_MAIL_TRACKING_SECRET, then
   * MAGIC_MAIL_ENCRYPTION_KEY (mandatory in production, never rotated), then
   * the first Strapi app key (development only; app keys are rotatable).
   *
   * @returns {string}
   * @throws {Error} When no secret is configured at all
   */
  getTrackingSecret() {
    const secret =
      process.env.MAGIC_MAIL_TRACKING_SECRET ||
      process.env.MAGIC_MAIL_ENCRYPTION_KEY ||
      getAppKeys(strapi)[0];
    if (!secret) {
      throw new Error(
        '[magic-mail] FATAL: No tracking secret configured. ' +
          'Set MAGIC_MAIL_TRACKING_SECRET or MAGIC_MAIL_ENCRYPTION_KEY in your environment variables.'
      );
    }
    return secret;
  },

  /**
   * Generate secure hash for recipient (for tracking URLs). The recipient is
   * reduced to its first bare address, so arrays, CSV and display-name forms
   * hash the same as the stored log recipient.
   *
   * @param {string} emailId
   * @param {*} recipient
   * @returns {string} 32 hex characters
   */
  generateRecipientHash(emailId, recipient) {
    const key = deriveTrackingKey(this.getTrackingSecret());
    return hmac32(key, `${emailId}:${normalizeRecipient(recipient)}`);
  },

  /**
   * Verifies a recipient hash against the current secret, the secrets in
   * MAGIC_MAIL_TRACKING_SECRET_PREVIOUS (comma-separated), every app key, and
   * the pre-4.0 scheme (raw APP_KEYS string or MAGIC_MAIL_ENCRYPTION_KEY), so
   * links in mails sent before an upgrade or a secret rotation keep working.
   *
   * @param {string} emailId
   * @param {string} storedRecipient - email-log.recipient
   * @param {string} candidate - Hash from the URL
   * @returns {boolean}
   */
  verifyRecipientHash(emailId, storedRecipient, candidate) {
    if (typeof candidate !== 'string' || !TRACKING_ID_PATTERN.test(candidate)) return false;
    const normalized = normalizeRecipient(storedRecipient);
    let matched = false;

    const secrets = new Set();
    try {
      secrets.add(this.getTrackingSecret());
    } catch {
      // only legacy secrets may exist
    }
    String(process.env.MAGIC_MAIL_TRACKING_SECRET_PREVIOUS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => secrets.add(value));
    for (const value of getAppKeys(strapi)) secrets.add(value);
    if (process.env.MAGIC_MAIL_ENCRYPTION_KEY) secrets.add(process.env.MAGIC_MAIL_ENCRYPTION_KEY);
    for (const secret of secrets) {
      // Evaluate every candidate (no early exit) to keep timing uniform.
      if (hashesEqual(candidate, hmac32(deriveTrackingKey(secret), `${emailId}:${normalized}`)))
        matched = true;
    }

    // Pre-4.0 hashes: HMAC(APP_KEYS || MAGIC_MAIL_ENCRYPTION_KEY, `${emailId}-${recipient}`).
    const legacySecrets = new Set(
      [process.env.APP_KEYS, process.env.MAGIC_MAIL_ENCRYPTION_KEY].filter(Boolean)
    );
    const legacyRecipients = new Set([
      normalized,
      String(storedRecipient || '')
        .trim()
        .toLowerCase(),
    ]);
    for (const secret of legacySecrets) {
      for (const recipient of legacyRecipients) {
        if (hashesEqual(candidate, hmac32(secret, `${emailId}-${recipient}`))) matched = true;
      }
    }
    return matched;
  },

  /**
   * Records a pending attempt before provider dispatch so its tracking links
   * can be persisted. Provider acceptance or rejection updates this state.
   *
   * `recipient` is the first bare address (the column is an email field); all
   * recipients are kept in `metadata.recipients`. `templateId` holds the
   * numeric template reference id (null when unknown); a non-numeric
   * requested template id is kept in `metadata.requestedTemplateId`.
   *
   * @param {object} data Validated email metadata and delivery details.
   * @returns {Promise<object>} The pending email log document.
   */
  async createEmailLog(data) {
    const emailId = this.generateEmailId();
    const recipient = normalizeRecipient(data.to);
    const allRecipients = (Array.isArray(data.to) ? data.to : [data.to])
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim().toLowerCase());
    const subject = String(data.subject ?? '').slice(0, MAX_SUBJECT_LENGTH);
    const templateId =
      toPositiveInteger(data.templateReferenceId) ?? toPositiveInteger(data.templateId);

    const metadata = {
      ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
    };
    if (allRecipients.length > 1 || (allRecipients[0] && allRecipients[0] !== recipient)) {
      metadata.recipients = allRecipients.slice(0, 100);
    }
    if (
      data.templateId !== undefined &&
      data.templateId !== null &&
      data.templateId !== '' &&
      toPositiveInteger(data.templateId) !== templateId
    ) {
      metadata.requestedTemplateId = String(data.templateId).slice(0, 128);
    }

    const logEntry = await strapi.documents(EMAIL_LOG_UID).create({
      data: {
        emailId,
        user: data.userId || null,
        recipient,
        recipientName: data.recipientName ? String(data.recipientName).slice(0, 255) : null,
        subject,
        templateId,
        templateName: data.templateName ? String(data.templateName).slice(0, 255) : null,
        accountId: data.accountId || null,
        accountName: data.accountName || null,
        sentAt: new Date(),
        deliveryStatus: 'pending',
        metadata,
      },
    });

    strapi.log.info(`[magic-mail] [INFO] Email delivery attempt recorded: ${emailId}`);
    return logEntry;
  },

  /**
   * Builds the privacy-reduced request fields stored on a tracking event:
   * the IP truncated (unless `tracking.anonymizeIp` is false), the user agent
   * capped at 512 characters, and no location data.
   *
   * @param {object} req - Koa request
   * @returns {{ipAddress: string|null, userAgent: string|null}}
   */
  requestFingerprint(req) {
    const { anonymizeIp: shouldAnonymize } = getTrackingConfig(strapi);
    // Only Koa's `request.ip` (which honours server.proxy) is trusted; a raw
    // X-Forwarded-For header is client-controlled.
    const rawIp = typeof req?.ip === 'string' ? req.ip : null;
    let ipAddress = null;
    if (rawIp) ipAddress = shouldAnonymize ? anonymizeIp(rawIp) : rawIp.slice(0, 64);
    const agent = req?.headers?.['user-agent'];
    const userAgent =
      typeof agent === 'string' && agent ? agent.slice(0, MAX_USER_AGENT_LENGTH) : null;
    return { ipAddress, userAgent };
  },

  /**
   * Record email open event
   */
  async recordOpen(emailId, recipientHash, req) {
    try {
      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        strapi.log.debug('[magic-mail] Email log not found for open tracking');
        return null;
      }

      if (!this.verifyRecipientHash(emailId, emailLog.recipient, recipientHash)) {
        strapi.log.warn('[magic-mail] Invalid recipient hash for open tracking');
        return null;
      }

      const now = new Date();

      await strapi.documents(EMAIL_LOG_UID).update({
        documentId: emailLog.documentId,
        data: {
          openCount: (emailLog.openCount || 0) + 1,
          firstOpenedAt: emailLog.firstOpenedAt || now,
          lastOpenedAt: now,
        },
      });

      const event = await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: emailLog.documentId,
          type: 'open',
          timestamp: now,
          ...this.requestFingerprint(req),
        },
      });

      strapi.log.info(
        `[magic-mail] [EMAIL] Tracking open recorded (count: ${(emailLog.openCount || 0) + 1})`
      );
      return event;
    } catch (error) {
      strapi.log.error('[magic-mail] Error recording open:', error?.name || 'Error');
      return null;
    }
  },

  /**
   * Record email click event
   */
  async recordClick(emailId, linkHash, recipientHash, targetUrl, req) {
    try {
      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        return null;
      }

      if (!this.verifyRecipientHash(emailId, emailLog.recipient, recipientHash)) {
        return null;
      }

      const now = new Date();

      await strapi.documents(EMAIL_LOG_UID).update({
        documentId: emailLog.documentId,
        data: {
          clickCount: (emailLog.clickCount || 0) + 1,
        },
      });

      const event = await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: emailLog.documentId,
          type: 'click',
          timestamp: now,
          ...this.requestFingerprint(req),
          linkUrl: targetUrl,
        },
      });

      strapi.log.info('[magic-mail] [CLICK] Tracked link click recorded');
      return event;
    } catch (error) {
      strapi.log.error('[magic-mail] Error recording click:', error?.name || 'Error');
      return null;
    }
  },

  /**
   * Counts provider-accepted deliveries and their engagement events.
   * Legacy log rows without a delivery status are treated as sent.
   *
   * @param {{userId?: string, templateId?: number, accountId?: string, dateFrom?: string, dateTo?: string}} filters
   * @returns {Promise<{totalSent: number, totalOpened: number, totalClicked: number, totalBounced: number, openRate: number, clickRate: number, bounceRate: number}>}
   */
  async getStats(filters = {}) {
    const baseFilters = {};

    if (filters.userId) {
      baseFilters.user = { documentId: filters.userId };
    }
    if (filters.templateId) {
      baseFilters.templateId = filters.templateId;
    }
    if (filters.accountId) {
      baseFilters.accountId = filters.accountId;
    }
    if (filters.dateFrom) {
      baseFilters.sentAt = { $gte: new Date(filters.dateFrom) };
    }
    if (filters.dateTo) {
      baseFilters.sentAt = { ...baseFilters.sentAt, $lte: new Date(filters.dateTo) };
    }
    // New rows count only after provider acceptance. Legacy rows have no
    // deliveryStatus, so use their post-acceptance deliveredAt timestamp.
    baseFilters.$or = [
      { deliveryStatus: 'sent' },
      { deliveryStatus: { $null: true }, deliveredAt: { $notNull: true } },
    ];

    const [totalSent, totalOpened, totalClicked, totalBounced] = await Promise.all([
      strapi.documents(EMAIL_LOG_UID).count({
        filters: baseFilters,
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, openCount: { $gt: 0 } },
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, clickCount: { $gt: 0 } },
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, bounced: true },
      }),
    ]);

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;

    return {
      totalSent,
      totalOpened,
      totalClicked,
      totalBounced,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      bounceRate: Math.round(bounceRate * 10) / 10,
    };
  },

  /**
   * Lists email logs with server-side search, filters and pagination.
   *
   * @param {{userId?: string, templateId?: number, search?: string, deliveryStatus?: 'pending'|'sent'|'failed'}} filters
   *   `search` matches recipient, recipient name, subject and template name (case-insensitive).
   * @param {{page?: number, pageSize?: number}} pagination - pageSize is capped at 100
   * @returns {Promise<{data: object[], pagination: {page: number, pageSize: number, pageCount: number, total: number}}>}
   */
  async getEmailLogs(filters = {}, pagination = {}) {
    const where = {};

    if (filters.userId) {
      where.user = { documentId: filters.userId };
    }
    if (filters.templateId) {
      where.templateId = filters.templateId;
    }
    if (filters.deliveryStatus) {
      where.deliveryStatus = filters.deliveryStatus;
    }
    const search = typeof filters.search === 'string' ? filters.search.trim().slice(0, 500) : '';
    if (search) {
      where.$or = [
        { recipient: { $containsi: search } },
        { subject: { $containsi: search } },
        { recipientName: { $containsi: search } },
        { templateName: { $containsi: search } },
      ];
    }

    const page = Number.isInteger(pagination.page) && pagination.page > 0 ? pagination.page : 1;
    const pageSize =
      Number.isInteger(pagination.pageSize) && pagination.pageSize > 0
        ? Math.min(pagination.pageSize, 100)
        : 25;

    const [logs, total] = await Promise.all([
      strapi.documents(EMAIL_LOG_UID).findMany({
        filters: where,
        sort: [{ sentAt: 'desc' }, { id: 'desc' }],
        limit: pageSize,
        // Strapi v5 Document Service paginates with `start`, not `offset`.
        start: (page - 1) * pageSize,
        // Field-limited populate: never expose private user columns
        // (password, resetPasswordToken, confirmationToken).
        populate: { user: { fields: ['id', 'documentId', 'email', 'username'] } },
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: where,
      }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
        total,
      },
    };
  },

  /**
   * Get email log details with events
   */
  async getEmailLogDetails(emailId) {
    const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId },
      populate: {
        user: { fields: ['id', 'documentId', 'email', 'username'] },
        events: true,
      },
    });

    return emailLog;
  },

  /**
   * Get user email activity
   */
  async getUserActivity(userId) {
    const emailLogs = await strapi.documents(EMAIL_LOG_UID).findMany({
      filters: { user: { documentId: userId } },
      sort: [{ sentAt: 'desc' }],
      limit: 50,
    });

    const stats = await this.getStats({ userId });

    return {
      stats,
      recentEmails: emailLogs,
    };
  },

  /**
   * Location data is not collected (privacy). Kept for API compatibility.
   * @returns {null}
   */
  parseLocation() {
    return null;
  },

  /**
   * Public tracking endpoint base (`<public url><rest prefix>/magic-mail/track`)
   * or null when no public URL is configured.
   *
   * @param {object} [settings] - Plugin settings (for `trackingBaseUrl`)
   * @returns {string|null}
   */
  getTrackingEndpoint(settings) {
    return resolveTrackingEndpoint(strapi, settings);
  },

  /**
   * Inject tracking pixel into HTML. Without a public tracking URL the HTML is
   * returned unchanged.
   *
   * @param {string} html
   * @param {string} emailId
   * @param {string} recipientHash
   * @param {string|null} [endpoint] - From getTrackingEndpoint(); resolved from server config when omitted
   * @returns {string}
   */
  injectTrackingPixel(html, emailId, recipientHash, endpoint) {
    const base = endpoint === undefined ? resolveTrackingEndpoint(strapi, {}) : endpoint;
    if (!base || typeof html !== 'string') return html;

    // Random parameter prevents email client caching.
    const randomToken = crypto.randomBytes(8).toString('hex');
    const trackingUrl = `${base}/open/${emailId}/${recipientHash}?r=${randomToken}`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;

    strapi.log.debug('[magic-mail] [PIXEL] Tracking pixel injected');

    const closingBody = html.toLowerCase().lastIndexOf('</body>');
    if (closingBody !== -1) {
      return `${html.slice(0, closingBody)}${trackingPixel}${html.slice(closingBody)}`;
    }
    return `${html}${trackingPixel}`;
  },

  /**
   * Adds open and click tracking in one step with one resolved public URL.
   * Without a public URL the HTML is returned unchanged.
   *
   * @param {string} html
   * @param {string} emailId
   * @param {string} recipientHash
   * @param {{openTracking?: boolean, linkTracking?: boolean, settings?: object}} [options]
   * @returns {Promise<string>}
   */
  async addTracking(
    html,
    emailId,
    recipientHash,
    { openTracking = true, linkTracking = true, settings } = {}
  ) {
    let pluginSettings = settings;
    if (!pluginSettings) {
      try {
        pluginSettings =
          (await strapi.plugin('magic-mail').service('plugin-settings').getSettings()) || {};
      } catch {
        pluginSettings = {};
      }
    }
    const endpoint = resolveTrackingEndpoint(strapi, pluginSettings);
    if (!endpoint) return html;
    let result = html;
    if (linkTracking)
      result = await this.rewriteLinksForTracking(result, emailId, recipientHash, { endpoint });
    if (openTracking) result = this.injectTrackingPixel(result, emailId, recipientHash, endpoint);
    return result;
  },

  /**
   * Rewrites anchor hrefs to click-tracking redirects.
   *
   * Rules: only absolute http(s) URLs; never sensitive/authentication URLs;
   * at most `tracking.maxLinksPerEmail` distinct URLs; when
   * `tracking.allowedLinkHosts` is set only those hosts; for Content-API sends
   * without an allowlist no links are rewritten (an API token must not be able
   * to mint redirects on this domain). A link is only rewritten after its
   * mapping was stored, so a failed insert never produces a dead link.
   *
   * @param {string} html
   * @param {string} emailId
   * @param {string} recipientHash
   * @param {{endpoint?: string|null}} [options]
   * @returns {Promise<string>}
   */
  async rewriteLinksForTracking(html, emailId, recipientHash, options = {}) {
    if (typeof html !== 'string' || html.length === 0) return html;
    if (html.length > MAX_TRACKED_HTML_LENGTH) {
      strapi.log.warn(
        '[magic-mail] [LINK-TRACK] HTML too large for click tracking; links left unchanged'
      );
      return html;
    }

    let { endpoint } = options;
    if (endpoint === undefined) {
      let settings = {};
      try {
        settings =
          (await strapi.plugin('magic-mail').service('plugin-settings').getSettings()) || {};
      } catch {
        settings = {};
      }
      endpoint = resolveTrackingEndpoint(strapi, settings);
    }
    if (!endpoint) return html;

    const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId },
    });
    if (!emailLog) {
      strapi.log.error('[magic-mail] Cannot rewrite links: email log not found');
      return html;
    }

    const config = getTrackingConfig(strapi);
    const restrictHosts = config.allowedLinkHosts.length > 0;
    if (!restrictHosts && emailLog.metadata?.source === 'content-api') {
      strapi.log.debug(
        '[magic-mail] [LINK-TRACK] Content-API send without tracking.allowedLinkHosts; links left unchanged'
      );
      return html;
    }

    // Pass 1: collect eligible, distinct URLs (bounded).
    const candidates = new Map();
    const rejected = new Set();
    let skippedOverCap = 0;
    rewriteAnchorHrefs(html, (url) => {
      if (candidates.has(url) || rejected.has(url)) return null;
      if (!/^https?:\/\//i.test(url) || url.includes('/magic-mail/track/')) return null;
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return null;
      }
      if (restrictHosts && !isHostAllowed(parsed.hostname, config.allowedLinkHosts)) return null;
      if (isSensitiveTrackingUrl(url)) {
        rejected.add(url);
        strapi.log.debug(`[magic-mail] [SKIP] Not tracking sensitive URL: ${redactUrlForLog(url)}`);
        return null;
      }
      if (config.maxLinksPerEmail > 0 && candidates.size >= config.maxLinksPerEmail) {
        rejected.add(url);
        skippedOverCap += 1;
        return null;
      }
      const linkHash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 32);
      candidates.set(url, linkHash);
      return null;
    });

    if (skippedOverCap > 0) {
      strapi.log.warn(
        `[magic-mail] [LINK-TRACK] Link limit reached; ${skippedOverCap} link(s) left untracked`
      );
    }
    if (candidates.size === 0) {
      strapi.log.debug('[magic-mail] [LINK-TRACK] No eligible links found in email HTML');
      return html;
    }

    // Persist mappings with bounded concurrency; only stored links are rewritten.
    const stored = new Map();
    await runWithConcurrency(
      [...candidates.entries()],
      LINK_STORE_CONCURRENCY,
      async ([url, linkHash]) => {
        try {
          await this.storeLinkMapping(emailLog.documentId, linkHash, url);
          stored.set(url, `${endpoint}/click/${emailId}/${linkHash}/${recipientHash}`);
        } catch {
          // storeLinkMapping already logged; the link stays untracked
        }
      }
    );

    // Pass 2: replace hrefs in a single linear scan.
    const result = rewriteAnchorHrefs(html, (url) => stored.get(url) || null);
    strapi.log.info(`[magic-mail] [SUCCESS] Rewrote ${stored.size} link(s) for click tracking`);
    return result;
  },

  /**
   * Persists a link mapping used for click tracking. Validates the URL
   * protocol at storage time so nothing unsafe can be persisted even when a
   * future caller bypasses the rewrite helper.
   *
   * @param {string} emailLogDocId
   * @param {string} linkHash
   * @param {string} originalUrl
   * @returns {Promise<object>}
   * @throws {Error} When the URL is not an http(s) absolute URL
   */
  async storeLinkMapping(emailLogDocId, linkHash, originalUrl) {
    try {
      if (typeof originalUrl !== 'string' || originalUrl.trim().length === 0) {
        throw new Error('originalUrl is required');
      }
      let parsed;
      try {
        parsed = new URL(originalUrl);
      } catch {
        throw new Error('Invalid originalUrl (not a valid absolute URL)');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Disallowed URL protocol "${parsed.protocol}" for tracking link`);
      }

      const existing = await strapi.documents(EMAIL_LINK_UID).findFirst({
        filters: {
          emailLog: { documentId: emailLogDocId },
          linkHash,
        },
      });

      if (existing) {
        strapi.log.debug('[magic-mail] Link mapping already exists');
        return existing;
      }

      const linkMapping = await strapi.documents(EMAIL_LINK_UID).create({
        data: {
          emailLog: emailLogDocId,
          linkHash,
          originalUrl,
          clickCount: 0,
        },
      });

      strapi.log.debug('[magic-mail] [SAVE] Stored link mapping');
      return linkMapping;
    } catch (error) {
      strapi.log.error('[magic-mail] Error storing link mapping:', error?.name || 'Error');
      throw error;
    }
  },

  /**
   * Resolves a click to its stored destination. Returns null for unknown
   * ids, a wrong recipient hash, an expired link (`tracking.linkTtlDays`) or a
   * destination outside `tracking.allowedLinkHosts` (when configured).
   *
   * @param {string} emailId
   * @param {string} linkHash
   * @param {string} recipientHash
   * @param {{count?: boolean}} [options] - count=false resolves without updating counters
   * @returns {Promise<string|null>}
   */
  async getOriginalUrlFromHash(emailId, linkHash, recipientHash, { count = true } = {}) {
    try {
      if (typeof linkHash !== 'string' || !linkHash || linkHash.length > 64) return null;

      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        strapi.log.debug('[magic-mail] Email log not found for click tracking');
        return null;
      }

      if (!this.verifyRecipientHash(emailId, emailLog.recipient, recipientHash)) {
        strapi.log.warn('[magic-mail] Invalid recipient hash for click tracking');
        return null;
      }

      const linkMapping = await strapi.documents(EMAIL_LINK_UID).findFirst({
        filters: {
          emailLog: { documentId: emailLog.documentId },
          linkHash,
        },
      });

      if (!linkMapping) {
        strapi.log.debug('[magic-mail] Link mapping not found');
        return null;
      }

      const config = getTrackingConfig(strapi);
      if (config.linkTtlDays > 0) {
        const created = new Date(
          linkMapping.createdAt || emailLog.sentAt || emailLog.createdAt || 0
        ).getTime();
        if (
          Number.isFinite(created) &&
          created > 0 &&
          Date.now() - created > config.linkTtlDays * DAY_MS
        ) {
          strapi.log.debug('[magic-mail] Tracking link expired');
          return null;
        }
      }
      if (config.allowedLinkHosts.length > 0) {
        let host = '';
        try {
          host = new URL(linkMapping.originalUrl).hostname;
        } catch {
          return null;
        }
        if (!isHostAllowed(host, config.allowedLinkHosts)) return null;
      }

      if (count) {
        const now = new Date();
        await strapi.documents(EMAIL_LINK_UID).update({
          documentId: linkMapping.documentId,
          data: {
            clickCount: (linkMapping.clickCount || 0) + 1,
            firstClickedAt: linkMapping.firstClickedAt || now,
            lastClickedAt: now,
          },
        });
      }

      return linkMapping.originalUrl;
    } catch (error) {
      strapi.log.error('[magic-mail] Error getting original URL:', error?.name || 'Error');
      return null;
    }
  },

  /**
   * Deletes email logs by database id together with their events and links.
   *
   * @param {number[]} ids - email-log row ids
   * @returns {Promise<number>} Number of deleted logs
   */
  async deleteEmailLogsByIds(ids) {
    const logIds = (ids || []).filter((id) => id !== null && id !== undefined);
    if (logIds.length === 0) return 0;
    for (const uid of [EMAIL_EVENT_UID, EMAIL_LINK_UID]) {
      const query = strapi.db.query(uid);
      for (let guard = 0; guard < 100000; guard += 1) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await query.findMany({
          select: ['id'],
          where: { emailLog: { id: { $in: logIds } } },
          limit: 1000,
        });
        if (!rows || rows.length === 0) break;
        // eslint-disable-next-line no-await-in-loop
        await query.deleteMany({ where: { id: { $in: rows.map((row) => row.id) } } });
        if (rows.length < 1000) break;
      }
    }
    const result = await strapi.db
      .query(EMAIL_LOG_UID)
      .deleteMany({ where: { id: { $in: logIds } } });
    return typeof result?.count === 'number' ? result.count : logIds.length;
  },

  /**
   * Deletes email logs (with events and links) matching `where`, oldest
   * first, in batches.
   *
   * @param {object} where - Query-engine where clause for email-log
   * @param {{max?: number}} [options] - Upper bound of logs deleted in this call
   * @returns {Promise<{deletedCount: number, hasMore: boolean}>}
   */
  async deleteEmailLogs(where = {}, { max = 10_000 } = {}) {
    const query = strapi.db.query(EMAIL_LOG_UID);
    let deletedCount = 0;
    while (deletedCount < max) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await query.findMany({
        select: ['id'],
        where,
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        limit: Math.min(BATCH_SIZE, max - deletedCount),
      });
      if (!rows || rows.length === 0) break;
      // eslint-disable-next-line no-await-in-loop
      const deleted = await this.deleteEmailLogsByIds(rows.map((row) => row.id));
      deletedCount += deleted;
      if (deleted === 0) break; // no progress: never loop forever
    }
    const remaining = deletedCount >= max ? await query.count({ where }) : 0;
    return { deletedCount, hasMore: remaining > 0 };
  },

  /**
   * One-time privacy migration for rows written before 4.0: truncates stored
   * IPs, drops `location`, and clears click URLs the current policy treats as
   * sensitive. Pages by id cursor; the store flag is set after a full pass.
   *
   * @returns {Promise<number>} Number of rows changed
   */
  async migrateLegacyTrackingEvents() {
    const store = strapi.store({ type: 'plugin', name: 'magic-mail' });
    if (await store.get({ key: 'trackingPrivacyMigrationV1' })) return 0;

    const { anonymizeIp: shouldAnonymize } = getTrackingConfig(strapi);
    const query = strapi.db.query(EMAIL_EVENT_UID);
    let lastId = 0;
    let changed = 0;
    for (let guard = 0; guard < 100000; guard += 1) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await query.findMany({
        select: ['id', 'ipAddress', 'location', 'linkUrl'],
        where: { id: { $gt: lastId } },
        orderBy: { id: 'asc' },
        limit: BATCH_SIZE,
      });
      if (!rows || rows.length === 0) break;
      lastId = rows[rows.length - 1].id;
      for (const row of rows) {
        const data = {};
        if (shouldAnonymize && row.ipAddress) {
          const truncated = anonymizeIp(row.ipAddress);
          if (truncated !== row.ipAddress) data.ipAddress = truncated;
        }
        if (row.location !== null && row.location !== undefined) data.location = null;
        if (row.linkUrl && isSensitiveTrackingUrl(row.linkUrl)) data.linkUrl = null;
        if (Object.keys(data).length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await query.update({ where: { id: row.id }, data });
          changed += 1;
        }
      }
      if (rows.length < BATCH_SIZE) break;
    }

    await store.set({
      key: 'trackingPrivacyMigrationV1',
      value: { done: true, changed, at: new Date().toISOString() },
    });
    return changed;
  },

  /**
   * Retention: deletes tracking events older than `tracking.eventRetentionDays`,
   * link mappings older than `tracking.linkTtlDays` and (when configured) email
   * logs older than `tracking.logRetentionDays`. Each step is bounded.
   *
   * @param {Date} [now]
   * @returns {Promise<{events: number, links: number, logs: number}>}
   */
  async purgeExpiredTrackingData(now = new Date()) {
    const config = getTrackingConfig(strapi);
    const summary = { events: 0, links: 0, logs: 0 };

    const purgeOlderThan = async (uid, field, days) => {
      if (!(days > 0)) return 0;
      const cutoff = new Date(now.getTime() - days * DAY_MS);
      const query = strapi.db.query(uid);
      let removed = 0;
      for (let guard = 0; guard < 1000; guard += 1) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await query.findMany({
          select: ['id'],
          where: { [field]: { $lt: cutoff } },
          limit: 1000,
        });
        if (!rows || rows.length === 0) break;
        // eslint-disable-next-line no-await-in-loop
        await query.deleteMany({ where: { id: { $in: rows.map((row) => row.id) } } });
        removed += rows.length;
        if (rows.length < 1000) break;
      }
      return removed;
    };

    summary.events = await purgeOlderThan(EMAIL_EVENT_UID, 'timestamp', config.eventRetentionDays);
    summary.links = await purgeOlderThan(EMAIL_LINK_UID, 'createdAt', config.linkTtlDays);
    if (config.logRetentionDays > 0) {
      const cutoff = new Date(now.getTime() - config.logRetentionDays * DAY_MS);
      const { deletedCount } = await this.deleteEmailLogs(
        { sentAt: { $lt: cutoff } },
        { max: 50_000 }
      );
      summary.logs = deletedCount;
    }
    return summary;
  },

  /**
   * Scheduled maintenance: legacy privacy migration plus retention purge.
   * Never throws.
   *
   * @returns {Promise<void>}
   */
  async runTrackingMaintenance() {
    try {
      const changed = await this.migrateLegacyTrackingEvents();
      if (changed > 0)
        strapi.log.info(`[magic-mail] [PRIVACY] Anonymised ${changed} stored tracking event(s)`);
    } catch (error) {
      strapi.log.warn(
        '[magic-mail] Tracking privacy migration failed; it runs again later:',
        error?.name || 'Error'
      );
    }
    try {
      const { events, links, logs } = await this.purgeExpiredTrackingData();
      if (events + links + logs > 0) {
        strapi.log.info(
          `[magic-mail] [RETENTION] Removed ${events} event(s), ${links} link(s), ${logs} log(s)`
        );
      }
    } catch (error) {
      strapi.log.warn('[magic-mail] Tracking retention purge failed:', error?.name || 'Error');
    }
  },

  /**
   * Values for the server-owned `{{system.*}}` template merge tags. Callers
   * cannot override them.
   *
   * @param {{unsubscribeUrl?: string|null}} [input] - Resolved unsubscribe URL for this message
   * @param {Date} [now]
   * @returns {{date: string, year: string, unsubscribe: string, webview: string}}
   */
  buildSystemMergeTags({ unsubscribeUrl = null } = {}, now = new Date()) {
    let unsubscribe = '';
    if (typeof unsubscribeUrl === 'string' && unsubscribeUrl) {
      try {
        const { protocol } = new URL(unsubscribeUrl);
        if (['https:', 'http:', 'mailto:'].includes(protocol)) unsubscribe = unsubscribeUrl;
      } catch {
        unsubscribe = '';
      }
    }
    return {
      date: now.toISOString().slice(0, 10),
      year: String(now.getUTCFullYear()),
      unsubscribe,
      // Hosted web views are not supported; the tag renders empty.
      webview: '',
    };
  },
});

module.exports.TRACKING_ID_PATTERN = TRACKING_ID_PATTERN;
module.exports.__test__ = {
  anonymizeIp,
  normalizeRecipient,
  rewriteAnchorHrefs,
  findHrefAttribute,
  decodeAttributeValue,
  resolveTrackingEndpoint,
  getTrackingConfig,
  toPublicBaseUrl,
  resetWarnings() {
    warnedMissingBaseUrl = false;
  },
};
