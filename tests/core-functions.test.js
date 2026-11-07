'use strict';

// DOC-15: behavioural tests for core functions that had none.
// - routing: every match type, rule priority order, rule fallback, primary
//   fallback, exclusion during failover, case-insensitive account names;
// - templates: export -> import round trip (create and update), version
//   history and restore.
// Synthetic in-memory stores only; no database and no provider calls.

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

// ── Routing ──────────────────────────────────────────────────────────────────

function routingStrapi({ accounts, rules }) {
  const sortDesc = (rows, field) => [...rows].sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
  return {
    log: quietLog,
    config: { get: (_key, fallback) => fallback },
    documents: (uid) => ({
      findMany: async ({ filters = {} } = {}) => {
        if (uid.endsWith('routing-rule'))
          return sortDesc(
            rules.filter((rule) => rule.isActive !== false),
            'priority'
          );
        const excluded = filters.documentId?.$notIn || [];
        return sortDesc(
          accounts.filter((a) => a.isActive !== false && !excluded.includes(a.documentId)),
          'priority'
        );
      },
    }),
  };
}

const router = (fixtures) =>
  require('../server/src/services/email-router')({ strapi: routingStrapi(fixtures) });

test('ruleMatches evaluates every match type', () => {
  const r = router({ accounts: [], rules: [] });
  const email = {
    to: ['Jane <jane@vip.example.test>', 'bob@other.example.test'],
    subject: 'Your Password Reset link',
    templateName: 'Welcome',
    templateReferenceId: 42,
    customField: 'tenant-7',
  };
  const cases = [
    [{ matchType: 'emailType', matchValue: 'marketing' }, 'marketing', true],
    [{ matchType: 'emailType', matchValue: 'marketing' }, 'transactional', false],
    [{ matchType: 'recipient', matchValue: '@vip.example.test' }, 'transactional', true],
    [{ matchType: 'recipient', matchValue: '@VIP.example.test' }, 'transactional', true],
    [{ matchType: 'recipient', matchValue: 'jane@vip.example.test' }, 'transactional', true],
    [{ matchType: 'recipient', matchValue: 'nobody@vip.example.test' }, 'transactional', false],
    [{ matchType: 'recipient', matchValue: 'other.example' }, 'transactional', true],
    [{ matchType: 'subject', matchValue: 'password reset' }, 'transactional', true],
    [{ matchType: 'subject', matchValue: 'invoice' }, 'transactional', false],
    [{ matchType: 'template', matchValue: 'Welcome' }, 'transactional', true],
    [{ matchType: 'template', matchValue: '42' }, 'transactional', true],
    [{ matchType: 'template', matchValue: 'welcome' }, 'transactional', false],
    [{ matchType: 'custom', matchValue: 'tenant-7' }, 'transactional', true],
    [{ matchType: 'custom', matchValue: 'tenant-8' }, 'transactional', false],
    [{ matchType: 'custom', matchValue: '   ' }, 'transactional', false],
    [{ matchType: 'unknown', matchValue: 'x' }, 'transactional', false],
  ];
  for (const [rule, type, expected] of cases) {
    assert.equal(
      r.ruleMatches(rule, type, email),
      expected,
      `${rule.matchType}=${rule.matchValue} (${type})`
    );
  }
  assert.equal(
    r.ruleMatches({ matchType: 'custom', matchValue: 'x' }, 'transactional', {}),
    false,
    'no customField'
  );
});

test('selectAccount uses the highest-priority matching rule, then its fallback, then the primary account', async () => {
  const accounts = [
    { documentId: 'a-primary', name: 'Primary', priority: 1, isPrimary: true },
    { documentId: 'a-high', name: 'High Volume', priority: 9 },
    { documentId: 'a-marketing', name: 'Marketing', priority: 5 },
    { documentId: 'a-vip', name: 'VIP', priority: 3 },
  ];
  const rules = [
    {
      name: 'low catch-all',
      matchType: 'emailType',
      matchValue: 'marketing',
      accountName: 'Primary',
      priority: 1,
    },
    {
      name: 'marketing',
      matchType: 'emailType',
      matchValue: 'marketing',
      accountName: 'marketing',
      priority: 50,
    },
    {
      name: 'vip',
      matchType: 'recipient',
      matchValue: '@vip.example.test',
      accountName: 'Missing',
      fallbackAccountName: 'VIP',
      priority: 100,
    },
    {
      name: 'inactive',
      matchType: 'emailType',
      matchValue: 'marketing',
      accountName: 'High Volume',
      priority: 1000,
      isActive: false,
    },
  ];
  const r = router({ accounts, rules });

  assert.equal(
    (await r.selectAccount('marketing', 'normal', [], { to: 'a@example.test' })).name,
    'Marketing',
    'higher rule wins, name match is case-insensitive'
  );
  assert.equal(
    (await r.selectAccount('marketing', 'normal', [], { to: 'a@vip.example.test' })).name,
    'VIP',
    'rule fallback when the target account is missing'
  );
  assert.equal(
    (await r.selectAccount('marketing', 'normal', ['a-marketing'], { to: 'a@example.test' })).name,
    'Primary',
    'excluded rule account falls through to the next matching rule'
  );
  assert.equal(
    (await r.selectAccount('transactional', 'normal', [], { to: 'a@example.test' })).name,
    'Primary',
    'no rule: primary account'
  );
  assert.equal(
    (await r.selectAccount('transactional', 'normal', ['a-primary'], { to: 'a@example.test' }))
      .name,
    'High Volume',
    'primary excluded: highest account priority'
  );
  assert.equal(
    await r.selectAccount(
      'transactional',
      'normal',
      accounts.map((a) => a.documentId),
      {}
    ),
    null,
    'nothing left'
  );
});

test('inactive accounts are never selected, even when a rule names them', async () => {
  const r = router({
    accounts: [
      { documentId: 'a1', name: 'Off', priority: 10, isActive: false },
      { documentId: 'a2', name: 'On', priority: 1 },
    ],
    rules: [
      { matchType: 'emailType', matchValue: 'transactional', accountName: 'Off', priority: 5 },
    ],
  });
  assert.equal((await r.selectAccount('transactional', 'normal', [], {})).name, 'On');
});

// ── Templates ────────────────────────────────────────────────────────────────

function templateStore() {
  const templates = [];
  const versions = [];
  let nextId = 1;
  const withVersions = (template) => ({
    ...template,
    versions: versions.filter((v) => v.template === template.documentId).map((v) => ({ ...v })),
  });
  const matches = (row, filters) =>
    Object.entries(filters || {}).every(([key, value]) => row[key] === value);
  const strapi = {
    log: quietLog,
    documents: (uid) => {
      const isVersion = uid.endsWith('email-template-version');
      const table = isVersion ? versions : templates;
      return {
        findMany: async ({ filters = {}, limit } = {}) => {
          let rows;
          if (isVersion) rows = versions.filter((v) => v.template === filters.template?.documentId);
          else rows = templates.filter((t) => matches(t, filters)).map(withVersions);
          return typeof limit === 'number' ? rows.slice(0, limit) : rows;
        },
        findOne: async ({ documentId }) => {
          const row = table.find((r) => r.documentId === documentId);
          if (!row) return null;
          return isVersion ? { ...row, template: { documentId: row.template } } : withVersions(row);
        },
        create: async ({ data }) => {
          const id = nextId++;
          const row = { id, documentId: `${isVersion ? 'ver' : 'tpl'}${id}`, ...data };
          table.push(row);
          return { ...row };
        },
        update: async ({ documentId, data }) => {
          const row = table.find((r) => r.documentId === documentId);
          Object.assign(row, data);
          return { ...row };
        },
        delete: async () => {},
      };
    },
    db: { query: () => ({ findOne: async () => null, findMany: async () => [] }) },
  };
  return { strapi, templates, versions };
}

test('templates survive an export -> import round trip and a re-import updates instead of duplicating', async () => {
  const source = templateStore();
  const designerA = require('../server/src/services/email-designer')({ strapi: source.strapi });
  await designerA.create({
    templateReferenceId: 101,
    name: 'Welcome',
    subject: 'Hi {{user.firstName}}',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    category: 'transactional',
    tags: ['onboarding'],
    design: { body: { rows: [] } },
  });
  await designerA.create({
    templateReferenceId: 102,
    name: 'Promo',
    subject: 'Deal',
    bodyHtml: '<p>50%</p>',
    category: 'marketing',
    isActive: false,
  });

  const exported = await designerA.exportTemplates();
  assert.equal(exported.length, 2);

  const target = templateStore();
  const designerB = require('../server/src/services/email-designer')({ strapi: target.strapi });
  const firstImport = await designerB.importTemplates(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(firstImport.map((r) => r.action).sort(), ['created', 'created']);
  const welcome = target.templates.find((t) => t.templateReferenceId === 101);
  assert.equal(welcome.subject, 'Hi {{user.firstName}}');
  assert.deepEqual(welcome.tags, ['onboarding']);
  assert.deepEqual(welcome.design, { body: { rows: [] } });
  assert.equal(target.templates.find((t) => t.templateReferenceId === 102).isActive, false);

  const changed = exported.map((t) =>
    t.templateReferenceId === 101 ? { ...t, subject: 'Welcome back' } : t
  );
  const secondImport = await designerB.importTemplates(changed);
  assert.deepEqual(secondImport.map((r) => r.action).sort(), ['updated', 'updated']);
  assert.equal(target.templates.length, 2, 'no duplicates');
  assert.equal(target.templates.find((t) => t.templateReferenceId === 101).subject, 'Welcome back');

  const failed = await designerB.importTemplates([
    { name: 'Bad', templateReferenceId: 'not-a-number' },
  ]);
  assert.equal(failed[0].success, false, 'invalid entries are reported, not thrown');
});

test('version history lists saved states newest first and restore saves the old content as a new version', async () => {
  const store = templateStore();
  const designer = require('../server/src/services/email-designer')({ strapi: store.strapi });
  const created = await designer.create({
    templateReferenceId: 7,
    name: 'Receipt',
    subject: 'v1 subject',
    bodyHtml: '<p>v1</p>',
  });
  await designer.update(created.documentId, { subject: 'v2 subject', bodyHtml: '<p>v2</p>' });

  const history = await designer.getVersions(created.documentId);
  assert.deepEqual(
    history.map((v) => v.versionNumber),
    [2, 1]
  );
  const v1 = history.find((v) => v.versionNumber === 1);

  const restored = await designer.restoreVersion(created.documentId, v1.documentId);
  assert.equal(restored.subject, 'v1 subject');
  assert.equal(restored.bodyHtml, '<p>v1</p>');
  const after = await designer.getVersions(created.documentId);
  assert.deepEqual(
    after.map((v) => v.versionNumber),
    [3, 2, 1],
    'restore adds a version'
  );
  assert.equal(after[0].bodyHtml, '<p>v1</p>');

  // A version of another template cannot be restored into this one.
  const other = await designer.create({
    templateReferenceId: 8,
    name: 'Other',
    subject: 's',
    bodyHtml: '<p>o</p>',
  });
  const otherVersion = (await designer.getVersions(other.documentId))[0];
  await assert.rejects(
    designer.restoreVersion(created.documentId, otherVersion.documentId),
    /does not belong/
  );
});

test('selectAccount evaluates rules in the admin list order (priority desc, then oldest first)', async () => {
  let ruleSort;
  const strapi = {
    log: quietLog,
    config: { get: (_key, fallback) => fallback },
    documents: (uid) => ({
      findMany: async (args = {}) => {
        if (uid.endsWith('routing-rule')) {
          ruleSort = args.sort;
          return [];
        }
        return [{ documentId: 'a-primary', name: 'Primary', priority: 1, isPrimary: true }];
      },
    }),
  };
  const r = require('../server/src/services/email-router')({ strapi });
  await r.selectAccount('transactional', 'normal', [], { to: 'a@example.test' });
  assert.deepEqual(ruleSort, [{ priority: 'desc' }, { createdAt: 'asc' }]);
});

test('equal-priority rules: the router picks the rule listed first by GET /routing-rules', async () => {
  const { routingRuleEvaluationSort } = require('../server/src/utils/routing-order');
  // Stored in an order that differs from the evaluation order on purpose.
  const rules = [
    {
      name: 'Newer',
      isActive: true,
      priority: 5,
      createdAt: '2026-02-01T00:00:00.000Z',
      matchType: 'emailType',
      matchValue: 'transactional',
      accountName: 'Newer account',
    },
    {
      name: 'Low',
      isActive: true,
      priority: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      matchType: 'emailType',
      matchValue: 'transactional',
      accountName: 'Low account',
    },
    {
      name: 'Older',
      isActive: true,
      priority: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      matchType: 'emailType',
      matchValue: 'transactional',
      accountName: 'Older account',
    },
  ];
  /** Applies a Document Service sort array like the database would. */
  const applySort = (rows, sort = []) =>
    [...rows].sort((a, b) => {
      for (const entry of sort) {
        const [[field, dir]] = Object.entries(entry);
        if (a[field] === b[field]) continue;
        const cmp = a[field] < b[field] ? -1 : 1;
        return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  const accounts = ['Newer account', 'Low account', 'Older account', 'Primary'].map((name) => ({
    documentId: name,
    name,
    priority: 1,
    isActive: true,
    isPrimary: name === 'Primary',
  }));
  const strapi = {
    log: quietLog,
    config: { get: (_key, fallback) => fallback },
    documents: (uid) => ({
      findMany: async (args = {}) =>
        uid.endsWith('routing-rule') ? applySort(rules, args.sort) : accounts,
    }),
  };

  const listed = applySort(rules, routingRuleEvaluationSort()).map((rule) => rule.name);
  assert.deepEqual(listed, ['Older', 'Newer', 'Low'], 'admin list order');

  const r = require('../server/src/services/email-router')({ strapi });
  const selected = await r.selectAccount('transactional', 'normal', [], { to: 'a@example.test' });
  assert.equal(selected.name, 'Older account', 'first listed matching rule wins');
});

test('GET /routing-rules and the router share one evaluation order', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of [
    'server/src/controllers/routing-rules.js',
    'server/src/services/email-router.js',
  ]) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(source, /sort: routingRuleEvaluationSort\(\)/, file);
  }
});
