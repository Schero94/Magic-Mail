'use strict';

/**
 * Behavioural tests for templates (core users-permissions templates,
 * versioning, list filters), plugin settings and routing-rule integrity.
 * Synthetic data only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const root = path.join(__dirname, '..');

/** users-permissions plugin store stub. */
function coreStrapi({ stored = null, installed = true } = {}) {
  const box = { value: stored, sets: 0 };
  const strapi = {
    log: quietLog,
    plugin: (name) => (name === 'users-permissions' && installed ? {} : null),
    store: async () => ({
      get: async () => box.value,
      set: async ({ value }) => { box.value = value; box.sets += 1; },
    }),
  };
  return { strapi, box };
}

// ── SEC-11 / FUN-13 / STR-02 / STR-M04 ───────────────────────────────────────

test('core templates round-trip <%= KEY %> as {{ KEY }} and save only allowlisted interpolations', async () => {
  const { strapi, box } = coreStrapi({
    stored: {
      reset_password: {
        options: { from: { email: 'no-reply@example.test' }, object: 'Reset', message: '<p><%= URL %>?code=<%= TOKEN %></p>' },
      },
    },
  });
  const designer = require('../server/src/services/email-designer')({ strapi });

  const loaded = await designer.getCoreTemplate('reset-password');
  assert.equal(loaded.message, '<p>{{ URL }}?code={{ TOKEN }}</p>');

  await designer.updateCoreTemplate('reset-password', {
    subject: 'Hi {{USER.username}}',
    message: '<a href="{{ URL }}?code={{TOKEN}}">Reset</a> {{= SERVER_URL }} {{{ ADMIN_URL }}}',
  });
  const saved = box.value.reset_password.options;
  assert.equal(saved.object, 'Hi <%= USER.username %>');
  assert.equal(saved.message, '<a href="<%= URL %>?code=<%= TOKEN %>">Reset</a> <%= SERVER_URL %> <%= ADMIN_URL %>');
  assert.deepEqual(saved.from, { email: 'no-reply@example.test' }, 'other options are kept');
  assert.doesNotMatch(saved.message, /<%(?!=)/);
});

test('core templates reject evaluate blocks, ${} and unknown placeholders without writing the store', async () => {
  const { strapi, box } = coreStrapi({ stored: {} });
  const designer = require('../server/src/services/email-designer')({ strapi });

  const cases = [
    { subject: 'x', message: '<% process.exit() %>' },
    { subject: 'x', message: '${process.env.SECRET}' },
    { subject: 'x', message: '{{ USER.password }}' },
    { subject: '{{ constructor }}', message: 'ok' },
    { subject: 'x', message: '<%= USER.resetPasswordToken %>' },
  ];
  for (const data of cases) {
    await assert.rejects(designer.updateCoreTemplate('reset-password', data), (err) => err.name === 'ValidationError');
  }
  assert.equal(box.sets, 0);
  await assert.rejects(designer.updateCoreTemplate('bogus', { subject: 'x', message: 'y' }), (err) => err.name === 'ValidationError');
});

test('core templates handle an empty store and a missing users-permissions plugin', async () => {
  const empty = coreStrapi({ stored: null });
  const designer = require('../server/src/services/email-designer')({ strapi: empty.strapi });
  const loaded = await designer.getCoreTemplate('email-confirmation');
  assert.equal(loaded.message, '');
  await designer.updateCoreTemplate('email-confirmation', { subject: 'Confirm', message: '{{ URL }}?confirmation={{ CODE }}' });
  assert.equal(empty.box.value.email_confirmation.options.message, '<%= URL %>?confirmation=<%= CODE %>');

  const missing = coreStrapi({ installed: false });
  const without = require('../server/src/services/email-designer')({ strapi: missing.strapi });
  await assert.rejects(without.getCoreTemplate('reset-password'), (err) => err.name === 'NotFoundError');
  await assert.rejects(without.updateCoreTemplate('reset-password', { subject: 'a', message: 'b' }), (err) => err.name === 'NotFoundError');
});

test('SEC-M01: core template routes also require the users-permissions email-template permissions', () => {
  const routes = require('../server/src/routes/admin').routes.filter((route) => route.path === '/designer/core/:coreEmailType');
  const actions = Object.fromEntries(routes.map((route) => [
    route.method,
    route.config.policies.find((policy) => policy.name === 'admin::hasPermissions').config.actions,
  ]));
  assert.deepEqual(actions.GET, ['plugin::magic-mail.read', 'plugin::users-permissions.email-templates.read']);
  assert.deepEqual(actions.PUT, ['plugin::magic-mail.manage', 'plugin::users-permissions.email-templates.update']);
});

// ── FUN-23 / STR-09 / SEC-16: versioning, numeric lookups, list filters ─────

/** In-memory template + version store. */
function templateStrapi() {
  const templates = [];
  const versions = [];
  const dbCalls = [];
  const docs = (uid) => {
    const isVersion = uid.endsWith('email-template-version');
    const table = isVersion ? versions : templates;
    return {
      findMany: async ({ filters = {} } = {}) => {
        if (isVersion) return versions.filter((v) => v.template === filters.template?.documentId);
        return templates.filter((t) => Object.entries(filters).every(([key, value]) => t[key] === value));
      },
      findOne: async ({ documentId }) => table.find((row) => row.documentId === documentId) || null,
      create: async ({ data }) => { const row = { id: table.length + 1, documentId: `${isVersion ? 'v' : 't'}${table.length + 1}`, ...data }; table.push(row); return { ...row }; },
      update: async ({ documentId, data }) => { const row = table.find((r) => r.documentId === documentId); Object.assign(row, data); return { ...row }; },
      delete: async () => {},
    };
  };
  const strapi = {
    log: quietLog,
    documents: docs,
    db: { query: (uid) => ({ findOne: async (args) => { dbCalls.push({ uid, args }); return null; } }) },
  };
  return { strapi, templates, versions, dbCalls };
}

test('FUN-23: v1 is the created content, each content save adds exactly one version', async () => {
  const { strapi, versions } = templateStrapi();
  const designer = require('../server/src/services/email-designer')({ strapi });

  const created = await designer.create({ templateReferenceId: 5, name: 'Welcome', subject: 'Hi', bodyHtml: '<p>v1</p>' });
  assert.equal(versions.length, 1);
  assert.equal(versions[0].bodyHtml, '<p>v1</p>');

  await designer.update(created.documentId, { bodyHtml: '<p>v2</p>' });
  assert.deepEqual(versions.map((v) => [v.versionNumber, v.bodyHtml]), [[1, '<p>v1</p>'], [2, '<p>v2</p>']]);

  // Toggling isActive does not create an identical snapshot.
  await designer.update(created.documentId, { isActive: false });
  assert.equal(versions.length, 2);

  // Concurrent saves get distinct version numbers.
  await Promise.all([
    designer.update(created.documentId, { bodyHtml: '<p>a</p>' }),
    designer.update(created.documentId, { bodyHtml: '<p>b</p>' }),
  ]);
  const numbers = versions.map((v) => v.versionNumber);
  assert.equal(new Set(numbers).size, numbers.length);
});

test('FUN-23: export keeps isActive; STR-09 numeric lookups use the query engine; SEC-16 list filters are allowlisted', async () => {
  const { strapi, templates, dbCalls } = templateStrapi();
  const designer = require('../server/src/services/email-designer')({ strapi });
  templates.push({ documentId: 't9', templateReferenceId: 9, name: 'Off', isActive: false, category: 'marketing' });

  const [exported] = await designer.exportTemplates();
  assert.equal(exported.isActive, false);
  assert.equal(designer.normalizeImportData(exported).isActive, false);

  assert.equal(await designer.findById(12345), null);
  assert.deepEqual(dbCalls[0], { uid: 'plugin::magic-mail.email-template', args: { where: { id: 12345 }, populate: { versions: true } } });
  await designer.findVersionById('77');
  assert.equal(dbCalls[1].uid, 'plugin::magic-mail.email-template-version');
  assert.equal(fs.readFileSync(path.join(root, 'server/src/services/email-designer.js'), 'utf8').includes('entityService'), false);

  const list = await designer.findAll({ category: 'marketing', isActive: 'false', createdBy: { password: { $startsWith: 'a' } } });
  assert.equal(list.length, 1);
  let seenFilters;
  strapi.documents = () => ({ findMany: async ({ filters }) => { seenFilters = filters; return []; } });
  await designer.findAll({ name: { $containsi: 'x' }, category: 'nope', isActive: true, $or: [{}] });
  assert.deepEqual(seenFilters, { isActive: true });
});

// ── FUN-27: settings singleton ───────────────────────────────────────────────

test('FUN-27: concurrent first reads create one settings row and duplicates are removed', async () => {
  const rows = [];
  let creates = 0;
  const deleted = [];
  const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
  const strapi = {
    log: quietLog,
    documents: () => ({
      findFirst: async () => { await tick(); return rows.slice().sort((a, b) => a.id - b.id)[0] || null; },
      findMany: async () => rows.slice().sort((a, b) => a.id - b.id),
      create: async ({ data }) => { await tick(); creates += 1; const row = { id: rows.length + 1, documentId: `s${rows.length + 1}`, ...data }; rows.push(row); return row; },
      update: async ({ documentId, data }) => { const row = rows.find((r) => r.documentId === documentId); Object.assign(row, data); return { ...row }; },
      delete: async ({ documentId }) => { deleted.push(documentId); rows.splice(rows.findIndex((r) => r.documentId === documentId), 1); },
    }),
  };
  const settings = require('../server/src/services/plugin-settings')({ strapi });
  const results = await Promise.all(Array.from({ length: 10 }, () => settings.getSettings()));
  assert.equal(creates, 1);
  assert.ok(results.every((row) => row.documentId === 's1'));

  // Pre-existing duplicates (3.x race) are cleaned up; the oldest row wins.
  rows.push({ id: 7, documentId: 's7', enableLinkTracking: false });
  const fresh = require('../server/src/services/plugin-settings')({ strapi });
  const current = await fresh.getSettings();
  assert.equal(current.documentId, 's1');
  assert.deepEqual(deleted, ['s7']);

  // Updates invalidate the cache.
  await fresh.updateSettings({ enableOpenTracking: false });
  assert.equal((await fresh.getSettings()).enableOpenTracking, false);
});

// ── FUN-24 / DOC-M03: routing rules ─────────────────────────────────────────

test('FUN-24: routing rules are listed in evaluation order and must reference existing accounts', async () => {
  let sort;
  const accounts = [{ name: 'Main' }];
  global.strapi = {
    log: quietLog,
    documents: (uid) => ({
      findMany: async (args) => {
        if (uid.endsWith('routing-rule')) { sort = args.sort; return []; }
        return accounts.filter((a) => a.name.toLowerCase() === String(args.filters.name.$eqi).toLowerCase());
      },
      create: async ({ data }) => ({ documentId: 'r1', ...data }),
      findOne: async () => ({ documentId: 'r1' }),
      update: async ({ data }) => ({ documentId: 'r1', ...data }),
    }),
  };
  try {
    const controller = require('../server/src/controllers/routing-rules');
    const listCtx = {};
    await controller.getAll(listCtx);
    assert.deepEqual(sort, [{ priority: 'desc' }, { createdAt: 'asc' }]);

    const ok = { request: { body: { name: 'R', matchType: 'emailType', matchValue: 'marketing', accountName: 'main' } } };
    await controller.create(ok);
    assert.equal(ok.body.data.accountName, 'main');

    const bad = { request: { body: { name: 'R', matchType: 'emailType', matchValue: 'x', accountName: 'Main', fallbackAccountName: 'Gone' } } };
    await assert.rejects(controller.create(bad), (err) => err.name === 'ValidationError' && Boolean(err.details.fallbackAccountName));
    const badUpdate = { params: { ruleId: 'r1' }, request: { body: { accountName: 'Nope' } } };
    await assert.rejects(controller.update(badUpdate), (err) => err.name === 'ValidationError');
  } finally {
    delete global.strapi;
  }
});

// ── FUN-28 / SUP-M03: dead code ──────────────────────────────────────────────

test('FUN-28/SUP-M03: debug controller, unused services and helpers are gone', () => {
  assert.equal(fs.existsSync(path.join(root, 'server/src/controllers/test.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'server/src/services/service.js')), false);
  const settings = require('../server/src/services/plugin-settings')({ strapi: { log: quietLog } });
  for (const name of ['isLinkTrackingEnabled', 'isOpenTrackingEnabled', 'getTrackingBaseUrl']) {
    assert.equal(name in settings, false, name);
  }
  const manager = require('../server/src/services/account-manager')({ strapi: { log: quietLog } });
  assert.equal('getAccountWithDecryptedConfig' in manager, false);
  assert.equal('resetCounters' in manager, false);
  const schema = require('../server/src/content-types/email-account/schema.json');
  assert.equal(schema.attributes.provider.enum.includes('ses'), false);
});
