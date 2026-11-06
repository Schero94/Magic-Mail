'use strict';

/**
 * Regression tests from the adversarial review of the 4.0 hardening branch:
 * rate-limiter cost and IPv6 keying, tracking-URL classification gaps and
 * error-shaped objects in the plugin logger. Synthetic data only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const rateLimit = require('../server/src/middlewares/rate-limit');
const { isSensitiveTrackingUrl } = require('../server/src/utils/tracking-url-policy');
const { formatMessage } = require('../server/src/utils/logger');

const quietStrapi = { log: { debug() {}, info() {}, warn() {}, error() {} } };

const ipCtx = (ip) => ({ request: { ip }, state: {}, status: 200, body: null, set() {} });

test('rate limiter keys IPv6 callers by /64 so address rotation does not reset the quota', async () => {
  rateLimit.resetForTests();
  const mw = rateLimit({ bucket: 'review-ipv6', max: 2, window: 60_000 }, { strapi: quietStrapi });

  const results = [];
  for (const ip of ['2001:db8:1:2::1', '2001:db8:1:2::2', '2001:db8:1:2:aaaa:bbbb:cccc:dddd']) {
    const ctx = ipCtx(ip);
    let passed = false;
    await mw(ctx, async () => { passed = true; });
    results.push({ passed, status: ctx.status });
  }
  assert.deepEqual(results.map((r) => r.passed), [true, true, false]);
  assert.equal(results[2].status, 429);

  // Another /64 has its own quota.
  const other = ipCtx('2001:db8:1:3::1');
  let otherPassed = false;
  await mw(other, async () => { otherPassed = true; });
  assert.equal(otherPassed, true);

  assert.equal(rateLimit.ipNetworkKey('::ffff:192.0.2.7'), '192.0.2.7');
  assert.equal(rateLimit.ipNetworkKey('192.0.2.7'), '192.0.2.7');
  assert.equal(rateLimit.ipNetworkKey('2001:db8:1:2:3:4:5:6'), rateLimit.ipNetworkKey('2001:db8:1:2::9'));
  rateLimit.resetForTests();
});

test('rate limiter does not sweep the whole bucket map on every request', async () => {
  rateLimit.resetForTests();
  const mw = rateLimit({ bucket: 'review-cost', max: 300, window: 60_000, degrade: true }, { strapi: quietStrapi });

  // 20k distinct live callers used to take seconds because every request
  // iterated all live entries; the throttled sweep keeps this linear.
  const started = process.hrtime.bigint();
  for (let i = 0; i < 20_000; i += 1) {
    await mw(ipCtx(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`), async () => {});
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(rateLimit.bucketCount() >= 20_000);
  assert.ok(elapsedMs < 1_500, `20k distinct callers took ${elapsedMs.toFixed(0)} ms`);
  rateLimit.resetForTests();
});

test('percent-encoded authentication paths are not click-tracked', () => {
  assert.equal(isSensitiveTrackingUrl('https://app.example.test/reset%2Dpassword/abc'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.test/%6Dagic-link/abc'), true);
  assert.equal(isSensitiveTrackingUrl('https://app.example.test/blog/reset%20your%20garden'), false);
});

test('bare tokens used as query or fragment names are not click-tracked', () => {
  const token = 'Ab3dEf9Gh2Jk4Lm6Np8Qr0St';
  assert.equal(isSensitiveTrackingUrl(`https://app.example.test/welcome?${token}`), true);
  assert.equal(isSensitiveTrackingUrl(`https://app.example.test/welcome#${token}`), true);
  // Ordinary marketing links stay trackable.
  assert.equal(isSensitiveTrackingUrl('https://shop.example.test/sale?utm_source=newsletter&utm_campaign=spring_sale_2026'), false);
  assert.equal(isSensitiveTrackingUrl('https://shop.example.test/docs#section-two'), false);
});

test('logger reduces error-shaped objects to name and code', () => {
  const httpError = {
    name: 'HTTPError',
    code: 'E_UPSTREAM',
    message: 'request for recipient@example.test failed',
    response: { body: 'secret-response-body' },
  };
  const line = formatMessage('[magic-mail]', ['send failed:', httpError]);
  assert.equal(line, '[magic-mail] send failed: HTTPError (E_UPSTREAM)');
  assert.ok(!line.includes('recipient@example.test'));
  assert.ok(!line.includes('secret-response-body'));

  const plain = formatMessage('[magic-mail]', ['state', { count: 2 }]);
  assert.equal(plain, '[magic-mail] state {"count":2}');

  const realError = new TypeError('contains recipient@example.test');
  assert.equal(formatMessage('[magic-mail]', [realError]), '[magic-mail] TypeError');
});
