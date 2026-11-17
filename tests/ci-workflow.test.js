'use strict';

/**
 * Guards the CI triggers and matrix. The README badge reads the CI result of
 * pushes to main, and package.json promises Strapi ^5.57.0, Design System
 * ^2.2.4 and Node up to 26, so CI has to run on main and test those ranges.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/** @param {string} range - semver range such as ^5.57.0 @returns {string} its floor */
const floorOf = (range) => range.replace(/^[\^~>=\s]+/, '');

test('CI runs on pull requests, on pushes to main and on a schedule', () => {
  const triggers = ci.split(/^permissions:/m)[0];
  assert.match(triggers, /^\s+pull_request:/m);
  assert.match(triggers, /^\s+push:\s*\n\s+branches:\s*\[main\]/m);
  assert.match(triggers, /^\s+schedule:\s*\n\s+- cron: '[^']+'/m);
  assert.match(
    ci,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    'runs on main are never cancelled by the next push'
  );
});

test('the CI matrix covers every Node major that engines.node allows', () => {
  const matrix = ci.match(/node: \[([^\]]+)\]/);
  assert.ok(matrix, 'CI has a Node matrix');
  const majors = matrix[1].split(',').map((value) => Number(value.replace(/['\s]/g, '')));
  const engines = pkg.engines.node;
  const min = Number(engines.match(/>=\s*(\d+)/)[1]);
  const max = Number(engines.match(/<=\s*(\d+)/)[1]);
  for (let major = min; major <= max; major += 2) {
    assert.ok(majors.includes(major), `Node ${major} (engines ${engines}) is tested`);
  }
});

test('a CI job installs and tests the declared peer floor', () => {
  const job = ci.split(/^ {2}peer-floor:/m)[1]?.split(/^ {2}[\w-]+:\s*$/m)[0];
  assert.ok(job, 'ci.yml has a peer-floor job');
  const strapi = floorOf(pkg.peerDependencies['@strapi/strapi']);
  const users = floorOf(pkg.peerDependencies['@strapi/plugin-users-permissions']);
  const ds = floorOf(pkg.peerDependencies['@strapi/design-system']);
  const icons = floorOf(pkg.peerDependencies['@strapi/icons']);
  assert.ok(job.includes(`@strapi/strapi@${strapi}`), `installs @strapi/strapi@${strapi}`);
  assert.ok(job.includes(`@strapi/plugin-users-permissions@${users}`));
  assert.ok(job.includes(`@strapi/design-system@${ds}`), `installs @strapi/design-system@${ds}`);
  assert.ok(job.includes(`@strapi/icons@${icons}`));
  assert.match(job, /npm install --no-save --ignore-scripts/);
  for (const step of ['npm test', 'npm run build', 'npm run verify', 'npm run verify:runtime']) {
    assert.ok(job.includes(step), `peer-floor runs ${step}`);
  }
});
