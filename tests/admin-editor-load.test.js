'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorSource = readFileSync(
  path.join(__dirname, '../admin/src/pages/EmailDesigner/EditorPage.jsx'),
  'utf8',
);

test('visual editor load failure has an accessible plain-text fallback', () => {
  assert.ok(editorSource.includes('designerLoadError'), 'track visual editor load failure');
  assert.ok(editorSource.includes('role="alert"'), 'announce the load failure accessibly');
  assert.ok(editorSource.includes('Switch to Plain Text'), 'offer the working text editor');
  assert.ok(editorSource.includes("setActiveTab('text')"), 'the fallback action selects plain text');
});

test('visual editor load timeout is cancelled when the editor becomes ready or the tab changes', () => {
  assert.ok(editorSource.includes('setTimeout('), 'bound the indefinite loading state');
  assert.ok(editorSource.includes('clearTimeout('), 'clean up the pending timeout');
  assert.ok(editorSource.includes('setDesignerLoadError(false)'), 'clear failure after a successful load');
});

test('exceptions thrown by the third-party editor are contained by the plain-text fallback', () => {
  assert.match(editorSource, /class VisualEditorErrorBoundary extends React\.Component/);
  assert.match(editorSource, /componentDidCatch[\s\S]*?this\.props\.onError\(\)/);
  assert.match(editorSource, /<VisualEditorErrorBoundary[\s\S]*?onError=\{\(\) => setDesignerLoadError\(true\)\}/);
});
