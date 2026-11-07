'use strict';

/**
 * Shared table layer (components/shared/table): it mirrors the Magic Link
 * table design, and every MagicMail list uses it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadAdminModule, contrastRatio, ROOT } = require('./helpers/load-admin-module');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const TABLE_DIR = 'admin/src/components/shared/table';
const utils = loadAdminModule(`${TABLE_DIR}/tableUtils.js`);
const tokens = loadAdminModule(`${TABLE_DIR}/tableTheme.js`);

const TABLE_PAGES = [
  'admin/src/pages/HomePage.jsx',
  'admin/src/pages/RoutingRules.jsx',
  'admin/src/pages/EmailDesigner/TemplateList.jsx',
  'admin/src/pages/Analytics.jsx',
];

const listSources = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'translations' ? [] : listSources(rel);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [rel] : [];
  });

test('every shared table file says it mirrors the Magic Link table design', () => {
  for (const file of [
    ...fs.readdirSync(path.join(ROOT, TABLE_DIR)).map((name) => `${TABLE_DIR}/${name}`),
    'admin/src/components/shared/SearchField.jsx',
  ]) {
    assert.match(read(file), /Mirrors the Magic Link table design; keep in sync/, file);
  }
});

test('page links keep first, last and the active neighbourhood with ellipses', () => {
  assert.deepEqual(utils.getPageItems(1, 3), [1, 2, 3]);
  assert.deepEqual(utils.getPageItems(1, 10), [1, 2, 3, 4, 5, 'dots-end', 10]);
  assert.deepEqual(utils.getPageItems(5, 10), [1, 'dots-start', 4, 5, 6, 'dots-end', 10]);
  assert.deepEqual(utils.getPageItems(10, 10), [1, 'dots-start', 6, 7, 8, 9, 10]);
  assert.deepEqual(utils.getPageItems(99, 10).at(-1), 10, 'an out-of-range page is clamped');
  assert.equal(utils.getPageCount(0, 10), 1);
  assert.equal(utils.getPageCount(101, 25), 5);
  assert.deepEqual(utils.paginate([1, 2, 3, 4, 5], 2, 2), [3, 4]);
  assert.deepEqual(utils.PAGE_SIZES, [10, 25, 50, 100]);
});

test('row actions keep Enter, Space and Tab; arrows still reach the DS grid', () => {
  const stopped = [];
  for (const key of ['Enter', ' ', 'Tab', 'ArrowDown', 'ArrowRight', 'Home']) {
    let isStopped = false;
    utils.keepNativeButtonKeys({ key, stopPropagation: () => (isStopped = true) });
    if (isStopped) stopped.push(key);
  }
  assert.deepEqual(stopped, ['Enter', ' ', 'Tab']);
});

test('only the shared layer styles the DS Table; every list uses it', () => {
  const styledTables = listSources('admin/src').filter((file) =>
    /styled\(Table\)/.test(read(file))
  );
  assert.deepEqual(styledTables, [`${TABLE_DIR}/TableLayout.jsx`]);

  for (const file of TABLE_PAGES) {
    const src = read(file);
    assert.match(src, /from '(?:\.\.\/)+components\/shared\/table'/, `${file}: shared table`);
    assert.match(src, /<DataTable\b/, `${file}: table card`);
    assert.match(src, /<StyledTable colCount=/, `${file}: shared StyledTable`);
    assert.doesNotMatch(src, /\bimport \{[^}]*\bTable\b[^}]*\} from '@strapi\/design-system'/);
    assert.doesNotMatch(src, /<Th className="actions-cell"|td\.actions-cell/, `${file}: sticky`);
  }
});

test('every body cell has a phone-card label and every row action a translated DS label', () => {
  for (const file of TABLE_PAGES) {
    const src = read(file);
    const cells = [...src.matchAll(/<Td\b[^>]*>/g)].map((match) => match[0]);
    assert.ok(cells.length > 0, file);
    for (const cell of cells) assert.match(cell, /data-label=/, `${file}: ${cell}`);
    for (const button of src.matchAll(/<IconButton\b[\s\S]*?>/g)) {
      assert.match(button[0], /label=\{/, `${file}: IconButton label`);
      assert.match(button[0], /variant="(?:ghost|danger-light)"/, `${file}: Magic Link variants`);
    }
  }
});

test('the table layer copies the Magic Link metrics', () => {
  const layout = read(`${TABLE_DIR}/TableLayout.jsx`);
  // Header band: neutral100, 16px cells, 11px semi-bold uppercase labels.
  assert.match(layout, /thead \{\s*background: \$\{color\('neutral100'\)\};/);
  assert.match(
    layout,
    /th \{\s*padding: \$\{space\(4\)\};[\s\S]*?font-size: \$\{fontSize\(0\)\};\s*font-weight: 600;\s*text-transform: uppercase;\s*letter-spacing: 0\.05em;/
  );
  // 16px radius card and the phone card layout below 768px.
  assert.match(layout, /border-radius: \$\{theme\.borderRadius\.xl\};/);
  assert.match(layout, /content: attr\(data-label\);/);
  assert.equal(tokens.breakpoints.mobile, '768px');
  assert.equal(tokens.tableTheme.borderRadius.xl, '16px');
  assert.equal(tokens.space(4)({}), '16px');
});

/** Blends a translucent dark-mode tint over the DS dark neutral0 surface. */
const blend = (value, base = '#212134') => {
  if (value.startsWith('#')) return value;
  const [r, g, b, a] = value.match(/[\d.]+/g).map(Number);
  const baseRgb = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  return `#${[r, g, b]
    .map((channel, i) => Math.round(channel * a + baseRgb[i] * (1 - a)))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
};

test('status badge tones keep text at 4.5:1 or more in light and dark mode', () => {
  for (const [scheme, colorScheme] of [
    ['light', 'light'],
    ['dark', 'dark'],
  ]) {
    const props = { theme: { colorScheme, colors: {} } };
    for (const [tone, set] of Object.entries(tokens.tint)) {
      const fg = set.fg(props);
      const bg = blend(set.bg(props));
      assert.ok(contrastRatio(fg, bg) >= 4.5, `${tone} ${scheme}: ${fg} on ${bg}`);
    }
  }
});

test('primary names and addresses truncate with a title like the Magic Link user cell', () => {
  const cases = [
    ['admin/src/pages/HomePage.jsx', ['account.name', 'account.fromEmail']],
    ['admin/src/pages/RoutingRules.jsx', ['rule.name', 'rule.accountName']],
    ['admin/src/pages/EmailDesigner/TemplateList.jsx', ['template.name']],
    ['admin/src/pages/Analytics.jsx', ['log.recipient', 'log.recipientName']],
  ];
  for (const [file, values] of cases) {
    const source = read(file);
    for (const value of values) {
      const escaped = value.replace('.', '\\.');
      assert.match(
        source,
        new RegExp(
          `<Typography[^>]*\\bellipsis\\b[^>]*title=\\{${escaped}[^}]*\\}[^>]*>\\s*\\{${escaped}\\}`
        ),
        `${file}: ${value} uses DS ellipsis with a title`
      );
    }
  }
  assert.doesNotMatch(read('admin/src/pages/HomePage.jsx'), /overflowWrap: 'anywhere'/);
});
