'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdminModule, ROOT } = require('./helpers/load-admin-module');
const {
  findCssVarTokens,
  findTinyRemFontSizes,
  findEmoji,
} = require('./helpers/admin-style-guards');

const FILES = [
  'admin/src/pages/RoutingRules.jsx',
  'admin/src/pages/Routing/RuleModal.jsx',
  'admin/src/pages/Routing/styles.js',
  'admin/src/pages/Routing/ruleUtils.js',
];
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sources = Object.fromEntries(FILES.map((file) => [file, read(file)]));
const page = sources['admin/src/pages/RoutingRules.jsx'];
const modal = sources['admin/src/pages/Routing/RuleModal.jsx'];

const utils = loadAdminModule('admin/src/pages/Routing/ruleUtils.js');
const fakeT = (key, defaultMessage, values) =>
  String(defaultMessage).replace(/\{(\w+)\}/g, (_, name) =>
    values && name in values ? values[name] : `{${name}}`
  );

const ACCOUNTS = [
  { name: 'Primary SMTP', provider: 'smtp', isActive: true },
  { name: 'Marketing', provider: 'sendgrid', isActive: true },
  { name: 'Old Mailgun', provider: 'mailgun', isActive: false },
];

// ---------------------------------------------------------------- style and hygiene guards

for (const file of FILES) {
  test(`${file}: no undefined CSS variables, tiny rem fonts or emoji`, () => {
    const src = sources[file];
    assert.deepEqual(findCssVarTokens(src), []);
    assert.deepEqual(findTinyRemFontSizes(src), []);
    assert.deepEqual(findEmoji(src), []);
    assert.doesNotMatch(src, /useAuthRefresh/);
    assert.doesNotMatch(
      src,
      /(?:^|[^.\w])confirm\(/m,
      'window.confirm is replaced by ConfirmDialog'
    );
    assert.doesNotMatch(src, /navigator\.clipboard/);
    assert.doesNotMatch(src, /'de-DE'|'en-US'|toLocale(?:Date)?String\(/);
    assert.doesNotMatch(src, /backgroundColor=/, 'DS Badge variants instead of backgroundColor');
    assert.doesNotMatch(src, /\bas="span"/);
  });
}

test('routing view translates its strings and labels every control', () => {
  for (const src of [page, modal]) {
    assert.match(src, /useMagicMailIntl/);
    assert.ok((src.match(/\bt\('/g) ?? []).length > 20, 'strings go through t()');
  }
  assert.match(page, /<SearchField\s+label=\{t\('routing\.search\.label'/);
  assert.match(page, /aria-label=\{t\('routing\.filters\.status'/);
  assert.match(page, /aria-label=\{t\('routing\.filters\.matchType'/);
  assert.match(page, /<IconButton\s+label=\{t\('routing\.actions\.edit'/);
  assert.match(page, /<IconButton\s+label=\{t\('routing\.actions\.delete'/);
  assert.match(page, /<Title tag="h1">/);
  assert.match(page, /<SectionHeading>/);
  assert.match(modal, /<Modal\.Title>/, 'the rule dialog has an accessible title');
});

test('routing view: RBAC, delete confirmation, unsaved-changes guard and error handling', () => {
  assert.match(page, /useMagicMailRBAC\(\)/);
  assert.match(page, /isLoading: permissionsLoading/);
  assert.match(page, /permissionsError/);
  assert.match(page, /isOpen=\{canManage && pendingDelete !== null\}/);
  assert.match(page, /const deleteRule = async \(rule\) => \{\s*if \(!canManage\) return;/);
  assert.match(
    page,
    /\{canManage && \(?\s*<Th\b/,
    'the Actions column is hidden for read-only users'
  );
  assert.match(page, /Promise\.allSettled/, 'a failing accounts request keeps rules visible');
  assert.match(page, /setLoadError\(true\)/);
  assert.match(page, /routing\.error\.retry/);
  assert.match(page, /sortRulesByEvaluationOrder/);
  assert.match(modal, /useDiscardGuard\(/);
  assert.match(modal, /<UnsavedChangesDialog guard=\{discard\} \/>/);
  assert.match(modal, /if \(!open\) requestClose\(\)/);
  assert.match(modal, /if \(!canManage \|\| !canSubmit \|\| saving\) return;/);
  assert.match(modal, /max=\{PRIORITY_MAX\}/);
  assert.doesNotMatch(modal, /max=\{10\}/);
});

test('routing list uses the shared table layer and keeps reduced-motion aware page styles', () => {
  const styles = sources['admin/src/pages/Routing/styles.js'];
  // One table (Magic Link design) that becomes labelled cards below 768px,
  // instead of a scrolling table plus a second mobile-only list.
  assert.match(page, /<DataTable aria-label=\{t\('routing\.table\.label'/);
  assert.match(page, /<Td className="cell-wrap" data-label=\{columnLabels\.matchValue\}>/);
  assert.match(page, /\{canManage && <Td data-label="">\{renderActions\(rule\)\}<\/Td>\}/);
  assert.doesNotMatch(page, /RuleCardList|TableScroll/);
  assert.doesNotMatch(
    styles,
    /StyledTable|FilterBar|RuleCardList|TableScroll/,
    'old styles removed'
  );
  assert.doesNotMatch(styles, /max-width: 1200px/, 'stat cards align with the page edges');
  assert.match(styles, /motionSafe\(css`\s*animation: \$\{shimmer\}/);
});

// ---------------------------------------------------------------- behaviour: ordering and filters

test('rules are listed in evaluation order (priority desc, stable for ties)', () => {
  const rules = [
    { name: 'a', priority: 1 },
    { name: 'b', priority: 50 },
    { name: 'c', priority: 3 },
    { name: 'd', priority: 50 },
    { name: 'e' },
  ];
  assert.deepEqual(
    utils.sortRulesByEvaluationOrder(rules).map((r) => r.name),
    ['b', 'd', 'c', 'a', 'e']
  );
  assert.deepEqual(
    rules.map((r) => r.name),
    ['a', 'b', 'c', 'd', 'e'],
    'input is not mutated'
  );
  assert.deepEqual(utils.sortRulesByEvaluationOrder(undefined), []);
});

test('filterRules searches name, description, value and both accounts and applies filters', () => {
  const rules = [
    {
      name: 'VIP',
      description: null,
      matchValue: '@vip.example',
      accountName: 'Marketing',
      isActive: true,
      matchType: 'recipient',
    },
    {
      name: 'Invoices',
      matchValue: 'Invoice',
      accountName: 'Primary SMTP',
      fallbackAccountName: 'Backup',
      isActive: false,
      matchType: 'subject',
    },
  ];
  assert.deepEqual(
    utils.filterRules(rules, { search: '  BACKUP ' }).map((r) => r.name),
    ['Invoices']
  );
  assert.deepEqual(
    utils.filterRules(rules, { status: 'active' }).map((r) => r.name),
    ['VIP']
  );
  assert.deepEqual(
    utils.filterRules(rules, { status: 'inactive' }).map((r) => r.name),
    ['Invoices']
  );
  assert.deepEqual(
    utils.filterRules(rules, { matchType: 'recipient' }).map((r) => r.name),
    ['VIP']
  );
  assert.equal(utils.filterRules(rules, {}).length, 2);
  // null values must not throw
  assert.equal(utils.filterRules([{ name: null, matchValue: null }], { search: 'x' }).length, 0);
});

test('match-type labels are translated and unknown types still show a label', () => {
  assert.equal(utils.getMatchTypeLabel('emailType', fakeT), 'Email Type');
  assert.equal(utils.getMatchTypeLabel('custom', fakeT), 'Custom Field');
  assert.equal(utils.getMatchTypeLabel('legacyType', fakeT), 'legacyType');
});

// ---------------------------------------------------------------- behaviour: UI-23 / UI-M04

test('account options always include the stored account, flagged as inactive or missing (UI-23)', () => {
  const inactive = utils.buildAccountOptions(ACCOUNTS, 'Old Mailgun');
  assert.deepEqual(inactive[0], {
    value: 'Old Mailgun',
    name: 'Old Mailgun',
    provider: 'mailgun',
    status: 'inactive',
  });
  assert.deepEqual(
    inactive.slice(1).map((o) => o.value),
    ['Primary SMTP', 'Marketing']
  );

  const missing = utils.buildAccountOptions(ACCOUNTS, 'Renamed Account');
  assert.equal(missing[0].status, 'missing');
  assert.equal(missing[0].value, 'Renamed Account');

  const active = utils.buildAccountOptions(ACCOUNTS, 'Marketing');
  assert.deepEqual(
    active.map((o) => o.value),
    ['Primary SMTP', 'Marketing'],
    'no duplicate for an active account'
  );

  const fallback = utils.buildAccountOptions(ACCOUNTS, '', { exclude: 'Primary SMTP' });
  assert.deepEqual(
    fallback.map((o) => o.value),
    ['Marketing']
  );
});

test('rules pointing at a missing or inactive account are flagged (UI-M04)', () => {
  assert.equal(utils.getAccountStatus('Marketing', ACCOUNTS), 'active');
  assert.equal(utils.getAccountStatus('Old Mailgun', ACCOUNTS), 'inactive');
  assert.equal(utils.getAccountStatus('Gone', ACCOUNTS), 'missing');
  assert.equal(utils.getAccountStatus('', ACCOUNTS), 'none');
  assert.equal(utils.hasBrokenAccountReference({ accountName: 'Marketing' }, ACCOUNTS), false);
  assert.equal(utils.hasBrokenAccountReference({ accountName: 'Gone' }, ACCOUNTS), true);
  assert.equal(
    utils.hasBrokenAccountReference(
      { accountName: 'Marketing', fallbackAccountName: 'Old Mailgun' },
      ACCOUNTS
    ),
    true
  );
});

test('the rule form cannot submit a stale, inactive or duplicate account', () => {
  const base = {
    ...utils.getInitialFormData(null),
    name: 'VIP',
    matchValue: '@vip.example',
    accountName: 'Marketing',
  };
  assert.deepEqual(utils.validateRuleForm(base, ACCOUNTS), {});
  assert.equal(
    utils.validateRuleForm({ ...base, accountName: '' }, ACCOUNTS).accountName,
    'required'
  );
  assert.equal(
    utils.validateRuleForm({ ...base, accountName: 'Old Mailgun' }, ACCOUNTS).accountName,
    'inactive'
  );
  assert.equal(
    utils.validateRuleForm({ ...base, accountName: 'Gone' }, ACCOUNTS).accountName,
    'missing'
  );
  assert.equal(
    utils.validateRuleForm({ ...base, fallbackAccountName: 'Marketing' }, ACCOUNTS)
      .fallbackAccountName,
    'sameAsTarget'
  );
  assert.equal(
    utils.validateRuleForm({ ...base, fallbackAccountName: 'Gone' }, ACCOUNTS).fallbackAccountName,
    'missing'
  );
  assert.equal(utils.validateRuleForm({ ...base, name: '   ' }, ACCOUNTS).name, 'required');
  assert.equal(
    utils.validateRuleForm({ ...base, matchValue: '' }, ACCOUNTS).matchValue,
    'required'
  );
  assert.equal(
    utils.validateRuleForm({ ...base, matchType: 'whatever' }, ACCOUNTS).matchType,
    'required'
  );
  // Nothing passes when the account list is empty (e.g. failed to load).
  assert.equal(utils.validateRuleForm(base, []).accountName, 'missing');
});

// ---------------------------------------------------------------- behaviour: DOC-M03 priority range

test('priority uses the server range 1..1,000,000 and a cleared value blocks submit (DOC-M03, UI-23)', () => {
  assert.equal(utils.PRIORITY_MIN, 1);
  assert.equal(utils.PRIORITY_MAX, 1_000_000);
  assert.equal(utils.parsePriority(1), 1);
  assert.equal(utils.parsePriority(250), 250);
  assert.equal(utils.parsePriority(1_000_000), 1_000_000);
  for (const bad of [undefined, null, '', 0, -1, 1.5, 1_000_001, 'abc', Number.NaN]) {
    assert.equal(utils.parsePriority(bad), null, `rejects ${String(bad)}`);
  }
  const form = {
    ...utils.getInitialFormData(null),
    name: 'n',
    matchValue: 'v',
    accountName: 'Marketing',
  };
  assert.equal(
    utils.validateRuleForm({ ...form, priority: undefined }, ACCOUNTS).priority,
    'range'
  );
  assert.equal(utils.validateRuleForm({ ...form, priority: 500 }, ACCOUNTS).priority, undefined);
});

test('editing keeps stored values and the payload matches the strict server schema', () => {
  const rule = {
    id: 3,
    documentId: 'doc3',
    name: 'High',
    description: '',
    isActive: false,
    priority: 75,
    matchType: 'subject',
    matchValue: 'Invoice',
    accountName: 'Marketing',
    fallbackAccountName: null,
    createdAt: '2026-01-01',
  };
  const form = utils.getInitialFormData(rule);
  assert.equal(form.priority, 75, 'priorities above 10 survive the edit dialog');
  assert.equal(form.isActive, false);
  assert.equal(form.fallbackAccountName, '');
  assert.ok(utils.isSameFormData(form, utils.getInitialFormData(rule)));
  assert.ok(!utils.isSameFormData({ ...form, priority: 76 }, form));

  const payload = utils.toRulePayload({ ...form, name: '  High  ', matchValue: ' Invoice ' });
  assert.deepEqual(Object.keys(payload).sort(), [
    'accountName',
    'description',
    'fallbackAccountName',
    'isActive',
    'matchType',
    'matchValue',
    'name',
    'priority',
  ]);
  assert.equal(payload.name, 'High');
  assert.equal(payload.matchValue, 'Invoice');
  assert.equal(payload.fallbackAccountName, null);
  assert.equal(payload.description, null);
  assert.equal(payload.priority, 75);

  const { validate } = require('../server/src/validation');
  assert.doesNotThrow(() => validate('routingRules.update', payload));
  assert.doesNotThrow(() =>
    validate('routingRules.create', utils.toRulePayload({ ...form, priority: 1_000_000 }))
  );
});

test('new rules default to priority 1 and active', () => {
  const form = utils.getInitialFormData(null);
  assert.equal(form.priority, utils.DEFAULT_PRIORITY);
  assert.equal(form.isActive, true);
  assert.equal(form.matchType, 'emailType');
});

// ---------------------------------------------------------------- browser acceptance fixes

test('rule form hints are passed to Field.Root (DS 2 Field.Hint ignores children)', () => {
  assert.doesNotMatch(modal, /<Field\.Hint>/);
  assert.equal((modal.match(/<Field\.Hint \/>/g) ?? []).length, 6);
  for (const key of [
    'routing.form.name.hint',
    'routing.form.matchValue.hint',
    'routing.form.account.hint',
    'routing.form.fallback.hint',
    'routing.form.priority.hint',
  ]) {
    assert.match(
      modal,
      new RegExp(`hint=\\{(?:[\\s\\S](?!</Field\\.Root>))*?${key.replace(/\./g, '\\.')}`)
    );
  }
  assert.match(modal, /hint=\{getMatchTypeHelp\(\)\}/);
});

test('dialogs return focus to their opener and row actions keep native keys', () => {
  assert.match(modal, /useReturnFocus\(true, getReturnFocusFallback\)/);
  assert.match(modal, /<Modal\.Content size="L" onCloseAutoFocus=\{returnFocus\}>/);
  assert.match(page, /getReturnFocusFallback=\{getFocusFallback\}/);
  assert.match(page, /data-mm-focus-fallback/);
  assert.match(
    page,
    /<Flex gap=\{1\} justifyContent="flex-end" onKeyDown=\{keepNativeButtonKeys\}>/
  );
  assert.match(page, /keepNativeButtonKeys,\s*\} from '\.\.\/components\/shared\/table'/);
});

test('account names match case-insensitively, like the router and the server check', () => {
  assert.equal(utils.isSameAccountName(' marketing ', 'Marketing'), true);
  assert.equal(utils.isSameAccountName('Marketing', 'Marketing 2'), false);
  assert.equal(utils.getAccountStatus('marketing', ACCOUNTS), 'active');
  assert.equal(utils.getAccountStatus('OLD MAILGUN', ACCOUNTS), 'inactive');
  assert.deepEqual(
    utils.buildAccountOptions(ACCOUNTS, '', { exclude: 'primary smtp' }).map((o) => o.value),
    ['Marketing']
  );
  const base = {
    ...utils.getInitialFormData(null),
    name: 'VIP',
    matchValue: '@vip.example',
    accountName: 'marketing',
  };
  assert.deepEqual(utils.validateRuleForm(base, ACCOUNTS), {});
  assert.equal(
    utils.validateRuleForm({ ...base, fallbackAccountName: 'Marketing' }, ACCOUNTS)
      .fallbackAccountName,
    'sameAsTarget'
  );
});
