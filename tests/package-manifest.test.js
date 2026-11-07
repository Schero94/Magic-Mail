'use strict';

/**
 * Supply-chain and packaging guards (SUP-03/04/08/10/11, STR-06/07/08/14/15).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pkg = JSON.parse(read('package.json'));

const listSources = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(rel);
    return /\.(jsx?|mjs|cjs)$/.test(entry.name) ? [rel] : [];
  });
const sourceText = [...listSources('admin/src'), ...listSources('server/src')].map(read).join('\n');

test('every runtime dependency is imported by the plugin source', () => {
  for (const name of Object.keys(pkg.dependencies)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const imported = new RegExp(
      `(?:from\\s+|require\\(\\s*|import\\(\\s*)['"]${escaped}(?:/[^'"]*)?['"]`
    ).test(sourceText);
    assert.ok(imported, `${name} is listed in dependencies but never imported`);
  }
  for (const removed of ['form-data', 'striptags', 'yup', 'decode-html']) {
    assert.equal(pkg.dependencies[removed], undefined, `${removed} must not ship to hosts`);
  }
  assert.ok(!JSON.parse(read('.externals.json')).externals.includes('yup'));
});

test('engines and build target require Node 22.12 or later', () => {
  assert.match(pkg.engines.node, /^>=22\.12\.0\b/);
  const build = read('scripts/build-server-bundle.mjs');
  assert.match(build, /target:\s*\['node22'\]/);
  assert.doesNotMatch(build, /node20/);
});

test('peer dependencies match the host APIs the plugin uses', () => {
  const peers = pkg.peerDependencies;
  assert.equal(
    peers['@strapi/plugin-users-permissions'],
    '^5.57.0',
    'email-log.user targets plugin::users-permissions.user'
  );
  assert.equal(
    pkg.peerDependenciesMeta?.['@strapi/plugin-users-permissions']?.optional,
    undefined,
    'the relation is unconditional, so the peer is required'
  );
  assert.equal(peers['@strapi/strapi'], '^5.57.0');
  assert.equal(peers['@strapi/utils'], '^5.57.0');
  assert.equal(peers['react-router-dom'], '^6.30.3', 'no stricter than the Strapi 5 admin peer');
  assert.match(
    sourceText,
    /from 'react-intl'/,
    'react-intl stays a peer only while it is imported'
  );
});

test('overrides do not pin known-vulnerable versions', () => {
  const overrides = JSON.stringify(pkg.overrides);
  assert.doesNotMatch(overrides, /"vite":"6\.4\.4"/);
  assert.doesNotMatch(overrides, /"undici":"7\.30\.0"/);
  assert.equal(
    pkg.overrides.undici,
    undefined,
    'a global undici override forces 7.x onto ^6 consumers'
  );
  assert.equal(pkg.overrides['@rushstack/node-core-library']['.'], undefined);
});

test('watch scripts produce the same server bundle as the build', () => {
  assert.equal(pkg.scripts.watch, 'node scripts/watch.mjs');
  assert.equal(pkg.scripts['watch:link'], 'node scripts/watch.mjs --link');
  const watch = read('scripts/watch.mjs');
  assert.match(watch, /BUNDLE_MARKER/);
  assert.match(read('scripts/verify-server-bundle.mjs'), /BUNDLE_MARKER/);
});

test('legacy root entries point at the published dist output', () => {
  assert.match(read('strapi-admin.js'), /require\('\.\/dist\/admin\/index\.js'\)/);
  assert.match(read('strapi-server.js'), /require\('\.\/dist\/server\/index\.js'\)/);
  assert.ok(!pkg.files.includes('pics'), 'README screenshots are served from GitHub, not shipped');
  assert.doesNotMatch(read('README.md'), /\]\(pics\//, 'README images use absolute URLs');
});

test('workflows pin actions by SHA, use least privilege and never run install scripts with write tokens', () => {
  const dir = path.join(ROOT, '.github/workflows');
  for (const file of fs.readdirSync(dir)) {
    const yaml = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const [, ref] of yaml.matchAll(/uses:\s*[\w./-]+@(\S+)/g)) {
      assert.match(ref, /^[0-9a-f]{40}$/, `${file}: action ref ${ref} is not a commit SHA`);
    }
    assert.doesNotMatch(yaml, /--legacy-peer-deps/, `${file}: peer conflicts must not be hidden`);
    for (const [line] of yaml.matchAll(/^\s*run:\s*npm ci\b.*$/gm)) {
      assert.match(line, /--ignore-scripts/, `${file}: ${line.trim()}`);
    }
    const topLevel = yaml.split(/^jobs:/m)[0].replace(/^\s*#.*$/gm, '');
    assert.doesNotMatch(
      topLevel,
      /contents:\s*write|id-token:\s*write|pages:\s*write/,
      `${file}: write scopes belong on jobs`
    );
  }
  const release = read('.github/workflows/release.yml');
  assert.match(release, /needs:\s*verify/);
  assert.match(release, /NPM_CONFIG_PROVENANCE:\s*'true'/);
  // Trusted Publishing is not configured on npmjs.com yet; the token fallback must stay wired.
  assert.match(release, /NPM_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  assert.match(release, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  assert.match(read('.github/workflows/ci.yml'), /pull_request/);
  assert.equal(pkg.publishConfig.provenance, true);
});

test('npm pack ships only dist, the entry shims and the package docs', () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const [{ files }] = JSON.parse(output);
  const allowed =
    /^(dist\/(admin|server)\/[^/]+|strapi-(admin|server)\.js|README\.md|LICENSE|CHANGELOG\.md|package\.json)$/;
  const unexpected = files.map((file) => file.path).filter((file) => !allowed.test(file));
  assert.deepEqual(unexpected, []);
  const unpacked = files.reduce((sum, file) => sum + file.size, 0);
  assert.ok(unpacked < 5 * 1024 * 1024, `unpacked size ${unpacked} bytes stays under 5 MB`);
  if (fs.existsSync(path.join(ROOT, 'dist/server/index.js'))) {
    assert.ok(files.some((file) => file.path === 'dist/server/index.js'));
  }
});
