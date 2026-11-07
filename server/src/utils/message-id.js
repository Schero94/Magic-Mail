'use strict';

/**
 * Provider message id helpers shared by the send path and the delivery
 * webhooks. Ids are opaque, non-secret strings, but they come from external
 * systems, so they are bounded and reduced to printable characters.
 */

const MAX_MESSAGE_ID_LENGTH = 255;

/**
 * Normalises a provider message id: trims it, strips one pair of angle
 * brackets (`<id@host>` from SMTP/Mailgun) and rejects anything that is not a
 * bounded run of printable ASCII without spaces.
 *
 * @param {unknown} value
 * @returns {string|null} normalised id, or null when unusable
 */
function normalizeMessageId(value) {
  if (typeof value !== 'string') return null;
  let id = value.trim();
  if (id.startsWith('<') && id.endsWith('>')) id = id.slice(1, -1).trim();
  if (!id || id.length > MAX_MESSAGE_ID_LENGTH) return null;
  if (!/^[\x21-\x7e]+$/.test(id)) return null;
  return id;
}

/**
 * Lookup candidates for an id reported by a webhook. SendGrid reports
 * `sg_message_id` as `<x-message-id>.<filter suffix>`, while the send API
 * returned only the `x-message-id` prefix, so both forms are tried.
 *
 * @param {'sendgrid'|'mailgun'|string} provider
 * @param {unknown} reportedId
 * @returns {string[]} distinct normalised candidates (may be empty)
 */
function messageIdCandidates(provider, reportedId) {
  const id = normalizeMessageId(reportedId);
  if (!id) return [];
  const out = [id];
  if (provider === 'sendgrid') {
    const prefix = id.split('.')[0];
    if (prefix && prefix !== id) out.push(prefix);
  }
  return out;
}

module.exports = { normalizeMessageId, messageIdCandidates, MAX_MESSAGE_ID_LENGTH };
