'use strict';

/**
 * Builds a minimal Unlayer design that holds an HTML document in one "HTML"
 * content block (the built-in Unlayer HTML tool, values `html` and
 * `containerPadding`, "HTML" tool section of
 * https://docs.unlayer.com/llms-full.txt, checked 2026-11-17).
 * Used for "Copy as Magic Mail template": the copy opens in the designer and
 * can be edited there.
 *
 * Unlayer no longer loads full documents (<html>/<body>) as designs, so only
 * the <style> blocks and the <body> content are placed into the block.
 */

const MAX_HTML_LENGTH = 1_000_000;

/**
 * Case-insensitive indexOf without building a RegExp from input.
 *
 * @param {string} haystackLower - Lower-cased source
 * @param {string} needle - Lower-case needle
 * @param {number} [from]
 * @returns {number}
 */
const find = (haystackLower, needle, from = 0) => haystackLower.indexOf(needle, from);

/**
 * Returns the <style> elements and the <body> content of an HTML document.
 * A fragment without <body> is returned unchanged.
 *
 * @param {string} html
 * @returns {string}
 */
function extractBodyWithStyles(html) {
  const source = typeof html === 'string' ? html.slice(0, MAX_HTML_LENGTH) : '';
  const lower = source.toLowerCase();
  const bodyOpen = find(lower, '<body');
  if (bodyOpen === -1) return source;
  const bodyStart = find(lower, '>', bodyOpen);
  if (bodyStart === -1) return source;
  const bodyEnd = lower.lastIndexOf('</body');
  const body = source.slice(bodyStart + 1, bodyEnd > bodyStart ? bodyEnd : source.length);

  const styles = [];
  let cursor = 0;
  while (cursor < bodyOpen && styles.length < 20) {
    const open = find(lower, '<style', cursor);
    if (open === -1 || open > bodyOpen) break;
    const close = find(lower, '</style>', open);
    if (close === -1) break;
    styles.push(source.slice(open, close + '</style>'.length));
    cursor = close + '</style>'.length;
  }
  return `${styles.join('\n')}${styles.length ? '\n' : ''}${body.trim()}`;
}

/**
 * Builds the Unlayer design JSON for an HTML document.
 *
 * @param {string} html - Template HTML (Mustache syntax)
 * @returns {object} Unlayer design (schemaVersion 6) with one HTML block
 */
function buildHtmlDesign(html) {
  return {
    counters: { u_row: 1, u_column: 1, u_content_html: 1 },
    body: {
      id: 'magic-mail-html-copy',
      rows: [
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'column-1',
              contents: [
                {
                  id: 'html-1',
                  type: 'html',
                  values: {
                    html: extractBodyWithStyles(html),
                    containerPadding: '0px',
                    hideDesktop: false,
                    displayCondition: null,
                    _meta: { htmlID: 'u_content_html_1', htmlClassNames: 'u_content_html' },
                    selectable: true,
                    draggable: true,
                    duplicatable: true,
                    deletable: true,
                    hideable: true,
                  },
                },
              ],
              values: {
                backgroundColor: '',
                padding: '0px',
                border: {},
                _meta: { htmlID: 'u_column_1', htmlClassNames: 'u_column' },
              },
            },
          ],
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: {
              url: '',
              fullWidth: true,
              repeat: false,
              center: true,
              cover: false,
            },
            padding: '0px',
            hideDesktop: false,
            _meta: { htmlID: 'u_row_1', htmlClassNames: 'u_row' },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideable: true,
          },
        },
      ],
      values: {
        textColor: '#000000',
        backgroundColor: '#ffffff',
        backgroundImage: { url: '', fullWidth: true, repeat: false, center: true, cover: false },
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        preheaderText: '',
        linkStyle: {
          body: true,
          linkColor: '#0000ee',
          linkHoverColor: '#0000ee',
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
    schemaVersion: 6,
  };
}

module.exports = { buildHtmlDesign, extractBodyWithStyles };
