'use strict';

/**
 * Bounce monitoring: reads the sending mailbox of an account and records
 * asynchronous bounces (non-delivery reports) that arrive after a provider
 * accepted a mail, for example Gmail's "Address not found".
 *
 * Modes
 *  - `imap`  SMTP accounts (and any account with IMAP access, e.g. Google
 *            Workspace with an app password): IMAP over TLS, incremental by
 *            UID with UIDVALIDITY (RFC 3501).
 *  - `gmail` Gmail OAuth accounts: Gmail API users.history.list with a
 *            stored historyId; needs the gmail.readonly scope.
 *  - `graph` Microsoft OAuth accounts: Microsoft Graph, Inbox messages
 *            received after a stored timestamp; needs Mail.Read.
 *  SendGrid and Mailgun report bounces through the signed webhooks instead.
 *
 * Every account is polled by one process at a time across all replicas and
 * workers (database lease, coordination.runSingleton). The cursor is stored on
 * the account, so a restart continues where the last poll stopped.
 *
 * Privacy: only bounce reports are fetched in full, never other mail. Nothing
 * of a message is stored except a reason code, the matched email log and a
 * hash of the report's mailbox id for de-duplication. Read-only unless the
 * admin turns on moving processed bounces (IMAP).
 */

const crypto = require('crypto');
const coordination = require('../utils/coordination');
const { parseBounce, looksLikeBounce, MAX_RAW_BYTES } = require('../utils/bounce-parser');
const { decryptCredentials, purposeHmac } = require('../utils/encryption');
const { normalizeMessageId } = require('../utils/message-id');
const { describeErrorForLog } = require('../utils/client-errors');

const ACCOUNT_UID = 'plugin::magic-mail.email-account';
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';
const OUTBOX_UID = 'plugin::magic-mail.outbox-message';
const SUPPRESSED_UID = 'plugin::magic-mail.suppressed-recipient';

/** Poll tick; each account is polled at most once per configured interval. */
const TICK_MS = 60_000;
/** History looked at on the first poll of an account. */
const INITIAL_LOOKBACK_MS = 3 * 24 * 3600_000;
/** Messages inspected per poll and account (oldest first, the rest next poll). */
const MAX_MESSAGES_PER_POLL = 500;
/** Full messages downloaded per poll and account. */
const MAX_DOWNLOADS_PER_POLL = 100;
const HTTP_TIMEOUT_MS = 20_000;
const MATCH_WINDOW_MS = 7 * 24 * 3600_000;
/** Folder names: 1-200 characters without control characters. */
const isSafeFolder = (value) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 200 &&
  ![...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
const PROCESSED_FOLDER = ['Magic Mail', 'Bounces'];

const GMAIL_READ_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/',
];
const GRAPH_READ_SCOPES = ['mail.read', 'mail.readwrite'];

/** Provider → supported modes (first is the default). */
const MODES = Object.freeze({
  smtp: ['imap'],
  'gmail-oauth': ['gmail', 'imap'],
  'microsoft-oauth': ['graph'],
  'yahoo-oauth': ['imap'],
  sendgrid: [],
  mailgun: [],
});

/** Known SMTP host → IMAP host pairs; otherwise `smtp.`/`mail.` → `imap.`. */
const IMAP_HOSTS = Object.freeze({
  'smtp.gmail.com': 'imap.gmail.com',
  'smtp.googlemail.com': 'imap.gmail.com',
  'smtp.office365.com': 'outlook.office365.com',
  'smtp-mail.outlook.com': 'outlook.office365.com',
  'smtp.mail.yahoo.com': 'imap.mail.yahoo.com',
  'smtp.ionos.de': 'imap.ionos.de',
  'smtp.strato.de': 'imap.strato.de',
  'smtp.web.de': 'imap.web.de',
  'mail.gmx.net': 'imap.gmx.net',
  'smtp.zoho.eu': 'imap.zoho.eu',
  'smtp.zoho.com': 'imap.zoho.com',
});

class BounceMonitorError extends Error {
  /**
   * @param {string} code - stable, non-sensitive code shown in the admin
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'BounceMonitorError';
    this.code = code;
  }
}

/**
 * IMAP host suggested for an SMTP host.
 *
 * @param {string} smtpHost
 * @returns {string}
 */
function suggestImapHost(smtpHost) {
  const host = String(smtpHost || '')
    .trim()
    .toLowerCase();
  if (!host) return '';
  if (IMAP_HOSTS[host]) return IMAP_HOSTS[host];
  if (/^(smtp|mail|smtpout|outgoing)\./.test(host)) return host.replace(/^[a-z]+\./, 'imap.');
  return host;
}

/**
 * Normalised per-account settings (non-secret part, stored as JSON).
 *
 * @param {object} account
 * @returns {{enabled: boolean, mode: string|null, folder: string, moveProcessed: boolean,
 *   imap: {host: string, port: number, secure: boolean, user: string, useSmtpLogin: boolean}}}
 */
function settingsFor(account) {
  const raw =
    account?.bounceMonitor && typeof account.bounceMonitor === 'object'
      ? account.bounceMonitor
      : {};
  const modes = MODES[account?.provider] || [];
  const mode = modes.includes(raw.mode) ? raw.mode : modes[0] || null;
  const imap = raw.imap && typeof raw.imap === 'object' ? raw.imap : {};
  const port = Number(imap.port);
  return {
    enabled: raw.enabled === true && Boolean(mode),
    mode,
    folder: isSafeFolder(raw.folder) ? raw.folder : 'INBOX',
    moveProcessed: raw.moveProcessed === true && mode === 'imap',
    imap: {
      host: typeof imap.host === 'string' ? imap.host.trim() : '',
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 993,
      secure: imap.secure !== false,
      user: typeof imap.user === 'string' ? imap.user.trim() : '',
      useSmtpLogin: imap.useSmtpLogin === true,
    },
  };
}

/**
 * Non-secret status for API responses.
 *
 * @param {object} account
 * @returns {object}
 */
function statusFor(account) {
  const state =
    account?.bounceMonitorState && typeof account.bounceMonitorState === 'object'
      ? account.bounceMonitorState
      : {};
  const settings = settingsFor(account);
  return {
    supportedModes: MODES[account?.provider] || [],
    enabled: settings.enabled,
    mode: settings.mode,
    lastPollAt: state.lastPollAt || null,
    lastStatus: state.lastStatus || null,
    lastErrorCode: state.lastErrorCode || null,
    lastScanned: Number(state.lastScanned) || 0,
    lastFound: Number(state.lastFound) || 0,
    totalBounced: Number(state.totalBounced) || 0,
    totalDeferred: Number(state.totalDeferred) || 0,
  };
}

/**
 * Masks an address for display in the suppression list ("j***@example.com").
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
 * Maps an error to a stable code without provider text.
 *
 * @param {*} error
 * @returns {string}
 */
function errorCodeFor(error) {
  if (error instanceof BounceMonitorError) return error.code;
  if (
    error?.authenticationFailed ||
    /AUTHENTICATIONFAILED|Invalid credentials/i.test(error?.responseText || '')
  ) {
    return 'AUTH_FAILED';
  }
  const code = String(error?.code || error?.cause?.code || '');
  if (
    [
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'TimeoutError',
      'ABORT_ERR',
      'CONNECT_TIMEOUT',
      'GreetingTimeout',
    ].includes(code) ||
    error?.name === 'TimeoutError'
  ) {
    return 'TIMEOUT';
  }
  if (
    [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNRESET',
      'EHOSTUNREACH',
      'NoConnection',
    ].includes(code)
  ) {
    return 'CONNECTION_FAILED';
  }
  if (/CERT|TLS|SSL/i.test(code)) return 'TLS_FAILED';
  if (code === 'MailboxDoesNotExist' || /NONEXISTENT/i.test(error?.serverResponseCode || '')) {
    return 'FOLDER_NOT_FOUND';
  }
  return 'POLL_FAILED';
}

module.exports = ({ strapi }) => {
  const log = strapi.log;
  /** Test seams: replace the IMAP client factory and fetch. */
  let imapFactory = (options) => {
    const { ImapFlow } = require('imapflow');
    return new ImapFlow(options);
  };
  let fetchImpl = (...args) => fetch(...args);
  let clock = () => Date.now();

  const router = () => strapi.plugin('magic-mail').service('email-router');
  const oauthService = () => strapi.plugin('magic-mail').service('oauth');
  const pluginSettings = () => strapi.plugin('magic-mail').service('plugin-settings');

  /** @returns {Promise<{intervalMs: number, suppressHardBounces: boolean}>} */
  const globalSettings = async () => {
    const stored = await pluginSettings()
      .getSettings()
      .then((value) => value || {})
      .catch(() => ({}));
    const minutes = Number(stored.bounceMonitorIntervalMinutes);
    return {
      intervalMs:
        (Number.isInteger(minutes) && minutes >= 1 && minutes <= 60 ? minutes : 5) * 60_000,
      suppressHardBounces: stored.suppressHardBounces === true,
    };
  };

  /** @param {object} account @returns {object} decrypted config ({} when unreadable) */
  const plainConfig = (account) => {
    try {
      return decryptCredentials(account.config) || {};
    } catch {
      throw new BounceMonitorError(
        'CREDENTIALS_UNREADABLE',
        'Stored credentials cannot be decrypted'
      );
    }
  };

  /** @param {object} account @returns {object} decrypted oauth blob */
  const plainOAuth = (account) => {
    try {
      return decryptCredentials(account.oauth) || {};
    } catch {
      throw new BounceMonitorError(
        'CREDENTIALS_UNREADABLE',
        'Stored OAuth tokens cannot be decrypted'
      );
    }
  };

  /**
   * Whether the stored OAuth grant includes mailbox read access.
   *
   * @param {object} account
   * @returns {boolean}
   */
  const hasReadScope = (account) => {
    let oauth;
    try {
      oauth = plainOAuth(account);
    } catch {
      return false;
    }
    const granted = String(oauth.scope || '')
      .toLowerCase()
      .split(/\s+/);
    const wanted = account.provider === 'microsoft-oauth' ? GRAPH_READ_SCOPES : GMAIL_READ_SCOPES;
    return granted.some((scope) =>
      wanted.some((w) => scope === w.toLowerCase() || scope.endsWith(`/${w.toLowerCase()}`))
    );
  };

  /** Writes the poll state (merged) without touching other account fields. */
  const saveState = async (account, patch) => {
    const current =
      account.bounceMonitorState && typeof account.bounceMonitorState === 'object'
        ? account.bounceMonitorState
        : {};
    const next = { ...current, ...patch };
    await strapi.db
      .query(ACCOUNT_UID)
      .update({ where: { id: account.id }, data: { bounceMonitorState: next } });
    account.bounceMonitorState = next;
    return next;
  };

  /**
   * Fetch with a hard timeout; JSON or raw text.
   *
   * @param {string} url
   * @param {string} token
   * @param {{raw?: boolean}} [options]
   */
  const httpGet = async (url, token, { raw = false } = {}) => {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: raw ? 'message/rfc822, */*' : 'application/json',
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (response.status === 401)
      throw new BounceMonitorError('TOKEN_REJECTED', 'Access token rejected');
    if (response.status === 403)
      throw new BounceMonitorError('NEEDS_CONSENT', 'Read access was not granted');
    if (response.status === 404) {
      const error = new BounceMonitorError('NOT_FOUND', 'Not found');
      error.status = 404;
      throw error;
    }
    if (response.status === 429)
      throw new BounceMonitorError('RATE_LIMITED', 'Provider rate limit');
    if (!response.ok)
      throw new BounceMonitorError(`HTTP_${response.status}`, 'Provider request failed');
    if (raw) {
      const length = Number(response.headers?.get?.('content-length') || 0);
      if (length > MAX_RAW_BYTES) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.byteLength > MAX_RAW_BYTES ? null : buffer;
    }
    return response.json();
  };

  /**
   * Access token for an OAuth account, refreshed through the router's
   * cross-process refresh (one refresh per account at a time).
   *
   * @param {object} account
   * @param {{force?: boolean}} [options]
   * @returns {Promise<string>}
   */
  const accessToken = async (account, { force = false } = {}) => {
    const config = plainConfig(account);
    const oauth = plainOAuth(account);
    if (!oauth.accessToken && !oauth.refreshToken) {
      throw new BounceMonitorError('NEEDS_CONSENT', 'Account is not authorized');
    }
    const refresh =
      account.provider === 'microsoft-oauth'
        ? () =>
            oauthService().refreshMicrosoftTokens(
              oauth.refreshToken,
              config.clientId,
              config.clientSecret,
              config.tenantId,
              { grantedScope: oauth.scope }
            )
        : () =>
            oauthService().refreshGmailTokens(
              oauth.refreshToken,
              config.clientId,
              config.clientSecret
            );
    return router().currentOAuthToken(account, oauth, refresh, { force });
  };

  /** GET with one forced token refresh on 401. */
  const oauthGet = async (account, url, options) => {
    try {
      return await httpGet(url, await accessToken(account), options);
    } catch (error) {
      if (error?.code !== 'TOKEN_REJECTED') throw error;
      return httpGet(url, await accessToken(account, { force: true }), options);
    }
  };

  /**
   * Finds the email log of the bounced mail. Strongest match first.
   *
   * @param {object} account
   * @param {object} parsed - parseBounce result
   * @param {string} address - bounced recipient
   * @returns {Promise<{log: object|null, quality: string|null}>}
   */
  const matchLog = async (account, parsed, address) => {
    const select = [
      'id',
      'documentId',
      'providerMessageId',
      'bounced',
      'deliveryStatus',
      'recipient',
    ];
    if (parsed.outboxId) {
      const row = await strapi.db
        .query(OUTBOX_UID)
        .findOne({ where: { documentId: parsed.outboxId }, select: ['emailLogDocumentId'] });
      if (row?.emailLogDocumentId) {
        const log = await strapi.db
          .query(EMAIL_LOG_UID)
          .findOne({ where: { documentId: row.emailLogDocumentId }, select });
        if (log) return { log, quality: 'outbox' };
      }
    }
    const messageId = normalizeMessageId(parsed.originalMessageId || '');
    if (messageId) {
      const local = messageId.split('@')[0].toLowerCase();
      if (/^[a-z0-9]{8,64}$/.test(local)) {
        const log = await strapi.db
          .query(EMAIL_LOG_UID)
          .findOne({ where: { messageIdLocal: local }, select });
        if (log) return { log, quality: 'message-id' };
        const row = await strapi.db
          .query(OUTBOX_UID)
          .findOne({ where: { messageIdLocal: local }, select: ['emailLogDocumentId'] });
        if (row?.emailLogDocumentId) {
          const viaOutbox = await strapi.db
            .query(EMAIL_LOG_UID)
            .findOne({ where: { documentId: row.emailLogDocumentId }, select });
          if (viaOutbox) return { log: viaOutbox, quality: 'message-id' };
        }
      }
      const byProvider = await strapi.db
        .query(EMAIL_LOG_UID)
        .findOne({ where: { providerMessageId: { $in: [messageId, `<${messageId}>`] } }, select });
      if (byProvider) return { log: byProvider, quality: 'message-id' };
    }
    // Weaker: the newest mail of this account to that recipient (7 days).
    const since = new Date(clock() - MATCH_WINDOW_MS);
    const byRecipient = await strapi.db.query(EMAIL_LOG_UID).findOne({
      where: {
        recipient: { $eqi: address },
        accountId: account.documentId,
        sentAt: { $gte: since },
      },
      orderBy: { sentAt: 'desc' },
      select,
    });
    if (byRecipient) return { log: byRecipient, quality: 'recipient' };
    return { log: null, quality: null };
  };

  /**
   * Adds or refreshes a hard-bounced address on the suppression list.
   *
   * @param {object} account
   * @param {string} address
   * @param {string} reasonCode
   */
  const suppress = async (account, address, reasonCode) => {
    const addressHash = purposeHmac('suppressed-recipient', address.toLowerCase());
    const existing = await strapi.db
      .query(SUPPRESSED_UID)
      .findOne({ where: { addressHash }, select: ['id', 'bounceCount'] });
    const now = new Date(clock());
    if (existing) {
      await strapi.db.query(SUPPRESSED_UID).update({
        where: { id: existing.id },
        data: { reasonCode, lastBouncedAt: now, bounceCount: (existing.bounceCount || 0) + 1 },
      });
      return;
    }
    try {
      await strapi.db.query(SUPPRESSED_UID).create({
        data: {
          addressHash,
          maskedAddress: maskAddress(address),
          reasonCode,
          source: 'mailbox',
          accountId: account.documentId,
          bounceCount: 1,
          lastBouncedAt: now,
        },
      });
    } catch {
      // Unique hash: another process added it at the same moment.
    }
  };

  /**
   * Records one parsed report.
   *
   * @param {object} account
   * @param {object} parsed
   * @param {string} eventKey - stable id of the report in the mailbox
   * @param {{suppressHardBounces: boolean}} global
   * @returns {Promise<{recorded: number, matched: number, bounced: number, deferred: number}>}
   */
  const recordReport = async (account, parsed, eventKey, global) => {
    const counts = { recorded: 0, matched: 0, bounced: 0, deferred: 0 };
    const seen = new Set();
    for (const recipient of parsed.recipients) {
      if (seen.has(recipient.address)) continue;
      seen.add(recipient.address);
      const providerEventId = `mailbox:${crypto
        .createHash('sha256')
        .update(`${eventKey}|${recipient.address}`)
        .digest('hex')
        .slice(0, 40)}`;
      const already = await strapi.db
        .query(EMAIL_EVENT_UID)
        .findOne({ where: { providerEventId }, select: ['id'] });
      if (already) continue;
      const claim = await coordination.claim(
        strapi,
        `mailbox-event:${providerEventId}`,
        24 * 3600_000
      );
      if (claim === null) continue;

      const hard = recipient.kind === 'hard';
      const { log, quality } = await matchLog(account, parsed, recipient.address);
      const now = new Date(clock());
      if (log) {
        counts.matched += 1;
        if (hard) {
          await strapi.documents(EMAIL_LOG_UID).update({
            documentId: log.documentId,
            data: {
              bounced: true,
              bounceReason: recipient.reasonCode,
              bouncedAt: now,
              bounceSource: 'mailbox',
              deliveryStatus: 'bounced',
            },
          });
        } else if (!log.bounced) {
          await strapi.documents(EMAIL_LOG_UID).update({
            documentId: log.documentId,
            data: {
              bounceReason: recipient.reasonCode,
              bounceSource: 'mailbox',
              deliveryStatus: 'deferred',
            },
          });
        }
        await strapi.documents(EMAIL_EVENT_UID).create({
          data: {
            emailLog: log.documentId,
            type: hard ? 'bounce' : 'deferred',
            timestamp: now,
            providerEventId,
            metadata: { provider: 'mailbox', reasonCode: recipient.reasonCode, match: quality },
          },
        });
      }
      counts.recorded += 1;
      if (hard) counts.bounced += 1;
      else counts.deferred += 1;

      if (hard && global.suppressHardBounces)
        await suppress(account, recipient.address, recipient.reasonCode);

      const messageId = log?.providerMessageId || parsed.originalMessageId || null;
      if (messageId) {
        try {
          await strapi.eventHub.emit(`magic-mail.delivery.${hard ? 'bounced' : 'deferred'}`, {
            provider: 'mailbox',
            messageId,
            reasonCode: recipient.reasonCode,
          });
        } catch (error) {
          strapi.log.warn(
            `[magic-mail] Delivery event listener failed: ${describeErrorForLog(error)}`
          );
        }
      }
    }
    return counts;
  };

  /**
   * Parses and records one downloaded message.
   *
   * @returns {Promise<{isBounce: boolean, counts: object|null}>}
   */
  const handleRaw = async (account, raw, eventKey, global) => {
    if (!raw) return { isBounce: false, counts: null };
    const parsed = await parseBounce(raw);
    if (!parsed) return { isBounce: false, counts: null };
    return { isBounce: true, counts: await recordReport(account, parsed, eventKey, global) };
  };

  // ---------------------------------------------------------------- IMAP

  /** Connection options for an IMAP account (never logged). */
  const imapOptions = (account, settings) => {
    const config = plainConfig(account);
    const user = settings.imap.useSmtpLogin ? config.user : settings.imap.user;
    const pass = settings.imap.useSmtpLogin ? config.pass : config.imapPass;
    const host = settings.imap.host || suggestImapHost(config.host);
    if (!host || !user || !pass) {
      throw new BounceMonitorError('IMAP_NOT_CONFIGURED', 'IMAP host, user or password missing');
    }
    return {
      host,
      port: settings.imap.port,
      secure: settings.imap.secure,
      // STARTTLS is required when the connection does not start with TLS.
      doSTARTTLS: settings.imap.secure ? undefined : true,
      auth: { user, pass },
      logger: false,
      emitLogs: false,
      disableAutoIdle: true,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      tls: { minVersion: 'TLSv1.2' },
    };
  };

  /** Header line value from an IMAP header buffer. */
  const headerLine = (buffer, name) => {
    const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
    const match = text.match(new RegExp(`^${name}:([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, 'im'));
    return match ? match[1].replace(/\r?\n[ \t]/g, ' ').trim() : '';
  };

  const pollImap = async (account, settings, state, global, { testOnly = false } = {}) => {
    const client = imapFactory(imapOptions(account, settings));
    const result = { scanned: 0, found: 0, bounced: 0, deferred: 0, cursor: state.cursor || null };
    await client.connect();
    let lock;
    try {
      lock = await client.getMailboxLock(settings.folder, {
        readOnly: !settings.moveProcessed || testOnly,
        acquireTimeout: 15_000,
      });
      const mailbox = client.mailbox;
      if (testOnly) return { ...result, exists: mailbox?.exists || 0 };
      const uidValidity = String(mailbox.uidValidity);
      let uids;
      const cursor = state.cursor && state.cursor.mode === 'imap' ? state.cursor : null;
      if (!cursor || cursor.uidValidity !== uidValidity) {
        // Gmail/Google Workspace: let the server pre-filter (X-GM-RAW).
        const days = Math.ceil(INITIAL_LOOKBACK_MS / 86_400_000);
        const query = client.capabilities?.has?.('X-GM-EXT-1')
          ? { gmraw: `{from:mailer-daemon from:postmaster} newer_than:${days}d` }
          : { since: new Date(clock() - INITIAL_LOOKBACK_MS) };
        const found = await client.search(query, { uid: true });
        uids = Array.isArray(found) ? found : [];
      } else {
        const found = await client.search({ uid: `${cursor.lastUid + 1}:*` }, { uid: true });
        uids = (Array.isArray(found) ? found : []).filter((uid) => uid > cursor.lastUid);
      }
      uids = uids.sort((a, b) => a - b).slice(0, MAX_MESSAGES_PER_POLL);
      let lastUid = cursor && cursor.uidValidity === uidValidity ? cursor.lastUid : 0;
      if (uids.length) {
        const candidates = [];
        for await (const message of client.fetch(
          uids.join(','),
          {
            uid: true,
            envelope: true,
            size: true,
            headers: ['content-type', 'x-failed-recipients'],
          },
          { uid: true }
        )) {
          result.scanned += 1;
          const from = message.envelope?.from?.[0];
          const meta = {
            from: from ? `${from.name || ''} <${from.address || ''}>` : '',
            subject: message.envelope?.subject || '',
            contentType: headerLine(message.headers, 'content-type'),
            failedRecipients: headerLine(message.headers, 'x-failed-recipients'),
          };
          if ((message.size || 0) <= MAX_RAW_BYTES && looksLikeBounce(meta))
            candidates.push(message.uid);
        }
        const processed = [];
        for (const uid of candidates.slice(0, MAX_DOWNLOADS_PER_POLL)) {
          const message = await client.fetchOne(
            String(uid),
            { uid: true, source: { maxLength: MAX_RAW_BYTES } },
            { uid: true }
          );
          const { isBounce, counts } = await handleRaw(
            account,
            message?.source,
            `imap:${account.documentId}:${uidValidity}:${uid}`,
            global
          );
          if (isBounce) {
            processed.push(uid);
            result.found += 1;
            result.bounced += counts.bounced;
            result.deferred += counts.deferred;
          }
        }
        const lastDownloaded =
          candidates.length > MAX_DOWNLOADS_PER_POLL
            ? candidates[MAX_DOWNLOADS_PER_POLL - 1]
            : null;
        lastUid = lastDownloaded
          ? Math.min(lastDownloaded, uids[uids.length - 1])
          : uids[uids.length - 1];
        if (settings.moveProcessed && processed.length) {
          try {
            // Use the server's full path (namespace and delimiter applied) when
            // the folder was created; an existing folder makes create throw.
            const created = await client.mailboxCreate(PROCESSED_FOLDER).catch(() => null);
            const target = created?.path || PROCESSED_FOLDER;
            await client.messageMove(processed.join(','), target, { uid: true });
          } catch (error) {
            log.warn(
              `[magic-mail] [BOUNCES] Could not move processed bounces: ${describeErrorForLog(error)}`
            );
          }
        }
      } else if (!cursor || cursor.uidValidity !== uidValidity) {
        lastUid = Math.max(0, Number(mailbox.uidNext || 1) - 1);
      }
      result.cursor = { mode: 'imap', uidValidity, lastUid };
      return result;
    } finally {
      if (lock) lock.release();
      await client.logout().catch(() => client.close?.());
    }
  };

  // ---------------------------------------------------------------- Gmail API

  const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

  const gmailCandidateIds = async (account, cursor) => {
    if (cursor?.historyId) {
      const ids = [];
      let pageToken = null;
      let historyId = cursor.historyId;
      for (let page = 0; page < 5; page += 1) {
        const query = new URLSearchParams({
          startHistoryId: String(cursor.historyId),
          historyTypes: 'messageAdded',
          labelId: 'INBOX',
          maxResults: '100',
        });
        if (pageToken) query.set('pageToken', pageToken);
        let body;
        try {
          body = await oauthGet(account, `${GMAIL}/history?${query}`);
        } catch (error) {
          if (error?.status === 404) return null; // history expired: full sync
          throw error;
        }
        for (const record of body.history || []) {
          for (const added of record.messagesAdded || []) {
            if (added?.message?.id) ids.push(added.message.id);
          }
        }
        historyId = body.historyId || historyId;
        pageToken = body.nextPageToken || null;
        if (!pageToken || ids.length >= MAX_MESSAGES_PER_POLL) break;
      }
      return { ids: [...new Set(ids)].slice(0, MAX_MESSAGES_PER_POLL), historyId };
    }
    return null;
  };

  const pollGmail = async (account, settings, state, global, { testOnly = false } = {}) => {
    if (!hasReadScope(account)) {
      throw new BounceMonitorError(
        'NEEDS_CONSENT',
        'Read access for bounce monitoring was not granted'
      );
    }
    const profile = await oauthGet(account, `${GMAIL}/profile`);
    const result = { scanned: 0, found: 0, bounced: 0, deferred: 0, cursor: state.cursor || null };
    if (testOnly) return { ...result, exists: Number(profile.messagesTotal) || 0 };
    const cursor = state.cursor && state.cursor.mode === 'gmail' ? state.cursor : null;
    let batch = await gmailCandidateIds(account, cursor);
    let historyId = batch?.historyId || profile.historyId;
    if (!batch) {
      const days = Math.ceil(INITIAL_LOOKBACK_MS / 86_400_000);
      const query = new URLSearchParams({
        q: `newer_than:${days}d {from:mailer-daemon from:postmaster subject:undeliverable subject:"delivery status notification"}`,
        maxResults: '100',
      });
      const list = await oauthGet(account, `${GMAIL}/messages?${query}`);
      batch = { ids: (list.messages || []).map((m) => m.id).filter(Boolean) };
      historyId = profile.historyId;
    }
    let downloads = 0;
    for (const id of batch.ids) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
      result.scanned += 1;
      let meta;
      try {
        meta = await oauthGet(
          account,
          `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Content-Type&metadataHeaders=X-Failed-Recipients`
        );
      } catch (error) {
        if (error?.status === 404) continue; // deleted meanwhile
        throw error;
      }
      const headers = Object.fromEntries(
        (meta.payload?.headers || []).map((h) => [
          String(h.name).toLowerCase(),
          String(h.value || ''),
        ])
      );
      if ((meta.sizeEstimate || 0) > MAX_RAW_BYTES) continue;
      if (
        !looksLikeBounce({
          from: headers.from,
          subject: headers.subject,
          contentType: headers['content-type'],
          failedRecipients: headers['x-failed-recipients'],
        })
      ) {
        continue;
      }
      if (downloads >= MAX_DOWNLOADS_PER_POLL) break;
      downloads += 1;
      const full = await oauthGet(account, `${GMAIL}/messages/${id}?format=raw`);
      const raw = typeof full.raw === 'string' ? Buffer.from(full.raw, 'base64url') : null;
      const { isBounce, counts } = await handleRaw(
        account,
        raw,
        `gmail:${account.documentId}:${id}`,
        global
      );
      if (isBounce) {
        result.found += 1;
        result.bounced += counts.bounced;
        result.deferred += counts.deferred;
      }
    }
    result.cursor = { mode: 'gmail', historyId: String(historyId || cursor?.historyId || '') };
    return result;
  };

  // ---------------------------------------------------------------- Microsoft Graph

  const GRAPH = 'https://graph.microsoft.com/v1.0/me';

  const pollGraph = async (account, settings, state, global, { testOnly = false } = {}) => {
    if (!hasReadScope(account)) {
      throw new BounceMonitorError(
        'NEEDS_CONSENT',
        'Read access for bounce monitoring was not granted'
      );
    }
    const result = { scanned: 0, found: 0, bounced: 0, deferred: 0, cursor: state.cursor || null };
    if (testOnly) {
      const inbox = await oauthGet(account, `${GRAPH}/mailFolders/inbox?$select=totalItemCount`);
      return { ...result, exists: Number(inbox.totalItemCount) || 0 };
    }
    const cursor = state.cursor && state.cursor.mode === 'graph' ? state.cursor : null;
    const since = cursor?.since || new Date(clock() - INITIAL_LOOKBACK_MS).toISOString();
    const seenAtSince = new Set(cursor?.seen || []);
    const query = new URLSearchParams({
      $filter: `receivedDateTime ge ${since}`,
      $orderby: 'receivedDateTime asc',
      $select: 'id,receivedDateTime,from,subject',
      $top: '50',
    });
    let url = `${GRAPH}/mailFolders/inbox/messages?${query}`;
    let newest = since;
    let seenAtNewest = new Set(seenAtSince);
    let downloads = 0;
    for (let page = 0; page < 10 && url && result.scanned < MAX_MESSAGES_PER_POLL; page += 1) {
      if (!url.startsWith('https://graph.microsoft.com/')) break;
      const body = await oauthGet(account, url);
      for (const message of body.value || []) {
        const id = String(message.id || '');
        const received = String(message.receivedDateTime || '');
        if (!id || !received) continue;
        if (received === since && seenAtSince.has(id)) continue;
        result.scanned += 1;
        if (received > newest) {
          newest = received;
          seenAtNewest = new Set();
        }
        seenAtNewest.add(id);
        const from = message.from?.emailAddress;
        if (
          !looksLikeBounce({
            from: from ? `${from.name || ''} <${from.address || ''}>` : '',
            subject: message.subject,
          })
        ) {
          continue;
        }
        if (downloads >= MAX_DOWNLOADS_PER_POLL) continue;
        downloads += 1;
        const raw = await oauthGet(account, `${GRAPH}/messages/${encodeURIComponent(id)}/$value`, {
          raw: true,
        });
        const { isBounce, counts } = await handleRaw(
          account,
          raw,
          `graph:${account.documentId}:${id}`,
          global
        );
        if (isBounce) {
          result.found += 1;
          result.bounced += counts.bounced;
          result.deferred += counts.deferred;
        }
      }
      url = body['@odata.nextLink'] || null;
    }
    result.cursor = { mode: 'graph', since: newest, seen: [...seenAtNewest].slice(-200) };
    return result;
  };

  const POLLERS = { imap: pollImap, gmail: pollGmail, graph: pollGraph };

  const service = {
    BounceMonitorError,
    settingsFor,
    statusFor,
    suggestImapHost,
    errorCodeFor,
    MODES,

    /** @param {{imap?: Function, fetch?: Function, clock?: Function}} hooks */
    setTestHooks(hooks = {}) {
      if (hooks.imap) imapFactory = hooks.imap;
      if (hooks.fetch) fetchImpl = hooks.fetch;
      if (hooks.clock) clock = hooks.clock;
    },

    hasReadScope,

    /**
     * Polls one account now (caller holds the lease or runs a test).
     *
     * @param {object} account - raw account row (with config/oauth/bounce fields)
     * @param {{testOnly?: boolean}} [options]
     * @returns {Promise<object>}
     */
    async pollAccount(account, { testOnly = false } = {}) {
      const settings = settingsFor(account);
      if (!settings.mode)
        throw new BounceMonitorError(
          'UNSUPPORTED',
          'This provider reports bounces through webhooks'
        );
      const state =
        account.bounceMonitorState && typeof account.bounceMonitorState === 'object'
          ? account.bounceMonitorState
          : {};
      const global = await globalSettings();
      try {
        const result = await POLLERS[settings.mode](account, settings, state, global, { testOnly });
        if (testOnly) return { ok: true, exists: result.exists || 0 };
        await saveState(account, {
          cursor: result.cursor,
          lastPollAt: new Date(clock()).toISOString(),
          lastStatus: 'ok',
          lastErrorCode: null,
          lastScanned: result.scanned,
          lastFound: result.found,
          totalBounced: (Number(state.totalBounced) || 0) + result.bounced,
          totalDeferred: (Number(state.totalDeferred) || 0) + result.deferred,
        });
        if (result.found) {
          log.info(
            `[magic-mail] [BOUNCES] ${result.found} bounce report(s) recorded for account ${account.documentId}`
          );
        }
        return { ok: true, ...result, cursor: undefined };
      } catch (error) {
        const code = errorCodeFor(error);
        if (!testOnly) {
          await saveState(account, {
            lastPollAt: new Date(clock()).toISOString(),
            lastStatus: code === 'NEEDS_CONSENT' ? 'needs_consent' : 'error',
            lastErrorCode: code,
          }).catch(() => {});
          log.warn(
            `[magic-mail] [BOUNCES] Poll failed for account ${account.documentId} (${code})`
          );
        }
        throw new BounceMonitorError(code, 'Bounce monitoring failed');
      }
    },

    /**
     * One scheduler tick: polls every enabled account that is due, each in at
     * most one process across all replicas.
     *
     * @returns {Promise<{polled: number}>}
     */
    async tick() {
      const global = await globalSettings();
      const accounts = await strapi.db.query(ACCOUNT_UID).findMany({
        where: { isActive: true },
        select: [
          'id',
          'documentId',
          'provider',
          'bounceMonitor',
          'bounceMonitorState',
          'config',
          'oauth',
          'fromEmail',
        ],
        limit: 200,
      });
      let polled = 0;
      for (const account of accounts) {
        if (!settingsFor(account).enabled) continue;
        try {
          const { ran } = await coordination.runSingleton(
            strapi,
            `bounce-poll:${account.documentId}`,
            Math.max(30_000, global.intervalMs - 5_000),
            () => service.pollAccount(account)
          );
          if (ran) polled += 1;
        } catch {
          // Recorded on the account; the next interval tries again.
        }
      }
      return { polled };
    },

    /** Starts the per-process scheduler; returns the timer handle. */
    start() {
      const timer = setInterval(() => {
        service.tick().catch((error) => {
          log.warn(`[magic-mail] [BOUNCES] Scheduler tick failed: ${describeErrorForLog(error)}`);
        });
      }, TICK_MS);
      timer.unref?.();
      return timer;
    },

    /**
     * Whether sends to `address` are blocked by the suppression list.
     *
     * @param {string} address
     * @returns {Promise<boolean>}
     */
    async isSuppressed(address) {
      if (typeof address !== 'string' || !address.includes('@')) return false;
      const addressHash = purposeHmac('suppressed-recipient', address.trim().toLowerCase());
      const row = await strapi.db
        .query(SUPPRESSED_UID)
        .findOne({ where: { addressHash }, select: ['id'] });
      return Boolean(row);
    },

    /**
     * Suppression list page (masked addresses only).
     *
     * @param {{page?: number, pageSize?: number}} [options]
     */
    async listSuppressed({ page = 1, pageSize = 25 } = {}) {
      const size = Math.min(100, Math.max(1, pageSize));
      const [rows, total] = await Promise.all([
        strapi.db.query(SUPPRESSED_UID).findMany({
          select: [
            'documentId',
            'maskedAddress',
            'reasonCode',
            'source',
            'bounceCount',
            'lastBouncedAt',
            'createdAt',
          ],
          orderBy: { lastBouncedAt: 'desc' },
          offset: (Math.max(1, page) - 1) * size,
          limit: size,
        }),
        strapi.db.query(SUPPRESSED_UID).count(),
      ]);
      return { data: rows, meta: { page: Math.max(1, page), pageSize: size, total } };
    },

    /** @param {string} documentId @returns {Promise<boolean>} */
    async removeSuppressed(documentId) {
      const row = await strapi.db
        .query(SUPPRESSED_UID)
        .findOne({ where: { documentId }, select: ['id'] });
      if (!row) return false;
      await strapi.db.query(SUPPRESSED_UID).delete({ where: { id: row.id } });
      return true;
    },

    /** Removes an address (exact match) from the list. */
    async removeSuppressedAddress(address) {
      const addressHash = purposeHmac('suppressed-recipient', String(address).trim().toLowerCase());
      const deleted = await strapi.db.query(SUPPRESSED_UID).deleteMany({ where: { addressHash } });
      return Number(deleted?.count || 0) > 0;
    },
  };

  return service;
};

module.exports.BounceMonitorError = BounceMonitorError;
module.exports.suggestImapHost = suggestImapHost;
module.exports.settingsFor = settingsFor;
module.exports.statusFor = statusFor;
module.exports.MODES = MODES;
