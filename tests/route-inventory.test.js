'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const admin = require('../server/src/routes/admin').routes;
const content = require('../server/src/routes/content-api').routes;

const expected = {
  accounts: 7,
  'routing-rules': 5,
  oauth: 8,
  designer: 19,
  analytics: 7,
  settings: 2,
  'content-send': 2,
  tracking: 2,
};

const category = (scope, route) => {
  if (scope === 'content-api') {
    if (route.path.startsWith('/track/')) return 'tracking';
    if (['/send', '/send-message'].includes(route.path)) return 'content-send';
    return 'unaccounted';
  }
  if (route.path === '/test-strapi-service' || route.path.startsWith('/accounts'))
    return 'accounts';
  if (route.path.startsWith('/routing-rules')) return 'routing-rules';
  if (route.path.startsWith('/oauth')) return 'oauth';
  if (route.path.startsWith('/designer')) return 'designer';
  if (route.path.startsWith('/analytics')) return 'analytics';
  if (route.path === '/settings') return 'settings';
  return 'unaccounted';
};

test('every route belongs to a frozen functional inventory group', () => {
  const actual = {};
  const seen = new Set();
  for (const [scope, routes] of [
    ['admin', admin],
    ['content-api', content],
  ]) {
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
    '/oauth/gmail/callback',
    '/oauth/microsoft/callback',
    '/oauth/yahoo/callback',
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
      assert.ok(
        route.config?.policies?.some((p) => p.name === 'admin::hasPermissions'),
        route.path
      );
    }
  }
});

test('admin routes require the matching least-privilege capability', () => {
  const capabilityFor = (route) => {
    if (
      route.path === '/oauth/gmail/callback' ||
      route.path === '/oauth/microsoft/callback' ||
      route.path === '/oauth/yahoo/callback'
    )
      return null;

    if (
      route.path === '/accounts/:accountId/test' ||
      route.path === '/test-strapi-service' ||
      route.path === '/designer/templates/:id/test-send'
    )
      return 'test-send';

    if (
      route.path === '/oauth/gmail/auth' ||
      route.path === '/oauth/microsoft/auth' ||
      route.path === '/oauth/yahoo/auth' ||
      route.path === '/oauth/create-account' ||
      route.path === '/oauth/reconnect/:accountId'
    )
      return 'manage';

    // Rendering/exporting a template reads plugin data but does not mutate it.
    if (route.path === '/designer/render/:templateReferenceId' || route.path === '/designer/export')
      return 'read';

    return route.method === 'GET' ? 'read' : 'manage';
  };

  for (const route of admin) {
    const expectedCapability = capabilityFor(route);
    if (expectedCapability === null) continue;

    const permissionPolicies = (route.config.policies || []).filter(
      (policy) => typeof policy === 'object' && policy.name === 'admin::hasPermissions'
    );
    assert.equal(
      permissionPolicies.length,
      1,
      `${route.method} ${route.path} must have one permission policy`
    );
    // users-permissions email templates also need the users-permissions grant.
    const extra =
      route.path === '/designer/core/:coreEmailType'
        ? [
            `plugin::users-permissions.email-templates.${route.method === 'GET' ? 'read' : 'update'}`,
          ]
        : [];
    assert.deepEqual(
      permissionPolicies[0].config.actions,
      [`plugin::magic-mail.${expectedCapability}`, ...extra],
      `${route.method} ${route.path} must require ${expectedCapability}`
    );
  }
});

test('server and admin register read, manage and test-send grants separately from overview access', () => {
  const registered = [];
  require('../server/src/register')({
    strapi: {
      admin: {
        services: {
          permission: {
            actionProvider: {
              registerMany: (actions) => registered.push(...actions),
            },
          },
        },
      },
    },
  });

  assert.deepEqual(registered.map(({ uid }) => uid).sort(), [
    'access',
    'manage',
    'read',
    'test-send',
  ]);
  for (const action of registered) {
    assert.equal(action.section, 'plugins', `${action.uid} must be a plugin permission`);
    assert.equal(action.pluginName, 'magic-mail', `${action.uid} must belong to Magic-Mail`);
    assert.ok(action.subCategory, `${action.uid} must be visible in the Strapi role editor`);
  }

  const permissionSource = fs.readFileSync(
    path.join(__dirname, '../admin/src/permissions.js'),
    'utf8'
  );
  for (const [key, action] of [
    ['access', 'access'],
    ['read', 'read'],
    ['manage', 'manage'],
    ['testSend', 'test-send'],
  ]) {
    assert.match(
      permissionSource,
      new RegExp(`${key}:\\s*\\[\\{\\s*action:\\s*\\x60plugin::\\$\\{pluginId\\}\\.${action}\\x60`),
      `admin permissions must expose ${action}`
    );
  }

  const adminIndex = fs.readFileSync(path.join(__dirname, '../admin/src/index.js'), 'utf8');
  assert.match(adminIndex, /import pluginPermissions from '\.\/permissions';/);
  assert.equal((adminIndex.match(/permissions:\s*pluginPermissions\.access/g) || []).length, 1);
  assert.equal((adminIndex.match(/permissions:\s*pluginPermissions\.read/g) || []).length, 1);

  // One outer access and read gate covers the editor route and the tabbed
  // list routes, including direct navigation to either branch.
  const appPage = fs.readFileSync(path.join(__dirname, '../admin/src/pages/App.jsx'), 'utf8');
  assert.equal((appPage.match(/permissions=\{pluginPermissions\.access\}/g) || []).length, 1);
  assert.equal((appPage.match(/permissions=\{pluginPermissions\.read\}/g) || []).length, 1);
});
