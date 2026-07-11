'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

test('sensitive tracking URLs are classified correctly', () => {
  const { isSensitiveTrackingUrl } = require('../server/src/utils/tracking-url-policy');

  // Auth / one-time-token URLs must never be tracked.
  assert.equal(isSensitiveTrackingUrl('https://app.example.com/reset-password?code=abc123'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.com/auth/email-confirmation?confirmation=xyz'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.com/magic-link/login?token=secret'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.com/verify?token=t'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.com/p?jwt=aaaaaaaaaa.bbbbbbbbbb.cccccccccc'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.com/unsubscribe?u=1'), true);
  assert.equal(isSensitiveTrackingUrl('ftp://example.com/file'), true);
  assert.equal(isSensitiveTrackingUrl('not-a-url'), true);

  // Ordinary marketing links remain trackable.
  assert.equal(isSensitiveTrackingUrl('https://example.com/blog/post-1'), false);
  assert.equal(isSensitiveTrackingUrl('https://example.com/products?category=shoes'), false);
});

test('redactUrlForLog never exposes query or fragment', () => {
  const { redactUrlForLog } = require('../server/src/utils/tracking-url-policy');
  const redacted = redactUrlForLog('https://app.example.com/reset?token=supersecret#frag');
  assert.ok(!redacted.includes('supersecret'));
  assert.ok(!redacted.includes('frag'));
  assert.ok(redacted.startsWith('https://app.example.com/reset'));
});

test('link rewriting skips sensitive URLs and only stores marketing links', async () => {
  const stored = [];
  const strapi = {
    log: quietLog,
    config: { get: () => 'https://app.example.com' },
    plugin: () => ({ service: () => ({ getSettings: async () => ({}) }) }),
    documents: (uid) => ({
      findFirst: async () => {
        if (uid === 'plugin::magic-mail.email-log') return { documentId: 'log-1' };
        return null; // no existing link mapping
      },
      create: async ({ data }) => { stored.push(data.originalUrl); return { documentId: 'link-1', ...data }; },
    }),
  };
  const analytics = require('../server/src/services/analytics')({ strapi });

  const html = [
    '<a href="https://app.example.com/reset-password?code=abc">Reset</a>',
    '<a href="https://shop.example.com/sale">Shop the sale</a>',
  ].join('\n');

  const result = await analytics.rewriteLinksForTracking(html, 'email-1', 'recipient-hash');

  // Reset link is left untouched; marketing link is rewritten to the tracker.
  assert.ok(result.includes('https://app.example.com/reset-password?code=abc'), 'reset link preserved');
  assert.ok(!/track\/click\/[^"]*reset/.test(result));
  assert.ok(result.includes('/api/magic-mail/track/click/email-1/'), 'marketing link rewritten');

  // Only the marketing URL is persisted; the sensitive URL is never stored.
  assert.deepEqual(stored, ['https://shop.example.com/sale']);
});
