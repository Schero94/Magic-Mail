'use strict';

const crypto = require('crypto');

/**
 * Server-trusted provider labels. Only keys in this allowlist may be rendered,
 * so the provider segment can never be attacker-controlled markup.
 */
const PROVIDER_LABELS = {
  gmail: 'Gmail',
  microsoft: 'Microsoft',
  yahoo: 'Yahoo Mail',
};

/**
 * Origin of the Strapi admin panel (from `admin.absoluteUrl`), which may
 * differ from the API origin when the admin is served from its own host.
 * Returns null when it can not be determined; the page then posts to its
 * own origin.
 *
 * @returns {string|null}
 */
function getAdminOrigin() {
  try {
    const configured =
      typeof strapi !== 'undefined' ? strapi?.config?.get?.('admin.absoluteUrl') : null;
    if (typeof configured !== 'string' || !/^https?:\/\//i.test(configured)) return null;
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

/**
 * Renders a hardened OAuth callback HTML page.
 *
 * SECURITY: No request-derived value (`code`, `state`, provider `error`) is
 * ever interpolated into the HTML or the inline script on the server. The
 * script reads `code`/`state`/`error` from `window.location.search` at runtime
 * and forwards them to the opener via `postMessage`, targeted at the admin
 * panel origin (`admin.absoluteUrl`, falling back to the page's own origin). Only the server-trusted provider key — validated against a
 * fixed allowlist — is embedded. This removes the reflected-XSS vector that
 * existed when the raw `code`/`state` were interpolated into a script literal.
 *
 * The response is locked down with a per-response CSP nonce (no
 * `'unsafe-inline'`), `no-store` caching, `nosniff`, and framing/referrer
 * controls.
 *
 * @param {object} ctx - Koa context
 * @param {'gmail'|'microsoft'|'yahoo'} provider - Trusted provider key
 * @returns {void}
 * @throws {never} Invalid providers produce a 400 via `ctx` rather than throwing
 */
function renderOAuthCallback(ctx, provider) {
  const hasProvider = Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, provider);
  const providerKey = hasProvider ? provider : null;

  if (!providerKey) {
    ctx.status = 400;
    ctx.type = 'text';
    ctx.body = 'Unknown OAuth provider';
    return;
  }

  const label = PROVIDER_LABELS[providerKey];
  const nonce = crypto.randomBytes(16).toString('base64');

  ctx.set(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  ctx.set('X-Frame-Options', 'DENY');
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('Referrer-Policy', 'no-referrer');
  ctx.set('Cache-Control', 'no-store');
  ctx.set('Pragma', 'no-cache');

  // Only the fixed provider key (allowlisted) is embedded. code/state/error are
  // read client-side from location.search and are never serialized server-side.
  const providerLiteral = JSON.stringify(providerKey);
  // Server configuration only (never request data); JSON-encoded and with
  // '<' escaped so it can not close the script element.
  const adminOriginLiteral = JSON.stringify(getAdminOrigin()).replace(/</g, '\\u003c');

  ctx.type = 'html';
  ctx.body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MagicMail OAuth</title>
<style nonce="${nonce}">
  body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 48px; color: #1f2937; }
  #status { font-size: 20px; font-weight: 600; }
  #detail { font-size: 14px; color: #6b7280; margin-top: 12px; }
</style>
</head>
<body>
  <div id="status">Finishing ${label} authorization…</div>
  <div id="detail">You can close this window.</div>
  <script nonce="${nonce}">
    (function () {
      var PROVIDER = ${providerLiteral};
      var ADMIN_ORIGIN = ${adminOriginLiteral};
      var params = new URLSearchParams(window.location.search);
      var code = params.get('code');
      var state = params.get('state');
      var error = params.get('error');
      var statusEl = document.getElementById('status');
      var detailEl = document.getElementById('detail');

      if (error || !code) {
        statusEl.textContent = 'Authorization failed';
        detailEl.textContent = 'Please close this window and try again.';
        setTimeout(function () { window.close(); }, 3000);
        return;
      }

      if (window.opener) {
        // Only the admin panel origin may receive the code.
        window.opener.postMessage(
          { type: PROVIDER + '-oauth-success', code: code, state: state },
          ADMIN_ORIGIN || window.location.origin
        );
        setTimeout(function () { window.close(); }, 1200);
      } else {
        // Without the opening admin tab the code can not be used. It is never
        // put into another URL (history, logs, Referer).
        statusEl.textContent = 'Authorization could not be completed';
        detailEl.textContent = 'Close this window and start the connection again from the Magic Mail admin page.';
      }
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderOAuthCallback, PROVIDER_LABELS };
