'use strict';

/**
 * Builds the HTML document shown in the admin preview iframe.
 *
 * The admin renders it with `<iframe sandbox="" srcdoc=...>`: no scripts, an
 * opaque origin, no navigation of the admin. This module adds the server-side
 * half of the defence:
 *
 * - every link loses its `href` (the target is kept in `title`), so viewing
 *   or clicking never reaches Magic Mail's click tracking or any other site;
 * - Magic Mail's own open pixel and every other `/magic-mail/track/` URL are
 *   removed, also when images are allowed;
 * - remote images are blocked by default (the `src` is removed and a
 *   placeholder keeps the layout); `allowImages` keeps http(s) images;
 * - a Content-Security-Policy meta tag repeats the image decision for CSS
 *   (`background-image`, `@import`) and blocks every other request;
 * - scripts, frames, forms, objects, `meta refresh`, `base` and event
 *   handlers are dropped by the allowlist.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const sanitizeHtml = require('sanitize-html');

/** Path part of every Magic Mail tracking URL (open pixel and click redirect). */
const TRACKING_PATH = '/magic-mail/track/';

/** Largest HTML body the preview renders (characters). */
const MAX_PREVIEW_HTML = 2 * 1024 * 1024;

const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;

/**
 * True for a Magic Mail tracking URL (absolute or relative).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isTrackingUrl = (value) =>
  typeof value === 'string' && value.toLowerCase().includes(TRACKING_PATH);

/**
 * True for an http(s) or protocol-relative URL (a remote resource).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isRemoteUrl = (value) => typeof value === 'string' && /^\s*(?:https?:)?\/\//i.test(value);

/**
 * Removes CSS `url(...)` references to tracking URLs and, when images are
 * blocked, every remote `url(...)`. Linear scan with indexOf.
 *
 * @param {string} css
 * @param {boolean} allowImages
 * @returns {{css: string, blocked: number}}
 */
const stripCssUrls = (css, allowImages) => {
  if (typeof css !== 'string' || !css.toLowerCase().includes('url(')) return { css, blocked: 0 };
  let out = '';
  let at = 0;
  let blocked = 0;
  const lower = css.toLowerCase();
  for (;;) {
    const open = lower.indexOf('url(', at);
    if (open === -1) {
      out += css.slice(at);
      return { css: out, blocked };
    }
    const close = lower.indexOf(')', open + 4);
    if (close === -1) {
      out += css.slice(at);
      return { css: out, blocked };
    }
    const inner = css
      .slice(open + 4, close)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    const drop = isTrackingUrl(inner) || (!allowImages && isRemoteUrl(inner));
    out += css.slice(at, open) + (drop ? 'none' : css.slice(open, close + 1));
    if (drop) blocked += 1;
    at = close + 1;
  }
};

const PREVIEW_TAGS = [
  'html',
  'head',
  'body',
  'style',
  'div',
  'span',
  'p',
  'br',
  'hr',
  'a',
  'img',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'mark',
  'small',
  'sup',
  'sub',
  'abbr',
  'cite',
  'q',
  'font',
  'center',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'blockquote',
  'code',
  'pre',
  'address',
  'figure',
  'figcaption',
];

/**
 * Turns a sent or re-rendered email body into a sandbox-safe preview
 * document.
 *
 * @param {string} html - Email HTML (already masked at store time)
 * @param {{allowImages?: boolean}} [options]
 * @returns {{html: string, blockedImages: number, removedTracking: number, truncated: boolean}}
 */
const toPreviewDocument = (html, { allowImages = false } = {}) => {
  let source = typeof html === 'string' ? html : '';
  let truncated = false;
  if (source.length > MAX_PREVIEW_HTML) {
    source = source.slice(0, MAX_PREVIEW_HTML);
    truncated = true;
  }
  let blockedImages = 0;
  let removedTracking = 0;

  const body = sanitizeHtml(source, {
    allowedTags: PREVIEW_TAGS,
    allowVulnerableTags: true,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title'],
    allowedAttributes: {
      '*': [
        'style',
        'class',
        'id',
        'align',
        'valign',
        'bgcolor',
        'dir',
        'lang',
        'role',
        'title',
        'width',
        'height',
        'aria-*',
      ],
      a: ['title', 'name'],
      img: ['src', 'alt', 'border', 'data-mm-drop'],
      table: ['border', 'cellspacing', 'cellpadding', 'background', 'summary'],
      td: ['colspan', 'rowspan', 'background', 'nowrap'],
      th: ['colspan', 'rowspan', 'background', 'nowrap', 'scope'],
      col: ['span'],
      colgroup: ['span'],
      font: ['color', 'face', 'size'],
      style: ['type', 'media'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowedSchemesAppliedToAttributes: ['src', 'background'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: (frame) => {
      // Tracking pixels and data URLs that are not images are dropped whole.
      if (frame.tag !== 'img') return false;
      const src = typeof frame.attribs?.src === 'string' ? frame.attribs.src.trim() : '';
      return (
        frame.attribs?.['data-mm-drop'] === '1' ||
        isTrackingUrl(src) ||
        (/^data:/i.test(src) && !SAFE_DATA_IMAGE.test(src))
      );
    },
    transformTags: {
      // The preview wraps the body itself; the template's body styles
      // (font, background) move to a wrapper div so they are kept.
      body: (tagName, attribs) => ({
        tagName: 'div',
        attribs: {
          ...(typeof attribs.style === 'string'
            ? { style: stripCssUrls(attribs.style, allowImages).css }
            : {}),
          ...(attribs.bgcolor ? { bgcolor: attribs.bgcolor } : {}),
        },
      }),
      a: (tagName, attribs) => {
        const next = { ...attribs };
        // Links never navigate in the preview. The target stays visible on hover.
        // Tracked click URLs are not shown (they carry the recipient hash).
        if (
          typeof attribs.href === 'string' &&
          attribs.href.trim() &&
          !isTrackingUrl(attribs.href) &&
          !attribs.title
        ) {
          next.title = attribs.href.trim().slice(0, 500);
        }
        if (isTrackingUrl(next.title)) delete next.title;
        delete next.href;
        delete next.target;
        return { tagName, attribs: next };
      },
      '*': (tagName, attribs) => {
        const next = { ...attribs };
        if (typeof next.style === 'string') {
          const result = stripCssUrls(next.style, allowImages);
          next.style = result.css;
          blockedImages += result.blocked;
        }
        for (const attribute of ['background']) {
          if (typeof next[attribute] !== 'string') continue;
          if (isTrackingUrl(next[attribute])) {
            delete next[attribute];
            removedTracking += 1;
          } else if (!allowImages && isRemoteUrl(next[attribute])) {
            delete next[attribute];
            blockedImages += 1;
          }
        }
        if (tagName === 'img') {
          const src = typeof next.src === 'string' ? next.src.trim() : '';
          if (isTrackingUrl(src)) {
            removedTracking += 1;
            return { tagName, attribs: { 'data-mm-drop': '1' } };
          }
          if (/^data:/i.test(src) && !SAFE_DATA_IMAGE.test(src)) {
            return { tagName, attribs: { 'data-mm-drop': '1' } };
          }
          if (!allowImages && isRemoteUrl(src)) {
            delete next.src;
            blockedImages += 1;
            next.style = `${next.style ? `${next.style};` : ''}background:#eef0f3;outline:1px dashed #b0b6c0;min-height:16px;min-width:16px`;
            if (!next.alt) next.alt = '';
          }
        }
        return { tagName, attribs: next };
      },
    },
    allowedClasses: false,
  });

  // `<style>` blocks: same url() rule as inline styles.
  const styled = body.replace(
    /<style([^<>]{0,200})>([^<]{0,200000})<\/style>/gi,
    (all, attrs, css) => {
      const result = stripCssUrls(css, allowImages);
      blockedImages += result.blocked;
      const safeCss = result.css.replace(/@import[^;]{0,500};?/gi, '');
      return `<style${attrs}>${safeCss}</style>`;
    }
  );

  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    allowImages ? 'img-src data: https: http:' : 'img-src data:',
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const head =
    `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<meta name="referrer" content="no-referrer">' +
    '<style>html,body{background:#ffffff;color:#1f2933;}' +
    'body{overflow-wrap:anywhere;}img{max-width:100%;}a{cursor:default;}</style>';

  // Drop any <html>/<head>/<body> wrappers the template had and wrap once.
  const inner = styled
    .replace(/<\/?(?:html|body)(?:\s[^<>]{0,500})?>/gi, '')
    .replace(/<head(?:\s[^<>]{0,500})?>/gi, '')
    .replace(/<\/head>/gi, '');
  return {
    html: `<!doctype html><html><head>${head}</head><body>${inner}</body></html>`,
    blockedImages,
    removedTracking,
    truncated,
  };
};

/**
 * Stable hash of a template's content (subject, HTML and text as stored).
 * Used to find the template version an email was rendered from.
 *
 * @param {{subject?: string, bodyHtml?: string, bodyText?: string}} content
 * @returns {string} 64 hex characters
 */
const templateContentHash = (content = {}) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([content.subject ?? '', content.bodyHtml ?? '', content.bodyText ?? '']))
    .digest('hex');

/** Largest compressed copy stored (base64 characters). */
const MAX_COMPRESSED_COPY = 512 * 1024;

/**
 * Brotli-compresses a string to base64. Returns null when the result is
 * larger than the cap.
 *
 * @param {string} value
 * @returns {string|null}
 */
const compressCopy = (value) => {
  if (typeof value !== 'string' || !value) return null;
  const encoded = zlib
    .brotliCompressSync(Buffer.from(value, 'utf8'), {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
    })
    .toString('base64');
  return encoded.length > MAX_COMPRESSED_COPY ? null : encoded;
};

/**
 * Reverses compressCopy(). Output is capped at 8 MB (a corrupt or hostile
 * row can not exhaust memory).
 *
 * @param {unknown} value
 * @returns {string|null}
 */
const decompressCopy = (value) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return zlib
      .brotliDecompressSync(Buffer.from(value, 'base64'), { maxOutputLength: 8 * 1024 * 1024 })
      .toString('utf8');
  } catch {
    return null;
  }
};

module.exports = {
  TRACKING_PATH,
  MAX_COMPRESSED_COPY,
  isTrackingUrl,
  toPreviewDocument,
  templateContentHash,
  compressCopy,
  decompressCopy,
};
