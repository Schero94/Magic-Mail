'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('active admin tab follows the current URL after browser back and deep links', () => {
  const source = fs.readFileSync(path.join(__dirname, '../admin/src/pages/App.jsx'), 'utf8');
  assert.doesNotMatch(source, /useState\(getActiveTab\(\)\)/, 'tab must not be pinned to its initial route');
  assert.match(source, /value=\{getActiveTab\(\)\}/, 'tabs must derive their value from the current route');
});
