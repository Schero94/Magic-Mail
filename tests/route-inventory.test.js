'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../server/src/routes/admin').routes;
const content = require('../server/src/routes/content-api').routes;

const expected = {
  accounts: 7,
  'routing-rules': 5,
  oauth: 7,
  designer: 18,
  analytics: 7,
  whatsapp: 11,
  settings: 2,
  'content-send': 3,
  'content-whatsapp': 2,
  tracking: 2,
};

const category = (scope, route) => {
  if (scope === 'content-api') {
    if (route.path.startsWith('/track/')) return 'tracking';
    if (route.path.startsWith('/whatsapp/')) return 'content-whatsapp';
    if (['/send', '/send-message', '/send-whatsapp'].includes(route.path)) return 'content-send';
    return 'unaccounted';
  }
  if (route.path === '/test-strapi-service' || route.path.startsWith('/accounts')) return 'accounts';
  if (route.path.startsWith('/routing-rules')) return 'routing-rules';
  if (route.path.startsWith('/oauth')) return 'oauth';
  if (route.path.startsWith('/designer')) return 'designer';
  if (route.path.startsWith('/analytics')) return 'analytics';
  if (route.path.startsWith('/whatsapp')) return 'whatsapp';
  if (route.path === '/settings') return 'settings';
  return 'unaccounted';
};

test('every route belongs to a frozen functional inventory group', () => {
  const actual = {};
  const seen = new Set();
  for (const [scope, routes] of [['admin', admin], ['content-api', content]]) {
    for (const route of routes) {
      const key = `${scope} ${route.method} ${route.path}`;
      assert.ok(!seen.has(key), `duplicate route ${key}`);
      seen.add(key);
      const group = category(scope, route);
      assert.notEqual(group, 'unaccounted', `document new route ${key}`);
      actual[group] = (actual[group] || 0) + 1;
    }
  }
  assert.deepEqual(actual, expected, 'review route inventory when adding or removing endpoints');
});

test('only signed OAuth callbacks and bounded tracking routes are public', () => {
  const publicAdmin = admin.filter((route) => route.config?.auth === false);
  const publicContent = content.filter((route) => route.config?.auth === false);
  assert.deepEqual(publicAdmin.map((r) => r.path).sort(), [
    '/oauth/gmail/callback', '/oauth/microsoft/callback', '/oauth/yahoo/callback',
  ]);
  assert.deepEqual(publicContent.map((r) => r.path).sort(), [
    '/track/click/:emailId/:linkHash/:recipientHash',
    '/track/open/:emailId/:recipientHash',
  ]);
  for (const route of [...admin, ...content]) {
    if (route.config?.auth === false) continue;
    assert.notEqual(route.config?.auth, false);
    if (admin.includes(route)) {
      assert.ok(route.config?.policies?.includes('admin::isAuthenticatedAdmin'), route.path);
      assert.ok(route.config?.policies?.some((p) => p.name === 'admin::hasPermissions'), route.path);
    }
  }
});
