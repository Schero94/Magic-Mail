'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

function makeCallbackCtx(query) {
  const headers = {};
  return {
    query,
    headers,
    status: 200,
    type: null,
    body: null,
    set(name, value) { headers[name] = value; },
    badRequest(message) { this.status = 400; this.body = message; },
    throw(status, message) { const err = new Error(message); err.status = status; throw err; },
  };
}

test('OAuth callback never reflects request query into the response', async () => {
  const oauth = require('../server/src/controllers/oauth');
  const payload = "</script><script>window.__xss=1</script>";
  const ctx = makeCallbackCtx({ code: payload, state: payload, error: payload });

  await oauth.gmailCallback(ctx);

  assert.equal(ctx.type, 'html');
  const body = String(ctx.body);
  assert.ok(!body.includes('window.__xss=1'), 'must not reflect injected script');
  assert.ok(!body.includes(payload), 'must not reflect the raw payload anywhere');
});

test('OAuth callback uses a nonce CSP without unsafe-inline and disables caching', async () => {
  const oauth = require('../server/src/controllers/oauth');
  const ctx = makeCallbackCtx({ code: 'auth-code', state: 'state-token' });

  await oauth.microsoftCallback(ctx);

  const csp = ctx.headers['Content-Security-Policy'];
  assert.ok(csp, 'CSP header required');
  assert.ok(/script-src 'nonce-/.test(csp), 'script-src must be nonce based');
  assert.ok(!/unsafe-inline/.test(csp), 'CSP must not allow unsafe-inline');
  assert.equal(ctx.headers['Cache-Control'], 'no-store');
  assert.equal(ctx.headers['X-Content-Type-Options'], 'nosniff');

  const match = csp.match(/nonce-([A-Za-z0-9+/=]+)/);
  assert.ok(match, 'nonce present in CSP');
  assert.ok(String(ctx.body).includes(`nonce="${match[1]}"`), 'inline script must carry the CSP nonce');
});

test('OAuth callback rejects an unknown provider without emitting HTML', async () => {
  const { renderOAuthCallback } = require('../server/src/utils/oauth-callback-response');
  const ctx = makeCallbackCtx({ code: 'x' });
  renderOAuthCallback(ctx, 'evil-provider');
  assert.equal(ctx.status, 400);
  assert.notEqual(ctx.type, 'html');
});

test('OAuth state can be consumed by exactly one of many concurrent callers', async () => {
  const previousSecret = process.env.MAGIC_MAIL_OAUTH_STATE_SECRET;
  process.env.MAGIC_MAIL_OAUTH_STATE_SECRET = 's'.repeat(32);
  const values = new Map();
  // Async store latency widens the check-then-set race window.
  const strapi = {
    log: quietLog,
    store: () => ({
      get: async ({ key }) => { await tick(); return values.get(key); },
      set: async ({ key, value }) => { await tick(); values.set(key, value); },
      delete: async ({ key }) => { await tick(); values.delete(key); },
    }),
  };
  const { createState, verifyAndConsumeState } = require('../server/src/utils/oauth-state');

  try {
    const created = await createState(strapi, { clientId: 'client', provider: 'gmail' });
    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, () => verifyAndConsumeState(strapi, created.state, 'client'))
    );
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, 'exactly one consumer may succeed');
    assert.ok(fulfilled[0].value.codeVerifier, 'winner receives the PKCE verifier');
  } finally {
    if (previousSecret === undefined) delete process.env.MAGIC_MAIL_OAUTH_STATE_SECRET;
    else process.env.MAGIC_MAIL_OAUTH_STATE_SECRET = previousSecret;
  }
});
