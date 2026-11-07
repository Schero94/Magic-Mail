'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const source = (relativePath) => readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const compiledRBACHook = esbuild.transformSync(source('admin/src/hooks/useMagicMailRBAC.js'), {
  format: 'cjs',
  loader: 'js',
}).code;

function evaluateRBACHook(
  allowedActions,
  rbacState = { isLoading: false, error: undefined },
  queueActions = {}
) {
  const captured = {};
  const module = { exports: {} };
  const permissions = {
    access: [{ action: 'plugin::magic-mail.access', subject: null }],
    read: [{ action: 'plugin::magic-mail.read', subject: null }],
    manage: [{ action: 'plugin::magic-mail.manage', subject: null }],
    testSend: [{ action: 'plugin::magic-mail.test-send', subject: null }],
    queueRead: [{ action: 'plugin::magic-mail.queue.read', subject: null }],
    queueManage: [{ action: 'plugin::magic-mail.queue.manage', subject: null }],
  };
  const dependencies = {
    '@strapi/strapi/admin': {
      // The hook asks for the outbox grants in a second call (useRBAC names
      // capabilities after the last action segment, so queue.read would
      // collide with read).
      useRBAC: (requestedPermissions) => {
        if (requestedPermissions.some(({ action }) => action.includes('.queue.'))) {
          captured.queuePermissions = requestedPermissions;
          return { allowedActions: queueActions, ...rbacState };
        }
        captured.requestedPermissions = requestedPermissions;
        return { allowedActions, ...rbacState };
      },
    },
    '../permissions': permissions,
  };

  const mockRequire = (request) => {
    if (Object.hasOwn(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected dependency in RBAC hook test: ${request}`);
  };

  new Function('require', 'module', 'exports', compiledRBACHook)(
    mockRequire,
    module,
    module.exports
  );

  return {
    capabilities: module.exports.useMagicMailRBAC(),
    requestedPermissions: captured.requestedPermissions,
    queuePermissions: captured.queuePermissions,
  };
}

test('plugin pages require read permission in addition to the navigation grant', () => {
  const app = source('admin/src/pages/App.jsx');
  assert.ok(
    /Page\.Protect permissions=\{pluginPermissions\.access\}/.test(app),
    'keep the plugin access gate'
  );
  assert.ok(
    /Page\.Protect permissions=\{pluginPermissions\.read\}/.test(app),
    'protect data routes with read'
  );
});

test('account write and send controls use separate manage and test-send permissions', () => {
  const home = source('admin/src/pages/HomePage.jsx');
  assert.ok(home.includes('useMagicMailRBAC'), 'read and action capabilities in the account page');
  assert.ok(home.includes('canManage'), 'manage controls are permission-gated');
  assert.ok(home.includes('canTestSend'), 'test-send controls use their own capability');
  assert.ok(
    home.includes("label={t('accounts.actions.test', 'Test account {name}'"),
    'test-send action remains accessible'
  );
});

test('the standalone settings route requires read permission in both navigation and page protection', () => {
  const adminIndex = source('admin/src/index.js');
  const settings = source('admin/src/pages/PluginSettings.jsx');
  assert.match(adminIndex, /id: 'plugin-settings'[\s\S]*?permissions: pluginPermissions\.read/);
  assert.match(
    settings,
    /<Page\.Protect permissions=\{pluginPermissions\.read\}>[\s\S]*?<PluginSettingsContent \/>/
  );
});

test('routing and template mutation controls require manage permission', () => {
  const routing = source('admin/src/pages/RoutingRules.jsx');
  const templates = source('admin/src/pages/EmailDesigner/TemplateList.jsx');
  assert.ok(
    routing.includes('useMagicMailRBAC') && routing.includes('canManage'),
    'routing mutations require manage'
  );
  assert.ok(
    templates.includes('useMagicMailRBAC') && templates.includes('canManage'),
    'template mutations require manage'
  );
  assert.ok(templates.includes('canTestSend'), 'template delivery uses test-send capability');
});

test('analytics deletion, template save and settings updates are hidden or disabled without manage permission', () => {
  const analytics = source('admin/src/pages/Analytics.jsx');
  const editor = source('admin/src/pages/EmailDesigner/EditorPage.jsx');
  const settings = source('admin/src/pages/PluginSettings.jsx');
  assert.ok(
    analytics.includes('useMagicMailRBAC') && analytics.includes('canManage'),
    'clear-all requires manage'
  );
  assert.ok(editor.includes('useMagicMailRBAC'), 'template editor checks role permissions');
  assert.ok(editor.includes('!canManage'), 'template saves require manage');
  assert.ok(
    settings.includes('useMagicMailRBAC') && settings.includes('canManage'),
    'settings updates require manage'
  );
});

test('template editor guards every server mutation and keeps read-only content non-editable', () => {
  const editor = source('admin/src/pages/EmailDesigner/EditorPage.jsx');
  assert.ok(editor.includes('useMagicMailRBAC'), 'the editor resolves the manage capability');

  for (const handler of [
    'handleRestoreVersion',
    'handleDeleteVersion',
    'handleDeleteAllVersions',
    'handleSave',
    'handleImportDesign',
  ]) {
    assert.match(
      editor,
      new RegExp(`const ${handler} = [\\s\\S]*?=> \\{\\s*if \\(!canManage\\) return;`),
      `${handler} must stop before any state or server mutation without manage permission`
    );
  }

  assert.match(
    editor,
    /disabled=\{saving \|\| !canManage\}/,
    'save is visibly disabled for read-only users'
  );
  assert.match(
    editor,
    /<Textarea[\s\S]*?disabled=\{!canManage\}/,
    'plain text is read-only without manage permission'
  );
  assert.match(
    editor,
    /\{canManage \? \([\s\S]*?<EmailEditorComponent/,
    'the visual editor is not mounted for read-only users'
  );
  assert.match(
    editor,
    /role="status"[\s\S]*?Editing this template requires/,
    'read-only users receive an accessible explanation'
  );
  const drawer = source('admin/src/pages/EmailDesigner/VersionHistoryDrawer.jsx');
  assert.match(
    drawer,
    /\{canManage && versions\.length > 0 && \([\s\S]*?onClick=\{onDeleteAll\}/,
    'bulk version deletion is hidden for read-only users'
  );
  assert.match(
    editor,
    /isOpen=\{canManage && confirmDeleteAll\}[\s\S]*?onConfirm=\{handleDeleteAllVersions\}/,
    'bulk version deletion is confirmed and stays gated'
  );
});

test('RBAC hook keeps read, manage and test-send independent across role grants', () => {
  const expectedPermissions = [
    { action: 'plugin::magic-mail.read', subject: null },
    { action: 'plugin::magic-mail.manage', subject: null },
    { action: 'plugin::magic-mail.test-send', subject: null },
  ];
  const cases = [
    ['no grants', {}, { canRead: false, canManage: false, canTestSend: false }],
    ['read only', { canRead: true }, { canRead: true, canManage: false, canTestSend: false }],
    ['manage only', { canManage: true }, { canRead: false, canManage: true, canTestSend: false }],
    [
      'test-send only',
      { canTestSend: true },
      { canRead: false, canManage: false, canTestSend: true },
    ],
    [
      'all grants',
      { canRead: true, canManage: true, canTestSend: true },
      {
        canRead: true,
        canManage: true,
        canTestSend: true,
      },
    ],
    [
      'non-boolean grants fail closed',
      { canRead: 1, canManage: 'true', canTestSend: true },
      {
        canRead: false,
        canManage: false,
        canTestSend: true,
      },
    ],
  ];

  for (const [role, grants, expected] of cases) {
    const { capabilities, requestedPermissions } = evaluateRBACHook(grants);
    assert.deepEqual(
      requestedPermissions,
      expectedPermissions,
      `${role}: request only route capabilities`
    );
    const { permissions, ...flags } = capabilities;
    assert.deepEqual(
      flags,
      {
        ...expected,
        canReadQueue: false,
        canManageQueue: false,
        isQueueLoading: false,
        isReadOnly: expected.canRead && !expected.canManage,
        isLoading: false,
        error: undefined,
      },
      role
    );
    assert.deepEqual(
      Object.keys(permissions).sort(),
      ['access', 'manage', 'queueManage', 'queueRead', 'read', 'testSend'],
      role
    );
  }
});

test('RBAC hook reads the outbox grants separately from read/manage', () => {
  const readOnly = evaluateRBACHook({ canRead: true }, undefined, { canRead: true });
  assert.deepEqual(readOnly.queuePermissions, [
    { action: 'plugin::magic-mail.queue.read', subject: null },
    { action: 'plugin::magic-mail.queue.manage', subject: null },
  ]);
  assert.equal(readOnly.capabilities.canReadQueue, true);
  assert.equal(readOnly.capabilities.canManageQueue, false);
  assert.equal(readOnly.capabilities.canManage, false);

  const queueOnly = evaluateRBACHook({}, undefined, { canRead: true, canManage: true });
  assert.equal(queueOnly.capabilities.canRead, false, 'queue.read does not grant read');
  assert.equal(queueOnly.capabilities.canManageQueue, true);

  const loading = evaluateRBACHook({}, { isLoading: true, error: undefined }, { canRead: true });
  assert.equal(loading.capabilities.canReadQueue, false, 'fails closed while loading');
});

test('RBAC hook fails closed while permissions load or when the permission request fails', () => {
  const allGrants = { canRead: true, canManage: true, canTestSend: true };

  const loading = evaluateRBACHook(allGrants, { isLoading: true, error: undefined }).capabilities;
  assert.equal(loading.isLoading, true);
  assert.equal(loading.canRead, false, 'no read controls before permissions resolve');
  assert.equal(loading.canManage, false, 'write controls never flash in while loading');
  assert.equal(loading.canTestSend, false);

  const failure = new Error('permissions unavailable');
  const failed = evaluateRBACHook(allGrants, { isLoading: false, error: failure }).capabilities;
  assert.equal(failed.error, failure, 'the error is exposed so views can show an error state');
  assert.equal(failed.canManage, false);
  assert.equal(failed.isReadOnly, false);
});

test('read, manage and test-send grants gate the matching visible controls', () => {
  const home = source('admin/src/pages/HomePage.jsx');
  const templates = source('admin/src/pages/EmailDesigner/TemplateList.jsx');
  const settings = source('admin/src/pages/PluginSettings.jsx');

  assert.ok(
    /\{canTestSend && \([\s\S]{0,300}?label=\{t\('accounts\.actions\.test', 'Test account \{name\}'/.test(
      home
    ),
    'account test-send is shown only with the test-send capability'
  );
  assert.ok(
    /\{canTestSend && testingAccount && \(/.test(home),
    'the account test-send dialog is mounted only with the test-send capability'
  );
  assert.ok(
    /const canExport = canRead;\s*const canImport = canManage;/.test(templates),
    'template export requires read while template import requires manage'
  );
  assert.ok(
    /\{canTestSend && \([\s\S]{0,300}?label=\{t\('templates\.actions\.testSend', 'Send test email'\)\}/.test(
      templates
    ),
    'template test-send is shown only with the test-send capability'
  );
  assert.ok(
    /<TemplateTestSendModal[\s\S]{0,120}?isOpen=\{canTestSend && showTestSendModal\}/.test(
      templates
    ),
    'the template test-send dialog closes when its capability is absent'
  );
  assert.ok(
    /\{canManage && \([\s\S]{0,200}?disabled=\{!hasChanges \|\| !canManage\b/.test(settings),
    'settings save is hidden and disabled without manage permission'
  );
});

test('analytics delete confirmation stays gated if manage permission is removed while open', () => {
  const analytics = source('admin/src/pages/Analytics.jsx');

  assert.ok(
    /const handleClearAll = async \(\) => \{\s*if \(!canManage\) return;/.test(analytics),
    'the destructive handler must re-check manage permission before making a request'
  );
  assert.ok(
    /<ConfirmDialog\s+isOpen=\{canManage && showClearDialog\}/.test(analytics),
    'an already-open confirmation closes when manage permission is absent'
  );
  assert.ok(
    /isOpen=\{canManage && showClearDialog\}[\s\S]{0,160}?onConfirm=\{handleClearAll\}/.test(
      analytics
    ),
    'the confirmation action is only reachable through the manage-gated dialog'
  );
  assert.ok(
    /\{canManage && hasAnyLogs && \(\s*<FilterActions>\s*<Button\s+variant="danger-light"/.test(
      analytics
    ),
    'the Clear All trigger is hidden without manage permission'
  );
});
