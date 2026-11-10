'use strict';

/**
 * Bounce (non-delivery report) parser for mailbox bounce monitoring.
 *
 * Recognises:
 *  - RFC 3464 delivery status notifications: `multipart/report;
 *    report-type=delivery-status` with a `message/delivery-status` part
 *    (Gmail "Address not found", Postfix, Exim, Exchange/Outlook NDRs).
 *  - Non-standard bounces from `mailer-daemon` / `postmaster` senders that
 *    carry `X-Failed-Recipients` and an SMTP status in the text body.
 *
 * Everything else (auto-replies, vacation notices, normal mail) returns null.
 *
 * Privacy: the result holds codes and identifiers only. Diagnostic texts,
 * subjects and bodies are reduced to a code such as `SMTP_550_5_1_1` or
 * `DNS_NXDOMAIN` and never stored. Recipient addresses are returned so the
 * caller can match the email log; the caller decides what to keep.
 *
 * Sources: RFC 3464 (DSN format, Final-Recipient/Action/Status/Diagnostic-Code),
 * RFC 3463 (enhanced status codes: class 2 success, 4 persistent transient
 * failure, 5 permanent failure), RFC 3834 (Auto-Submitted).
 */

const PostalMime = require('postal-mime').default || require('postal-mime');
const { normalizeMessageId } = require('./message-id');

/** Raw messages above this size are never parsed (bounces are small). */
const MAX_RAW_BYTES = 1024 * 1024;
const MAX_RECIPIENTS = 50;
const ADDRESS_PATTERN = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,253}$/;
const BOUNCE_SENDER_PATTERN =
  /(^|[<\s"])(mailer-daemon|postmaster|mail[-.]?delivery[-.]?(subsystem|system)?|microsoftexchange[0-9a-f]{0,40})@/i;
const STATUS_PATTERN = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/;
const SMTP_REPLY_PATTERN = /\b([45]\d\d)[ -]([245]\.\d{1,3}\.\d{1,3})?/;

/**
 * Unfolds and parses the header-style blocks of a `message/delivery-status`
 * part: one per-message block followed by one block per recipient.
 *
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
function parseFieldBlocks(text) {
  const blocks = [];
  let current = null;
  let lastKey = null;
  for (const rawLine of String(text).replace(/\r\n/g, '\n').split('\n')) {
    if (rawLine.trim() === '') {
      if (current && Object.keys(current).length) blocks.push(current);
      current = null;
      lastKey = null;
      continue;
    }
    if (/^[ \t]/.test(rawLine) && current && lastKey) {
      current[lastKey] += ` ${rawLine.trim()}`;
      continue;
    }
    const idx = rawLine.indexOf(':');
    if (idx <= 0) continue;
    current = current || {};
    lastKey = rawLine.slice(0, idx).trim().toLowerCase();
    current[lastKey] = rawLine.slice(idx + 1).trim();
  }
  if (current && Object.keys(current).length) blocks.push(current);
  return blocks;
}

/**
 * Parses a header block (`Name: value` lines) into a lower-cased map.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseHeaderBlock(text) {
  const headerEnd = String(text).search(/\r?\n\r?\n/);
  const head = headerEnd === -1 ? String(text) : String(text).slice(0, headerEnd);
  return parseFieldBlocks(head)[0] || {};
}

/**
 * @param {unknown} value - e.g. "rfc822; user@example.com" or "<user@example.com>"
 * @returns {string|null} lower-cased address
 */
function cleanAddress(value) {
  if (typeof value !== 'string') return null;
  let address = value.includes(';') ? value.split(';').slice(1).join(';') : value;
  address = address.trim().replace(/^<|>$/g, '').trim().toLowerCase();
  return ADDRESS_PATTERN.test(address) ? address : null;
}

/**
 * Reduces a status + diagnostic to a code without free text.
 *
 * @param {string|null} status - enhanced status code (x.y.z)
 * @param {string} diagnostic - Diagnostic-Code value or body text
 * @returns {string}
 */
function reasonCodeFor(status, diagnostic) {
  const text = String(diagnostic || '');
  if (
    /NXDOMAIN|domain name not found|host or domain name not found|domain .* (couldn't|could not) be found|no such domain/i.test(
      text
    )
  ) {
    return 'DNS_NXDOMAIN';
  }
  const reply = text.match(SMTP_REPLY_PATTERN);
  const code = reply ? reply[1] : null;
  const enhanced = status || (reply && reply[2]) || null;
  if (code && enhanced) return `SMTP_${code}_${enhanced.replace(/\./g, '_')}`;
  if (code) return `SMTP_${code}`;
  if (enhanced) return `STATUS_${enhanced.replace(/\./g, '_')}`;
  return 'UNKNOWN';
}

/**
 * Header value lookup on postal-mime's `headers` array.
 *
 * @param {Array<{key: string, value: string}>} headers
 * @param {string} name
 * @returns {string}
 */
function headerValue(headers, name) {
  const found = (headers || []).find((h) => h.key === name);
  return found ? String(found.value || '') : '';
}

/**
 * Text content of an attachment as decoded by postal-mime.
 *
 * @param {{content: unknown}} attachment
 * @returns {string}
 */
function attachmentText(attachment) {
  const content = attachment?.content;
  if (typeof content === 'string') return content;
  if (content instanceof ArrayBuffer) return Buffer.from(content).toString('utf8');
  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('utf8');
  }
  return '';
}

/**
 * Identifiers of the original message from its returned headers.
 *
 * @param {Record<string, string>} headers
 * @returns {{messageId: string|null, outboxId: string|null}}
 */
function originalIds(headers) {
  const messageId = normalizeMessageId(headers['message-id'] || '');
  const outbox = String(headers['x-magicmail-outbox'] || '').trim();
  return {
    messageId,
    outboxId: /^[A-Za-z0-9]{1,64}$/.test(outbox) ? outbox : null,
  };
}

/**
 * Parses a raw message and returns bounce details, or null when it is not a
 * bounce.
 *
 * @param {Buffer|Uint8Array|string} raw - full RFC 5322 message
 * @returns {Promise<null|{
 *   kind: 'hard'|'soft',
 *   recipients: Array<{address: string, action: string, status: string|null, reasonCode: string, kind: 'hard'|'soft'}>,
 *   reasonCode: string,
 *   originalMessageId: string|null,
 *   outboxId: string|null,
 *   standard: boolean,
 * }>}
 */
async function parseBounce(raw) {
  if (!raw) return null;
  const size = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.byteLength;
  if (!size || size > MAX_RAW_BYTES) return null;

  let email;
  try {
    email = await PostalMime.parse(raw, {
      attachmentEncoding: 'utf8',
      forceRfc822Attachments: true,
      maxNestingDepth: 20,
      maxPartCount: 200,
      maxHeadersSize: 256 * 1024,
      maxRfc822NestingDepth: 0,
    });
  } catch {
    return null;
  }

  const contentType = headerValue(email.headers, 'content-type').toLowerCase();
  const from = headerValue(email.headers, 'from');
  const isReport =
    contentType.includes('multipart/report') &&
    /report-type\s*=\s*"?delivery-status/.test(contentType);
  const fromDaemon = BOUNCE_SENDER_PATTERN.test(from);
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];
  const statusPart = attachments.find((a) =>
    /^(message|text)\/(global-)?delivery-status$/i.test(a.mimeType || '')
  );
  const originalPart = attachments.find((a) =>
    /^(message\/(global-)?rfc822|text\/rfc822-headers|message\/global-headers)$/i.test(
      a.mimeType || ''
    )
  );
  const original = originalPart ? parseHeaderBlock(attachmentText(originalPart)) : {};
  // Some MTAs put the returned headers into the text part instead.
  const textBody = String(email.text || '');
  const ids = originalIds(
    Object.keys(original).length ? original : parseInlineReturnedHeaders(textBody)
  );

  if (statusPart && (isReport || fromDaemon)) {
    const blocks = parseFieldBlocks(attachmentText(statusPart));
    const recipients = [];
    for (const block of blocks.slice(1)) {
      if (recipients.length >= MAX_RECIPIENTS) break;
      const address = cleanAddress(block['final-recipient'] || block['original-recipient']);
      const action = String(block.action || '').toLowerCase();
      if (!address || !['failed', 'delayed'].includes(action)) continue;
      const statusMatch = String(block.status || '').match(STATUS_PATTERN);
      const status = statusMatch ? statusMatch[0] : null;
      const kind = action === 'failed' && (!status || status.startsWith('5')) ? 'hard' : 'soft';
      recipients.push({
        address,
        action,
        status,
        kind,
        reasonCode: reasonCodeFor(status, block['diagnostic-code'] || ''),
      });
    }
    if (!recipients.length) return null;
    const hard = recipients.find((r) => r.kind === 'hard');
    return {
      kind: hard ? 'hard' : 'soft',
      recipients,
      reasonCode: (hard || recipients[0]).reasonCode,
      originalMessageId: ids.messageId,
      outboxId: ids.outboxId,
      standard: true,
    };
  }

  // Non-standard bounce: only from a mailer daemon with X-Failed-Recipients.
  const failed = headerValue(email.headers, 'x-failed-recipients');
  if (!fromDaemon || !failed) return null;
  const recipients = [];
  for (const part of failed.split(',')) {
    if (recipients.length >= MAX_RECIPIENTS) break;
    const address = cleanAddress(part);
    if (!address) continue;
    const statusMatch = textBody.match(STATUS_PATTERN);
    const status = statusMatch ? statusMatch[0] : null;
    const kind = status && status.startsWith('4') ? 'soft' : 'hard';
    recipients.push({
      address,
      action: kind === 'hard' ? 'failed' : 'delayed',
      status,
      kind,
      reasonCode: reasonCodeFor(status, textBody),
    });
  }
  if (!recipients.length) return null;
  const hard = recipients.find((r) => r.kind === 'hard');
  return {
    kind: hard ? 'hard' : 'soft',
    recipients,
    reasonCode: (hard || recipients[0]).reasonCode,
    originalMessageId: ids.messageId,
    outboxId: ids.outboxId,
    standard: false,
  };
}

/**
 * Finds `Message-ID:` / `X-MagicMail-Outbox:` lines quoted in a text body
 * (Exim and some Postfix setups include the original headers inline).
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseInlineReturnedHeaders(text) {
  const out = {};
  const messageId = String(text).match(/^\s*Message-ID:\s*(<[^>\s]{1,255}>)/im);
  if (messageId) out['message-id'] = messageId[1];
  const outbox = String(text).match(/^\s*X-MagicMail-Outbox:\s*([A-Za-z0-9]{1,64})\s*$/im);
  if (outbox) out['x-magicmail-outbox'] = outbox[1];
  return out;
}

/**
 * Cheap pre-filter on headers only, so full messages are fetched for likely
 * bounces only.
 *
 * @param {{from?: string, contentType?: string, subject?: string, failedRecipients?: string}} meta
 * @returns {boolean}
 */
function looksLikeBounce(meta = {}) {
  const contentType = String(meta.contentType || '').toLowerCase();
  if (contentType.includes('multipart/report')) return true;
  if (meta.failedRecipients) return true;
  if (BOUNCE_SENDER_PATTERN.test(String(meta.from || ''))) return true;
  return /^(undeliverable|undelivered mail|delivery status notification|mail delivery failed|returned mail|failure notice|unzustellbar|nicht zustellbar)/i.test(
    String(meta.subject || '').trim()
  );
}

module.exports = {
  parseBounce,
  looksLikeBounce,
  reasonCodeFor,
  parseFieldBlocks,
  cleanAddress,
  MAX_RAW_BYTES,
};
