'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const affectedFiles = [
  'admin/src/pages/PluginSettings.jsx',
  'admin/src/components/AddAccountModal.jsx',
  'admin/src/pages/RoutingRules.jsx',
  'admin/src/pages/EmailDesigner/EditorPage.jsx',
].map((relativePath) => ({
  relativePath,
  source: fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'),
}));

const switchOpeningPattern = /<Switch\b/g;
const switchBlockPattern = /<Switch\b[\s\S]*?\/>/g;

function importsFromDesignSystem(source, componentName) {
  const designSystemImports = source.matchAll(
    /import\s+([^;]+?)\s+from\s+['"]@strapi\/design-system['"]\s*;?/g
  );

  return Array.from(designSystemImports, ([, importClause]) => importClause)
    .some((importClause) => new RegExp(`\\b${componentName}\\b`).test(importClause));
}

function describeControl(block, index) {
  const ariaLabel = block.match(/\baria-label\s*=\s*(?:"([^"]+)"|'([^']+)')/);
  if (ariaLabel) return `control "${ariaLabel[1] || ariaLabel[2]}"`;

  const checkedValue = block.match(/\bchecked\s*=\s*\{([^}\n]+)\}/);
  if (checkedValue) return `control checked by "${checkedValue[1].trim()}"`;

  return `Switch #${index + 1}`;
}

test('affected admin files stop importing and rendering Toggle', () => {
  for (const { relativePath, source } of affectedFiles) {
    assert.equal(
      importsFromDesignSystem(source, 'Toggle'),
      false,
      `${relativePath} must not import Toggle from @strapi/design-system`
    );
    assert.doesNotMatch(
      source,
      /<Toggle\b/,
      `${relativePath} must not render a Toggle control`
    );
  }
});

test('each affected admin file imports Switch from the Strapi design system', () => {
  for (const { relativePath, source } of affectedFiles) {
    assert.equal(
      importsFromDesignSystem(source, 'Switch'),
      true,
      `${relativePath} must import Switch from @strapi/design-system`
    );
  }
});

test('affected admin files render exactly nine Switch controls', () => {
  const switchCount = affectedFiles.reduce(
    (count, { source }) => count + (source.match(switchOpeningPattern) || []).length,
    0
  );

  assert.equal(
    switchCount,
    9,
    `affected admin files must render exactly 9 Switch controls; found ${switchCount}`
  );
});

test('every Switch control is compact and accessible', () => {
  const switchBlocks = affectedFiles.flatMap(({ relativePath, source }) =>
    Array.from(source.matchAll(switchBlockPattern), (match, index) => ({
      relativePath,
      block: match[0],
      control: describeControl(match[0], index),
    }))
  );

  assert.equal(
    switchBlocks.length,
    9,
    `expected 9 self-closing Switch blocks for property checks; found ${switchBlocks.length}`
  );

  for (const { relativePath, block, control } of switchBlocks) {
    assert.match(
      block,
      /\baria-label\s*=/,
      `${relativePath} ${control} must include aria-label`
    );
    assert.match(
      block,
      /\bonLabel\s*=/,
      `${relativePath} ${control} must include onLabel`
    );
    assert.match(
      block,
      /\boffLabel\s*=/,
      `${relativePath} ${control} must include offLabel`
    );
    assert.match(
      block,
      /\bvisibleLabels\s*=\s*\{\s*false\s*\}/,
      `${relativePath} ${control} must include visibleLabels={false}`
    );
  }
});
