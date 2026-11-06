'use strict';

/**
 * Every translation id the admin code can request must exist in all five
 * locale files, and the English default written next to t() must match en.json
 * so the fallback text and the shipped translation never drift apart.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_SRC = path.join(ROOT, 'admin/src');
const LOCALES = ['en', 'de', 'fr', 'es', 'pt'];
const NAMESPACES = ['accounts', 'accountModal', 'analytics', 'editor', 'routing', 'settings', 'templates', 'common', 'plugin'];

const locales = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(ADMIN_SRC, 'translations', `${locale}.json`), 'utf8')),
  ])
);

const listSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'translations' ? [] : listSources(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });

/** Removes block and line comments so documentation examples are not counted. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const sources = listSources(ADMIN_SRC).map((file) => ({
  file: path.relative(ROOT, file),
  code: stripComments(fs.readFileSync(file, 'utf8')),
}));

const STRING = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60((?:[^\x60\\$]|\\.)*)\x60`;
const unescape = (value) => value.replace(/\\(.)/g, '$1');

/** Collects t('key', 'default'), getTranslation('key') and id: 'magic-mail.key'. */
const collectCalls = () => {
  const calls = [];
  const callPattern = new RegExp(String.raw`\b(t|getTranslation)\(\s*(?:${STRING})(?:\s*,\s*(?:${STRING}))?`, 'g');
  for (const { file, code } of sources) {
    for (const match of code.matchAll(callPattern)) {
      const key = match[2] ?? match[3] ?? match[4];
      const fallback = match[5] ?? match[6] ?? match[7];
      calls.push({ file, kind: match[1], key: unescape(key), fallback: fallback === undefined ? undefined : unescape(fallback) });
    }
    for (const match of code.matchAll(/\bid:\s*['"]magic-mail\.([^'"]+)['"]/g)) {
      calls.push({ file, kind: 'id', key: match[1] });
    }
  }
  return calls;
};

test('every statically referenced translation id exists in all locales', () => {
  const calls = collectCalls();
  assert.ok(calls.length > 300, `expected the admin views to be translated (found ${calls.length} calls)`);
  const missing = [];
  for (const { file, key } of calls) {
    for (const locale of LOCALES) {
      if (!Object.hasOwn(locales[locale], key)) missing.push(`${locale}: ${key} (${file})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('key-map string literals (for dynamic t() calls) resolve in all locales', () => {
  const literal = new RegExp(String.raw`['"\x60]((?:${NAMESPACES.join('|')})\.[A-Za-z0-9_.]+)['"\x60]`, 'g');
  const missing = [];
  for (const { file, code } of sources) {
    for (const match of code.matchAll(literal)) {
      const key = match[1];
      if (key.endsWith('.')) continue; // template prefix such as `routing.matchType.${x}`
      for (const locale of LOCALES) {
        if (!Object.hasOwn(locales[locale], key)) missing.push(`${locale}: ${key} (${file})`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('template-literal key prefixes only expand to existing keys', () => {
  const prefixPattern = /\bt\(\s*`([A-Za-z]+\.[A-Za-z0-9_.]*\.)\$\{/g;
  for (const { file, code } of sources) {
    for (const match of code.matchAll(prefixPattern)) {
      const prefix = match[1];
      const keys = Object.keys(locales.en).filter((key) => key.startsWith(prefix));
      assert.ok(keys.length > 0, `${file}: no keys exist for dynamic prefix ${prefix}`);
    }
  }
});

test('English defaults written in code match en.json', () => {
  const drift = collectCalls()
    .filter(({ kind, fallback, key }) => kind === 't' && fallback !== undefined && Object.hasOwn(locales.en, key))
    .filter(({ key, fallback }) => locales.en[key] !== fallback)
    .map(({ file, key, fallback }) => `${key} (${file}): code "${fallback}" vs en "${locales.en[key]}"`);
  assert.deepEqual(drift, []);
});

test('German copy uses the formal address', () => {
  const informal = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/i;
  const offenders = Object.entries(locales.de)
    .filter(([, value]) => informal.test(value))
    .map(([key, value]) => `${key}: ${value}`);
  assert.deepEqual(offenders, []);
});
