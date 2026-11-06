'use strict';

/**
 * Tracking and analytics hardening (4.0): linear link rewriting, sensitive
 * URL policy, IP anonymisation and retention, degrading tracking rate limit,
 * link caps / allowlist / TTL, public base URL resolution, email log fields,
 * analytics deletion and the tracking HMAC secret. Synthetic data only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ANALYTICS_PATH = '../server/src/services/analytics';
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const HEX32 = /^[a-f0-9]{32}$/;
const EMAIL_ID = 'a'.repeat(32);
const LINK_HASH = 'b'.repeat(32);

/** Runs fn with the given env vars set (undefined deletes) and restores them. */
async function withEnv(vars, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function configGetter(values) {
  return { get: (key, fallback) => (Object.hasOwn(values, key) ? values[key] : fallback) };
}

/**
 * Fake strapi for link rewriting: one email log, in-memory link rows.
 */
function linkHarness({ config = {}, settings = {}, logMetadata = {}, failCreate = () => false } = {}) {
  const links = [];
  const strapi = {
    log: quietLog,
    config: configGetter({ 'server.url': 'https://cms.example.test', ...config }),
    plugin: () => ({ service: () => ({ getSettings: async () => settings }) }),
    documents: (uid) => ({
      findFirst: async () => {
        if (uid === 'plugin::magic-mail.email-log') return { documentId: 'log-doc', metadata: logMetadata };
        return null;
      },
      create: async ({ data }) => {
        if (failCreate(data)) throw new Error('insert failed');
        links.push(data);
        return { documentId: `link-${links.length}`, ...data };
      },
    }),
  };
  const analytics = require(ANALYTICS_PATH)({ strapi });
  return { analytics, links, strapi };
}

// ── SEC-01: ReDoS-free link rewriter ────────────────────────────────────────

test('SEC-01: adversarial 100 KB inputs are rewritten within a strict time budget', async () => {
  const { analytics } = linkHarness();
  const size = 100_000;
  const inputs = [
    `<a${' '.repeat(size)}`,
    '<a '.repeat(Math.floor(size / 3)),
    `<a${' '.repeat(300)}`.repeat(Math.floor(size / 303)),
    `<a href="${' '.repeat(size)}`,
    `<a x${'='.repeat(size)}>`,
    `<a ${'href= '.repeat(Math.floor(size / 6))}>`,
    `<a href='${'&amp;'.repeat(Math.floor(size / 5))}'>`,
    `${'<a\t\n'.repeat(Math.floor(size / 4))}>`,
  ];
  for (const html of inputs) {
    assert.ok(html.length >= 99_000, 'input is about 100 KB');
    const started = process.hrtime.bigint();
    // eslint-disable-next-line no-await-in-loop
    const result = await analytics.rewriteLinksForTracking(html, EMAIL_ID, 'c'.repeat(32));
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(typeof result, 'string');
    assert.ok(elapsedMs < 250, `rewrite took ${elapsedMs.toFixed(1)} ms (budget 250 ms)`);
  }
});

test('SEC-01: the rewriter handles quoting, entities and attribute look-alikes', () => {
  const { rewriteAnchorHrefs } = require(ANALYTICS_PATH).__test__;
  const seen = [];
  const html = [
    '<a title="href=https://evil.example.test" href="https://a.example.test/?x=1&amp;y=2">A</a>',
    "<A\nHREF = 'https://b.example.test/p'>B</A>",
    '<a href=https://c.example.test/u class=x>C</a>',
    '<abbr href="https://not-an-anchor.example.test">D</abbr>',
    '<a name="no-href">E</a>',
  ].join('');
  const out = rewriteAnchorHrefs(html, (url) => { seen.push(url); return `T(${url})`; });
  assert.deepEqual(seen, [
    'https://a.example.test/?x=1&y=2',
    'https://b.example.test/p',
    'https://c.example.test/u',
  ]);
  assert.match(out, /title="href=https:\/\/evil\.example\.test" href="T\(https:\/\/a\.example\.test\/\?x=1&amp;y=2\)"/);
  assert.match(out, /HREF = 'T\(https:\/\/b\.example\.test\/p\)'/);
  assert.match(out, /href="T\(https:\/\/c\.example\.test\/u\)" class=x/);
  assert.match(out, /<abbr href="https:\/\/not-an-anchor\.example\.test">/);
});

// ── SEC-03: sensitive URL parameters ────────────────────────────────────────

test('SEC-03: token-bearing parameter names and secret-looking values are never tracked', () => {
  const { isSensitiveTrackingUrl } = require('../server/src/utils/tracking-url-policy');
  for (const url of [
    'https://app.example.test/magic?loginToken=abc',
    'https://app.example.test/a?accessToken=1',
    'https://app.example.test/a?resetPasswordToken=1',
    'https://app.example.test/a?apiToken=1',
    'https://app.example.test/a?sessionToken=1',
    'https://app.example.test/a?inviteToken=1',
    'https://app.example.test/a?X-Amz-Signature=1',
    'https://app.example.test/a?auth_code=1',
    'https://app.example.test/a?ref=Ab3dEf5gHi7jKl9mNo1pQ',
    'https://app.example.test/a?id=0123456789abcdef0123456789abcdef',
    'https://app.example.test/app#access_token=1',
    'https://user:pw@app.example.test/a',
  ]) {
    assert.equal(isSensitiveTrackingUrl(url), true, url);
  }
  for (const url of [
    'https://shop.example.test/sale',
    'https://shop.example.test/p?utm_source=newsletter&utm_medium=email&utm_campaign=spring_sale_2026_newsletter',
    'https://shop.example.test/products?category=shoes&page=2',
    'https://shop.example.test/articles/q1w2e3r4t5y6u7i8o9p0abcd',
    'https://shop.example.test/search?keyword=boots&author=me',
  ]) {
    assert.equal(isSensitiveTrackingUrl(url), false, url);
  }
});

test('SEC-03/SEC-10: the V2 purge removes rows the improved classifier flags', async () => {
  const { purgeSensitiveLinkMappings } = require('../server/src/bootstrap');
  let rows = [
    { id: 1, originalUrl: 'https://shop.example.test/sale' },
    { id: 2, originalUrl: 'https://app.example.test/magic?loginToken=x' },
    { id: 3, originalUrl: 'https://app.example.test/a?accessToken=y' },
  ];
  const flags = {};
  const strapi = {
    store: () => ({ get: async ({ key }) => flags[key], set: async ({ key, value }) => { flags[key] = value; } }),
    db: {
      query: () => ({
        findMany: async ({ where }) => rows.filter((row) => row.id > where.id.$gt),
        deleteMany: async ({ where }) => { rows = rows.filter((row) => !where.id.$in.includes(row.id)); },
      }),
    },
  };
  await purgeSensitiveLinkMappings(strapi, quietLog);
  assert.deepEqual(rows.map((row) => row.id), [1]);
  assert.equal(flags.sensitiveLinkPurgeV2.done, true);
});

// ── SEC-05: IP anonymisation and retention ──────────────────────────────────

test('SEC-05: IPs are truncated to /24 and /48', () => {
  const { anonymizeIp } = require(ANALYTICS_PATH).__test__;
  assert.equal(anonymizeIp('203.0.113.77'), '203.0.113.0');
  assert.equal(anonymizeIp('::ffff:198.51.100.9'), '198.51.100.0');
  assert.equal(anonymizeIp('2001:db8:abcd:12::1'), '2001:db8:abcd::');
  assert.equal(anonymizeIp('2001:db8::1'), '2001:db8:0::');
  assert.equal(anonymizeIp('fe80::1%eth0'), 'fe80:0:0::');
  assert.equal(anonymizeIp('not-an-ip'), null);
  assert.equal(anonymizeIp(undefined), null);
});

test('SEC-05: open events store a truncated IP, a capped user agent and no location; X-Forwarded-For is ignored', async () => {
  await withEnv({ MAGIC_MAIL_TRACKING_SECRET: 't'.repeat(32) }, async () => {
    const events = [];
    const strapi = {
      log: quietLog,
      documents: (uid) => ({
        findFirst: async () => ({ documentId: 'log-doc', recipient: 'person@example.test', openCount: 0 }),
        update: async () => ({}),
        create: async ({ data }) => { if (uid.endsWith('email-event')) events.push(data); return data; },
      }),
    };
    const analytics = require(ANALYTICS_PATH)({ strapi });
    const hash = analytics.generateRecipientHash(EMAIL_ID, 'person@example.test');
    await analytics.recordOpen(EMAIL_ID, hash, {
      ip: '203.0.113.77',
      headers: { 'x-forwarded-for': '198.51.100.1', 'user-agent': 'U'.repeat(5000) },
    });
    await analytics.recordOpen(EMAIL_ID, hash, { ip: '', headers: { 'x-forwarded-for': '198.51.100.1' } });
    assert.equal(events.length, 2);
    assert.equal(events[0].ipAddress, '203.0.113.0');
    assert.equal(events[0].userAgent.length, 512);
    assert.equal('location' in events[0], false);
    assert.equal(events[1].ipAddress, null, 'raw X-Forwarded-For is never stored');
  });
});

test('SEC-05: retention deletes expired events and links; the legacy migration anonymises stored rows once', async () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000);
  const tables = {
    'plugin::magic-mail.email-event': [
      { id: 1, timestamp: daysAgo(120), ipAddress: '203.0.113.5', location: { ip: '203.0.113.5' }, linkUrl: null },
      { id: 2, timestamp: daysAgo(10), ipAddress: '203.0.113.6', location: { ip: '203.0.113.6' }, linkUrl: 'https://app.example.test/a?loginToken=x' },
      { id: 3, timestamp: daysAgo(5), ipAddress: '203.0.113.0', location: null, linkUrl: 'https://shop.example.test/sale' },
    ],
    'plugin::magic-mail.email-link': [
      { id: 1, createdAt: daysAgo(200) },
      { id: 2, createdAt: daysAgo(30) },
    ],
  };
  const flags = {};
  const matches = (row, where) => Object.entries(where).every(([field, cond]) => {
    if (cond.$lt) return row[field] < cond.$lt;
    if (cond.$gt !== undefined) return row[field] > cond.$gt;
    if (cond.$in) return cond.$in.includes(row[field]);
    return row[field] === cond;
  });
  const strapi = {
    log: quietLog,
    store: () => ({ get: async ({ key }) => flags[key], set: async ({ key, value }) => { flags[key] = value; } }),
    db: {
      query: (uid) => ({
        findMany: async ({ where, limit }) => tables[uid].filter((row) => matches(row, where)).slice(0, limit),
        deleteMany: async ({ where }) => {
          const before = tables[uid].length;
          tables[uid] = tables[uid].filter((row) => !matches(row, where));
          return { count: before - tables[uid].length };
        },
        update: async ({ where, data }) => {
          const row = tables[uid].find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        },
      }),
    },
  };
  const analytics = require(ANALYTICS_PATH)({ strapi });

  assert.equal(await analytics.migrateLegacyTrackingEvents(), 2);
  assert.equal(await analytics.migrateLegacyTrackingEvents(), 0, 'runs once');
  const events = tables['plugin::magic-mail.email-event'];
  assert.deepEqual(events.map((e) => e.ipAddress), ['203.0.113.0', '203.0.113.0', '203.0.113.0']);
  assert.ok(events.every((e) => e.location === null));
  assert.equal(events[1].linkUrl, null, 'sensitive click URL scrubbed');
  assert.equal(events[2].linkUrl, 'https://shop.example.test/sale');

  const summary = await analytics.purgeExpiredTrackingData(now);
  assert.deepEqual(summary, { events: 1, links: 1, logs: 0 });
  assert.deepEqual(tables['plugin::magic-mail.email-event'].map((e) => e.id), [2, 3]);
  assert.deepEqual(tables['plugin::magic-mail.email-link'].map((l) => l.id), [2]);
});

// ── SEC-06 / FUN-21 / STR-M03: tracking rate limit degrades ─────────────────

test('SEC-06: over the tracking limit requests continue flagged; only abusive rates get a plain 429', async () => {
  const rateLimit = require('../server/src/middlewares/rate-limit');
  const warnings = [];
  const mw = rateLimit(
    { bucket: 'tracking-degrade-test', max: 2, window: 60_000, degrade: true, hardMax: 4 },
    { strapi: { log: { ...quietLog, warn: (msg) => warnings.push(msg) } } }
  );
  const outcomes = [];
  for (let i = 0; i < 5; i += 1) {
    const ctx = { path: '/api/magic-mail/track/open/x/y', state: {}, request: { ip: '203.0.113.9' }, status: 200, set() {} };
    let passed = false;
    // eslint-disable-next-line no-await-in-loop
    await mw(ctx, async () => { passed = true; });
    outcomes.push({ passed, limited: ctx.state.magicMailRateLimited === true, status: ctx.status, body: ctx.body });
  }
  assert.deepEqual(outcomes.map((o) => o.passed), [true, true, true, true, false]);
  assert.deepEqual(outcomes.map((o) => o.limited), [false, false, true, true, false]);
  assert.equal(outcomes[4].status, 429);
  assert.equal(typeof outcomes[4].body, 'string', 'no JSON envelope on tracking routes');
  assert.equal(warnings.length, 1, 'one warning per caller and window');
  assert.doesNotMatch(warnings[0], /203\.0\.113\.9/, 'caller IP is not logged');
});

test('SEC-06: tracking routes are configured to degrade', () => {
  const routes = require('../server/src/routes/content-api').routes.filter((r) => r.path.startsWith('/track/'));
  assert.equal(routes.length, 2);
  for (const route of routes) {
    const limiter = route.config.middlewares.find((m) => m.name === 'plugin::magic-mail.rate-limit');
    assert.equal(limiter.config.degrade, true, route.path);
    assert.ok(limiter.config.hardMax > limiter.config.max);
  }
});

function controllerWith(service) {
  return require('../server/src/controllers/analytics')({
    strapi: { log: quietLog, plugin: () => ({ service: () => service }) },
  });
}

function trackingCtx(params, state = {}) {
  const headers = {};
  return {
    params,
    state,
    request: { ip: '203.0.113.9', headers: {} },
    headers,
    set(name, value) { headers[name] = value; },
    redirect(url) { this.redirected = url; },
    res: { setHeader() {}, end(body) { this.body = body; } },
  };
}

test('SEC-06: a rate-limited click still redirects without recording; a limited open still gets the pixel', async () => {
  const calls = [];
  const controller = controllerWith({
    getOriginalUrlFromHash: async (...args) => { calls.push(['resolve', args[3]]); return 'https://shop.example.test/sale'; },
    recordClick: async () => { calls.push(['recordClick']); },
    recordOpen: async () => { calls.push(['recordOpen']); },
  });

  const click = trackingCtx({ emailId: EMAIL_ID, linkHash: LINK_HASH, recipientHash: 'c'.repeat(32) }, { magicMailRateLimited: true });
  await controller.trackClick(click);
  assert.equal(click.redirected, 'https://shop.example.test/sale');
  assert.deepEqual(calls, [['resolve', { count: false }]]);

  calls.length = 0;
  const open = trackingCtx({ emailId: EMAIL_ID, recipientHash: 'c'.repeat(32) }, { magicMailRateLimited: true });
  await controller.trackOpen(open);
  assert.equal(open.respond, false);
  assert.deepEqual(calls, [], 'no DB work when rate limited');
});

test('SEC-06: malformed tracking ids never reach the database', async () => {
  const calls = [];
  const controller = controllerWith({
    getOriginalUrlFromHash: async () => { calls.push('resolve'); return null; },
    recordOpen: async () => { calls.push('open'); },
  });
  const open = trackingCtx({ emailId: "x' OR 1=1", recipientHash: 'zz' });
  await controller.trackOpen(open);
  const click = trackingCtx({ emailId: 'short', linkHash: LINK_HASH, recipientHash: 'c'.repeat(32) });
  click.type = null;
  global.strapi = { plugin: () => ({ service: () => ({ getSettings: async () => ({}) }) }), log: quietLog };
  try {
    await controller.trackClick(click);
  } finally {
    delete global.strapi;
  }
  assert.deepEqual(calls, []);
  assert.equal(click.status, 410);
  assert.match(String(click.body), /no longer available/);
  assert.doesNotMatch(String(click.body), /retention policy/);
});

// ── SEC-M02 / SEC-M03: link cap, allowlist, Content-API, TTL ────────────────

test('SEC-M02: at most maxLinksPerEmail distinct links are stored and rewritten', async () => {
  const { analytics, links } = linkHarness();
  const html = Array.from({ length: 3000 }, (_, i) => `<a href="https://shop.example.test/p/${i}">${i}</a>`).join('');
  const started = Date.now();
  const out = await analytics.rewriteLinksForTracking(html, EMAIL_ID, 'c'.repeat(32));
  assert.ok(Date.now() - started < 2000);
  assert.equal(links.length, 100);
  assert.equal((out.match(/\/magic-mail\/track\/click\//g) || []).length, 100);
  assert.ok(out.includes('href="https://shop.example.test/p/2999"'), 'links over the cap stay untouched');
});

test('SEC-M02: a link whose mapping cannot be stored is left untracked (no dead links)', async () => {
  const { analytics } = linkHarness({ failCreate: (data) => data.originalUrl.endsWith('/broken') });
  const html = '<a href="https://shop.example.test/ok">ok</a><a href="https://shop.example.test/broken">b</a>';
  const out = await analytics.rewriteLinksForTracking(html, EMAIL_ID, 'c'.repeat(32));
  assert.ok(out.includes('href="https://shop.example.test/broken"'));
  assert.equal((out.match(/track\/click/g) || []).length, 1);
});

test('SEC-M03: Content-API sends mint no redirects unless tracking.allowedLinkHosts is set', async () => {
  const html = '<a href="https://evil.example.test/x">x</a><a href="https://shop.example.test/y">y</a>';

  const api = linkHarness({ logMetadata: { source: 'content-api' } });
  assert.equal(await api.analytics.rewriteLinksForTracking(html, EMAIL_ID, 'c'.repeat(32)), html);
  assert.equal(api.links.length, 0);

  const allowed = linkHarness({
    logMetadata: { source: 'content-api' },
    config: { 'plugin::magic-mail.tracking': { allowedLinkHosts: ['shop.example.test'] } },
  });
  const out = await allowed.analytics.rewriteLinksForTracking(html, EMAIL_ID, 'c'.repeat(32));
  assert.deepEqual(allowed.links.map((l) => l.originalUrl), ['https://shop.example.test/y']);
  assert.ok(out.includes('href="https://evil.example.test/x"'));

  const admin = linkHarness({ logMetadata: { source: 'service' } });
  await admin.analytics.rewriteLinksForTracking(html, EMAIL_ID, 'c'.repeat(32));
  assert.equal(admin.links.length, 2, 'admin/service sends keep tracking every host by default');
});

test('SEC-M03: expired links and links outside the allowlist no longer redirect', async () => {
  await withEnv({ MAGIC_MAIL_TRACKING_SECRET: 't'.repeat(32) }, async () => {
    const make = (link, tracking = {}) => {
      let updates = 0;
      const strapi = {
        log: quietLog,
        config: configGetter({ 'plugin::magic-mail.tracking': tracking }),
        documents: (uid) => ({
          findFirst: async () => (uid.endsWith('email-log')
            ? { documentId: 'log-doc', recipient: 'person@example.test' }
            : { documentId: 'link-doc', clickCount: 0, ...link }),
          update: async () => { updates += 1; },
        }),
      };
      const analytics = require(ANALYTICS_PATH)({ strapi });
      return { analytics, hash: analytics.generateRecipientHash(EMAIL_ID, 'person@example.test'), updates: () => updates };
    };
    const fresh = new Date(Date.now() - 86_400_000).toISOString();
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();

    let h = make({ originalUrl: 'https://shop.example.test/a', createdAt: fresh });
    assert.equal(await h.analytics.getOriginalUrlFromHash(EMAIL_ID, LINK_HASH, h.hash), 'https://shop.example.test/a');
    assert.equal(h.updates(), 1);

    h = make({ originalUrl: 'https://shop.example.test/a', createdAt: fresh });
    assert.equal(await h.analytics.getOriginalUrlFromHash(EMAIL_ID, LINK_HASH, h.hash, { count: false }), 'https://shop.example.test/a');
    assert.equal(h.updates(), 0, 'count:false resolves without writes');

    h = make({ originalUrl: 'https://shop.example.test/a', createdAt: old });
    assert.equal(await h.analytics.getOriginalUrlFromHash(EMAIL_ID, LINK_HASH, h.hash), null, '180-day TTL');

    h = make({ originalUrl: 'https://shop.example.test/a', createdAt: old }, { linkTtlDays: 0 });
    assert.equal(await h.analytics.getOriginalUrlFromHash(EMAIL_ID, LINK_HASH, h.hash), 'https://shop.example.test/a');

    h = make({ originalUrl: 'https://evil.example.test/a', createdAt: fresh }, { allowedLinkHosts: ['example.org'] });
    assert.equal(await h.analytics.getOriginalUrlFromHash(EMAIL_ID, LINK_HASH, h.hash), null);
  });
});

// ── FUN-03 / STR-04: public base URL ────────────────────────────────────────

test('FUN-03/STR-04: pixel and links share trackingBaseUrl, server.url, absoluteUrl and the REST prefix', async () => {
  const { resolveTrackingEndpoint, resetWarnings } = require(ANALYTICS_PATH).__test__;
  const fakeStrapi = (values) => ({ log: quietLog, config: configGetter(values) });

  assert.equal(
    resolveTrackingEndpoint(fakeStrapi({ 'server.url': 'https://cms.example.test' }), { trackingBaseUrl: 'https://t.example.test/' }),
    'https://t.example.test/api/magic-mail/track'
  );
  assert.equal(
    resolveTrackingEndpoint(fakeStrapi({ 'server.url': '', 'server.absoluteUrl': 'https://cms.example.test/sub', 'api.rest.prefix': '/v2' })),
    'https://cms.example.test/sub/v2/magic-mail/track'
  );

  await withEnv({ NODE_ENV: 'production' }, async () => {
    resetWarnings();
    const warnings = [];
    const strapi = { log: { ...quietLog, warn: (m) => warnings.push(m) }, config: configGetter({ 'server.url': '', 'server.absoluteUrl': 'http://localhost:1337' }) };
    assert.equal(resolveTrackingEndpoint(strapi, {}), null, 'no localhost in production');
    resolveTrackingEndpoint(strapi, {});
    assert.equal(warnings.length, 1, 'warned once');

    const { analytics, links } = linkHarness({ config: { 'server.url': '', 'server.absoluteUrl': 'http://0.0.0.0:1337' } });
    const html = '<html><body><a href="https://shop.example.test/a">a</a></body></html>';
    assert.equal(await analytics.addTracking(html, EMAIL_ID, 'c'.repeat(32)), html, 'sent untracked');
    assert.equal(links.length, 0);
  });

  const { analytics } = linkHarness({ settings: { trackingBaseUrl: 'https://t.example.test' } });
  const html = '<html><body><a href="https://shop.example.test/a">a</a></body></html>';
  const out = await analytics.addTracking(html, EMAIL_ID, 'c'.repeat(32));
  assert.match(out, /<img src="https:\/\/t\.example\.test\/api\/magic-mail\/track\/open\/a{32}\/c{32}\?r=[a-f0-9]{16}"/);
  assert.match(out, /href="https:\/\/t\.example\.test\/api\/magic-mail\/track\/click\/a{32}\/[a-f0-9]{32}\/c{32}"/);
  assert.ok(out.indexOf('<img') < out.indexOf('</body>'));
});

// ── FUN-09: email log fields ────────────────────────────────────────────────

test('FUN-09: email logs store a bare first recipient, a bounded subject and the numeric template reference', async () => {
  const created = [];
  const analytics = require(ANALYTICS_PATH)({
    strapi: { log: quietLog, documents: () => ({ create: async ({ data }) => { created.push(data); return data; } }) },
  });
  await analytics.createEmailLog({ to: ['First@Example.test', 'second@example.test'], subject: 'S'.repeat(1000), templateReferenceId: '42', templateId: 'welcome-mail' });
  await analytics.createEmailLog({ to: '"Doe, Jane" <Jane@Example.test>', subject: 'Hi', templateId: 7 });
  await analytics.createEmailLog({ to: 'a@example.test, b@example.test', subject: 'Hi', templateId: 'not-numeric' });

  assert.equal(created[0].recipient, 'first@example.test');
  assert.deepEqual(created[0].metadata.recipients, ['first@example.test', 'second@example.test']);
  assert.equal(created[0].subject.length, 255);
  assert.equal(created[0].templateId, 42);
  assert.equal(created[0].metadata.requestedTemplateId, 'welcome-mail');
  assert.equal(created[1].recipient, 'jane@example.test');
  assert.equal(created[1].templateId, 7);
  assert.equal(created[2].recipient, 'a@example.test');
  assert.equal(created[2].templateId, null);
  assert.ok(created.every((row) => HEX32.test(row.emailId) && row.deliveryStatus === 'pending'));
});

test('FUN-09: the recipient hash of a multi-recipient send matches the stored log recipient', async () => {
  await withEnv({ MAGIC_MAIL_TRACKING_SECRET: 't'.repeat(32) }, async () => {
    const analytics = require(ANALYTICS_PATH)({ strapi: { log: quietLog } });
    const sendHash = analytics.generateRecipientHash(EMAIL_ID, ['first@example.test', 'second@example.test']);
    assert.equal(analytics.verifyRecipientHash(EMAIL_ID, 'first@example.test', sendHash), true);
  });
});

// ── FUN-18: deletion, clear-all, server-side search ─────────────────────────

function deletionHarness(logCount) {
  const tables = {
    'plugin::magic-mail.email-log': Array.from({ length: logCount }, (_, i) => ({ id: i + 1, sentAt: i })),
    'plugin::magic-mail.email-event': Array.from({ length: logCount }, (_, i) => ({ id: i + 1, emailLog: i + 1 })),
    'plugin::magic-mail.email-link': Array.from({ length: logCount * 2 }, (_, i) => ({ id: i + 1, emailLog: (i % logCount) + 1 })),
  };
  const matches = (row, where = {}) => Object.entries(where).every(([field, cond]) => {
    if (field === 'emailLog') return cond.id.$in.includes(row.emailLog);
    if (cond && cond.$in) return cond.$in.includes(row[field]);
    return true;
  });
  const strapi = {
    log: quietLog,
    db: {
      query: (uid) => ({
        findMany: async ({ where, limit }) => tables[uid].filter((row) => matches(row, where)).slice(0, limit),
        findOne: async () => tables[uid][0] || null,
        count: async ({ where }) => tables[uid].filter((row) => matches(row, where)).length,
        deleteMany: async ({ where }) => {
          const before = tables[uid].length;
          tables[uid] = tables[uid].filter((row) => !matches(row, where));
          return { count: before - tables[uid].length };
        },
      }),
    },
  };
  return { strapi, tables };
}

test('FUN-18: deleting logs also deletes their events and stored link mappings; clear-all reports hasMore', async () => {
  const { strapi, tables } = deletionHarness(30);
  const analytics = require(ANALYTICS_PATH)({ strapi });

  assert.equal(await analytics.deleteEmailLogsByIds([1]), 1);
  assert.equal(tables['plugin::magic-mail.email-event'].some((e) => e.emailLog === 1), false);
  assert.equal(tables['plugin::magic-mail.email-link'].some((l) => l.emailLog === 1), false);

  const first = await analytics.deleteEmailLogs({}, { max: 20 });
  assert.deepEqual(first, { deletedCount: 20, hasMore: true });
  const second = await analytics.deleteEmailLogs({}, { max: 20 });
  assert.deepEqual(second, { deletedCount: 9, hasMore: false });
  assert.equal(tables['plugin::magic-mail.email-link'].length, 0);
  assert.equal(tables['plugin::magic-mail.email-event'].length, 0);
});

test('FUN-18: DELETE /analytics/emails returns deletedCount and hasMore from the service', async () => {
  const controller = require('../server/src/controllers/analytics')({
    strapi: {
      log: quietLog,
      plugin: () => ({ service: () => ({ deleteEmailLogs: async (where, opts) => ({ deletedCount: opts.max, hasMore: true }) }) }),
    },
  });
  const ctx = { query: {}, send(body) { this.body = body; } };
  await controller.clearAllEmailLogs(ctx);
  assert.equal(ctx.body.deletedCount, 10_000);
  assert.equal(ctx.body.hasMore, true);

  const bad = { query: { olderThan: 'not-a-date' }, badRequest(msg) { this.error = msg; } };
  await controller.clearAllEmailLogs(bad);
  assert.equal(bad.error, 'Invalid olderThan date');
});

test('FUN-18: email log search covers template names, filters by delivery status and caps pageSize', async () => {
  let captured;
  const analytics = require(ANALYTICS_PATH)({
    strapi: {
      log: quietLog,
      documents: () => ({ findMany: async (q) => { captured = q; return []; }, count: async () => 0 }),
    },
  });
  const result = await analytics.getEmailLogs({ search: '  welcome  ', deliveryStatus: 'failed' }, { page: 3, pageSize: 500 });
  assert.deepEqual(captured.filters.$or.map((c) => Object.keys(c)[0]), ['recipient', 'subject', 'recipientName', 'templateName']);
  assert.equal(captured.filters.$or[0].recipient.$containsi, 'welcome');
  assert.equal(captured.filters.deliveryStatus, 'failed');
  assert.equal(captured.limit, 100);
  assert.equal(captured.start, 200);
  assert.equal(result.pagination.pageSize, 100);

  const { validate } = require('../server/src/validation');
  assert.equal(validate('analytics.logsQuery', { deliveryStatus: 'sent' }).deliveryStatus, 'sent');
  assert.throws(() => validate('analytics.logsQuery', { deliveryStatus: 'bogus' }));
});

// ── FUN-M03 / STR-M01: tracking HMAC secret ─────────────────────────────────

test('FUN-M03: tracking hashes use a dedicated secret and survive APP_KEYS rotation', async () => {
  const strapi = { log: quietLog };
  const analytics = require(ANALYTICS_PATH)({ strapi });

  // Hash created with the encryption key, then APP_KEYS rotates: still valid.
  const hash = await withEnv({ MAGIC_MAIL_TRACKING_SECRET: undefined, MAGIC_MAIL_ENCRYPTION_KEY: 'e'.repeat(32), APP_KEYS: 'old1,old2' },
    () => analytics.generateRecipientHash(EMAIL_ID, 'person@example.test'));
  await withEnv({ MAGIC_MAIL_TRACKING_SECRET: undefined, MAGIC_MAIL_ENCRYPTION_KEY: 'e'.repeat(32), APP_KEYS: 'new1,old1' }, () => {
    assert.equal(analytics.verifyRecipientHash(EMAIL_ID, 'person@example.test', hash), true);
    assert.equal(analytics.verifyRecipientHash(EMAIL_ID, 'other@example.test', hash), false);
  });

  // Pre-4.0 hashes (HMAC keyed with the raw APP_KEYS string) keep working.
  const crypto = require('crypto');
  const legacy = crypto.createHmac('sha256', 'k1,k2').update(`${EMAIL_ID}-person@example.test`).digest('hex').substring(0, 32);
  await withEnv({ MAGIC_MAIL_TRACKING_SECRET: 's'.repeat(32), MAGIC_MAIL_ENCRYPTION_KEY: undefined, APP_KEYS: 'k1,k2' }, () => {
    assert.equal(analytics.verifyRecipientHash(EMAIL_ID, 'person@example.test', legacy), true);
    assert.notEqual(analytics.generateRecipientHash(EMAIL_ID, 'person@example.test'), legacy, 'new hashes use the dedicated secret');
  });

  // Rotating the dedicated secret: the previous one stays accepted when listed.
  const before = await withEnv({ MAGIC_MAIL_TRACKING_SECRET: 'old-secret-'.padEnd(32, 'x'), APP_KEYS: undefined, MAGIC_MAIL_ENCRYPTION_KEY: undefined },
    () => analytics.generateRecipientHash(EMAIL_ID, 'person@example.test'));
  await withEnv({
    MAGIC_MAIL_TRACKING_SECRET: 'new-secret-'.padEnd(32, 'x'),
    MAGIC_MAIL_TRACKING_SECRET_PREVIOUS: 'old-secret-'.padEnd(32, 'x'),
    APP_KEYS: undefined,
    MAGIC_MAIL_ENCRYPTION_KEY: undefined,
  }, () => {
    assert.equal(analytics.verifyRecipientHash(EMAIL_ID, 'person@example.test', before), true);
  });

  await withEnv({ MAGIC_MAIL_TRACKING_SECRET: undefined, MAGIC_MAIL_ENCRYPTION_KEY: undefined, APP_KEYS: undefined }, () => {
    assert.throws(() => analytics.generateRecipientHash(EMAIL_ID, 'person@example.test'), /No tracking secret/);
  });
});

// ── SUP-14 (server part): {{system.*}} merge tags ───────────────────────────

test('SUP-14: templates receive server-owned system merge tags that callers cannot override', async () => {
  let renderedWith;
  const strapi = {
    log: quietLog,
    config: configGetter({}),
    plugin: () => ({
      service: (name) => {
        if (name === 'plugin-settings') return { getSettings: async () => ({ unsubscribeUrl: 'https://shop.example.test/unsub?e={{email}}' }) };
        if (name === 'analytics') return require(ANALYTICS_PATH)({ strapi });
        if (name === 'email-designer') {
          return {
            renderTemplate: async (ref, data) => { renderedWith = data; return { html: '<p>x</p>', text: 'x', subject: 's' }; },
            findOne: async () => null,
          };
        }
        throw new Error(name);
      },
    }),
  };
  const router = require('../server/src/services/email-router')({ strapi });
  const data = { to: 'Person@Example.test', templateReferenceId: '5', templateData: { name: 'Ann', system: { unsubscribe: 'https://evil.example.test' } } };
  await router.renderTemplateFor(data);
  assert.equal(renderedWith.name, 'Ann');
  assert.equal(renderedWith.system.unsubscribe, 'https://shop.example.test/unsub?e=person%40example.test');
  assert.match(renderedWith.system.year, /^\d{4}$/);
  assert.match(renderedWith.system.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(renderedWith.system.webview, '');
});

test('config: tracking options are validated', () => {
  const config = require('../server/src/config');
  config.validator(config.default);
  assert.throws(() => config.validator({ tracking: { eventRetentionDays: -1 } }));
  assert.throws(() => config.validator({ tracking: { allowedLinkHosts: 'example.test' } }));
  assert.throws(() => config.validator({ tracking: { anonymizeIp: 'yes' } }));
});
