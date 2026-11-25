/**
 * Pure helpers of the Outbox view (no React), testable with node --test.
 */

export const OUTBOX_PAGE_SIZE = 25;

/** Filter values of the status select ('' = all). */
export const OUTBOX_FILTERS = Object.freeze([
  '',
  'pending',
  'retrying',
  'failed',
  'uncertain',
  'sent',
  'discarded',
]);

/**
 * One status mapping for badge tone and label key. `retrying` is a pending
 * row after at least one failed try. Danger is reserved for real failures.
 *
 * @param {{status: string, attempts?: number, createdVia?: string|null}} row
 * @returns {{key: string, labelKey: string, label: string, tone: 'neutral'|'secondary'|'success'|'danger'|'warning'}}
 */
export const outboxStatusPresentation = (row) => {
  const status = row?.status;
  if (
    status === 'pending' &&
    ((row.attempts || 0) > 0 || row.createdVia === 'capture-on-failure')
  ) {
    return {
      key: 'retrying',
      labelKey: 'queue.status.retrying',
      label: 'Retrying',
      tone: 'warning',
    };
  }
  switch (status) {
    case 'pending':
      return {
        key: 'pending',
        labelKey: 'queue.status.pending',
        label: 'Pending',
        tone: 'neutral',
      };
    case 'sending':
      return {
        key: 'sending',
        labelKey: 'queue.status.sending',
        label: 'Sending',
        tone: 'secondary',
      };
    case 'sent':
      return { key: 'sent', labelKey: 'queue.status.sent', label: 'Sent', tone: 'success' };
    case 'failed':
      return { key: 'failed', labelKey: 'queue.status.failed', label: 'Failed', tone: 'danger' };
    case 'uncertain':
      return {
        key: 'uncertain',
        labelKey: 'queue.status.uncertain',
        label: 'Uncertain',
        tone: 'warning',
      };
    case 'discarded':
      return {
        key: 'discarded',
        labelKey: 'queue.status.discarded',
        label: 'Discarded',
        tone: 'neutral',
      };
    default:
      return {
        key: 'unknown',
        labelKey: 'queue.status.unknown',
        label: 'Unknown',
        tone: 'neutral',
      };
  }
};

/**
 * Admin actions allowed for a row (the server re-checks every one).
 *
 * @param {{status: string, hasPayload?: boolean}} row
 * @returns {{retry: boolean, discard: boolean, markSent: boolean}}
 */
export const outboxActions = (row) => {
  const status = row?.status;
  const open = ['failed', 'uncertain', 'pending'].includes(status);
  return {
    retry: open && row.hasPayload !== false,
    discard: open,
    markSent: status === 'uncertain',
  };
};

/**
 * Builds the list URL with validated query parameters.
 *
 * @param {{page?: number, status?: string}} params
 * @returns {string}
 */
export const buildOutboxUrl = ({ page = 1, status = '' } = {}) => {
  const query = new URLSearchParams();
  query.set('page', String(Number.isInteger(page) && page > 0 ? page : 1));
  query.set('pageSize', String(OUTBOX_PAGE_SIZE));
  if (OUTBOX_FILTERS.includes(status) && status) query.set('status', status);
  return `/magic-mail/outbox?${query.toString()}`;
};

/** Error class label keys (codes stay as they are, they are technical ids). */
export const ERROR_CLASS_KEYS = Object.freeze({
  transient: ['queue.errorClass.transient', 'Temporary: the provider did not accept the mail'],
  permanent: ['queue.errorClass.permanent', 'Permanent: the provider refused the mail'],
  ambiguous: ['queue.errorClass.ambiguous', 'Uncertain: the provider may have accepted the mail'],
  capacity: ['queue.errorClass.capacity', 'No account free: waiting for quota'],
  expired: ['queue.errorClass.expired', 'Expired: too old to be sent'],
});

/**
 * Error code from an API error (`details.code`), if any.
 * @param {*} error
 * @returns {string|null}
 */
export const apiErrorCode = (error) => {
  const code = error?.response?.data?.error?.details?.code;
  return typeof code === 'string' ? code : null;
};

/**
 * Tries of one outbox mail, as the user counts them. The server's `attempts`
 * counts only queue tries: a mail captured after a failed direct send
 * (`createdVia: 'capture-on-failure'`) had one more try before it entered the
 * queue, and the queue then allows `maxAttempts` tries of its own
 * (services/queue.js: insert with attempts 0, retry while attempts < maxAttempts).
 * So "1 of 3" for a captured mail that was then sent hid the failed first try.
 *
 * @param {{status?: string, attempts?: number, maxAttempts?: number, createdVia?: string|null}} row
 * @returns {{total: number, max: number, failed: number, open: boolean}}
 *   total tries so far, the most tries possible, tries that failed, and
 *   whether more tries can follow (pending or sending)
 */
export const outboxTries = (row) => {
  const captured = row?.createdVia === 'capture-on-failure' ? 1 : 0;
  const total = Math.max(0, Number(row?.attempts) || 0) + captured;
  const max = Math.max(0, Number(row?.maxAttempts) || 0) + captured;
  // The last try of a sent mail succeeded; an uncertain one may have.
  const lastNotFailed = row?.status === 'sent' || row?.status === 'uncertain' ? 1 : 0;
  return {
    total,
    max: Math.max(max, total),
    failed: Math.max(0, total - lastNotFailed),
    open: row?.status === 'pending' || row?.status === 'sending',
  };
};

/** Plain labels for the queue `source` (who handed the mail to Magic Mail). */
export const SOURCE_KEYS = Object.freeze({
  service: ['queue.source.service', 'Plugin service in server code'],
  'strapi-email': ['queue.source.strapiEmail', 'Strapi email plugin'],
  'content-api': ['queue.source.contentApi', 'Content API (API token)'],
  queue: ['queue.source.queue', 'Outbox'],
});
