/**
 * Pure helpers for the Analytics view (email log paging, search and purge).
 * Kept free of React so they can be tested under node:test.
 */

/** Rows per page requested from GET /magic-mail/analytics/emails (server max: 100). */
export const LOGS_PAGE_SIZE = 25;

/** Server-side limit for the `search` query parameter (analytics.logsQuery). */
export const MAX_SEARCH_LENGTH = 500;

/** Upper bound of DELETE rounds per "Clear all" (each round removes up to 10,000 logs). */
export const MAX_CLEAR_ROUNDS = 100;

/**
 * Normalises the search input the way the API expects it.
 * @param {unknown} value
 * @returns {string} trimmed search term, at most MAX_SEARCH_LENGTH characters ('' = no search)
 */
export const normalizeSearch = (value) =>
  typeof value === 'string' ? value.trim().slice(0, MAX_SEARCH_LENGTH) : '';

/**
 * Builds the email log list URL with server-side paging and search.
 * @param {{page?: number, pageSize?: number, search?: string}} [options]
 * @returns {string}
 */
export const buildEmailLogsUrl = ({ page = 1, pageSize = LOGS_PAGE_SIZE, search = '' } = {}) => {
  const params = new URLSearchParams();
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : LOGS_PAGE_SIZE;
  params.set('page', String(safePage));
  params.set('pageSize', String(safeSize));
  const term = normalizeSearch(search);
  if (term) params.set('search', term);
  return `/magic-mail/analytics/emails?${params.toString()}`;
};

/**
 * Keeps the current page inside the available range (e.g. after a purge or a narrower search).
 * @param {number} page
 * @param {number|undefined|null} pageCount
 * @returns {number}
 */
export const clampPage = (page, pageCount) => {
  const max = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1;
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, max);
};

/**
 * Deletes every email log. The API removes at most 10,000 logs per request and
 * reports `hasMore`, so this keeps calling it until the backlog is drained.
 *
 * @param {(url: string) => Promise<{data?: {deletedCount?: number, hasMore?: boolean}}>} del
 * @param {{maxRounds?: number}} [options]
 * @returns {Promise<{deletedCount: number, complete: boolean}>}
 *   `complete` is false when logs remain (round limit reached or no progress).
 */
export const clearAllEmailLogsInBatches = async (del, { maxRounds = MAX_CLEAR_ROUNDS } = {}) => {
  let deletedCount = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    const response = await del('/magic-mail/analytics/emails');
    const data = response?.data ?? {};
    const deleted = Number.isFinite(Number(data.deletedCount)) ? Number(data.deletedCount) : 0;
    deletedCount += deleted;
    if (data.hasMore !== true) return { deletedCount, complete: true };
    // hasMore without progress would loop forever; stop and report it.
    if (deleted <= 0) return { deletedCount, complete: false };
  }
  return { deletedCount, complete: false };
};

/**
 * Extracts a user-facing message from an API error, if the server sent one.
 * @param {any} error
 * @returns {string|null}
 */
export const apiErrorMessage = (error) => {
  const message = error?.response?.data?.error?.message ?? error?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
};
