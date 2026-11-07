/**
 * Mirrors the Magic Link table design; keep in sync.
 * Source: strapi-plugin-magic-link admin/src/pages/Tokens/securityTabs.utils.js
 * (page helpers). No React or DOM here, so the logic is covered by node:test
 * (tests/admin-table-layer.test.js).
 */

/** Page sizes offered by the client-side paginated tables. */
export const PAGE_SIZES = Object.freeze([10, 25, 50, 100]);

/**
 * Number of pages for a list, never below 1.
 * @param {number} total
 * @param {number} pageSize
 */
export const getPageCount = (total, pageSize) => {
  const size = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const count = Number(total) > 0 ? Number(total) : 0;
  return Math.max(1, Math.ceil(count / size));
};

/**
 * Keeps a page number inside 1..pageCount (after filtering or deleting the
 * last row of a page).
 * @param {number} page
 * @param {number} pageCount
 */
export const clampPage = (page, pageCount) => {
  const last = Math.max(1, Math.floor(Number(pageCount)) || 1);
  const current = Math.floor(Number(page)) || 1;
  return Math.min(Math.max(1, current), last);
};

/**
 * Rows of one page.
 * @template T
 * @param {T[]} rows
 * @param {number} page - already clamped
 * @param {number} pageSize
 * @returns {T[]}
 */
export const paginate = (rows, page, pageSize) => {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
};

/**
 * Page links with ellipses, like the Strapi content manager: first, last,
 * the active page and `siblings` pages on each side.
 *
 *   getPageItems(5, 10) -> [1, 'dots-start', 4, 5, 6, 'dots-end', 10]
 *
 * @param {number} activePage
 * @param {number} pageCount
 * @param {number} [siblings=1]
 * @returns {Array<number|'dots-start'|'dots-end'>}
 */
export const getPageItems = (activePage, pageCount, siblings = 1) => {
  const last = Math.max(1, Math.floor(pageCount) || 1);
  const active = clampPage(activePage, last);
  // first + last + active + 2*siblings + 2 dots
  const slots = siblings * 2 + 5;
  if (last <= slots) return Array.from({ length: last }, (_, index) => index + 1);

  const left = Math.max(active - siblings, 2);
  const right = Math.min(active + siblings, last - 1);
  const showLeftDots = left > 3;
  const showRightDots = right < last - 2;

  if (!showLeftDots) {
    const end = 3 + siblings * 2;
    return [...Array.from({ length: end }, (_, index) => index + 1), 'dots-end', last];
  }
  if (!showRightDots) {
    const start = last - (2 + siblings * 2);
    return [
      1,
      'dots-start',
      ...Array.from({ length: last - start + 1 }, (_, index) => start + index),
    ];
  }
  return [
    1,
    'dots-start',
    ...Array.from({ length: right - left + 1 }, (_, index) => left + index),
    'dots-end',
    last,
  ];
};

/**
 * MagicMail keyboard fix (not in Magic Link): the DS table cell prevents the
 * default of every key when it holds several buttons (its grid navigation),
 * which blocks native Enter/Space activation and Tab. Those keys stay with the
 * buttons; arrow keys still move the grid. Put it on the Flex around the row
 * actions: `<Flex gap={1} onKeyDown={keepNativeButtonKeys}>`.
 */
const NATIVE_BUTTON_KEYS = new Set(['Enter', ' ', 'Tab']);

/** @param {{key: string, stopPropagation: () => void}} event */
export const keepNativeButtonKeys = (event) => {
  if (NATIVE_BUTTON_KEYS.has(event.key)) event.stopPropagation();
};
