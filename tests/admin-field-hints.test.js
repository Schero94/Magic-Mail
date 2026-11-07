const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/*
 * @strapi/design-system 2.x: Field.Hint takes no props or children. It renders
 * the `hint` prop of the surrounding Field.Root (and hides it while the field
 * has an error). Text passed as Field.Hint children is silently dropped.
 */

const ADMIN_SRC = path.join(__dirname, '../admin/src');

const listJsx = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsx(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });

const sources = listJsx(ADMIN_SRC).map((file) => ({
  file: path.relative(ADMIN_SRC, file),
  source: fs.readFileSync(file, 'utf8'),
}));

/** Opening tag of the nearest Field.Root before `index`. */
const enclosingRootTag = (source, index) => {
  const start = source.lastIndexOf('<Field.Root', index);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < index; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return null;
};

test('admin never passes hint text as Field.Hint children', () => {
  const offenders = sources
    .filter(({ source }) => /<Field\.Hint\s*>/.test(source))
    .map(({ file }) => file);
  assert.deepEqual(offenders, [], 'use <Field.Root hint={...}> with <Field.Hint />');
});

test('every Field.Hint sits in a Field.Root that sets the hint prop', () => {
  const missing = [];
  for (const { file, source } of sources) {
    for (const match of source.matchAll(/<Field\.Hint\s*\/>/g)) {
      const rootTag = enclosingRootTag(source, match.index);
      if (!rootTag || !/\shint=/.test(rootTag)) {
        const line = source.slice(0, match.index).split('\n').length;
        missing.push(`${file}:${line}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('account wizard renders its field hints (at least the 14 original ones) through Field.Root', () => {
  const wizard = ['CredentialsStep.jsx', 'DetailsStep.jsx', 'SettingsStep.jsx'].map((name) =>
    fs.readFileSync(path.join(ADMIN_SRC, 'components/AccountWizard', name), 'utf8')
  );
  const hintProps = wizard.reduce(
    (sum, source) => sum + (source.match(/<Field\.Root\s[^>]*?\bhint=/g) || []).length,
    0
  );
  assert.ok(hintProps >= 14, `expected at least 14 Field.Root hint props, found ${hintProps}`);
});
