'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const editorSource = fs.readFileSync(
  path.join(root, 'admin/src/pages/EmailDesigner/EditorPage.jsx'),
  'utf8'
);
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('template editor back button uses a theme-aware icon color', () => {
  const backButtonStyles = editorSource.match(
    /const BackButton = styled\.button`([\s\S]*?)`;/u
  );

  assert.ok(backButtonStyles, 'EditorPage must define BackButton styles');
  assert.match(
    backButtonStyles[1],
    /color:\s*\$\{\(p\)\s*=>\s*p\.theme\.colors\.neutral800\}/u,
    'BackButton must use neutral800 so the icon is light in dark mode and dark in light mode'
  );
  assert.match(
    editorSource,
    /<BackButton\b[^>]*\baria-label="Back to email templates"/u,
    'BackButton must have an accessible name'
  );
});

test('README describes email designer features as fully included', () => {
  assert.doesNotMatch(
    readme,
    /\|\s*Feature\s*\|\s*FREE\s*\|\s*PREMIUM\s*\|\s*ADVANCED\s*\|/iu,
    'README must not contain the old paid Email Designer tier table'
  );
  assert.doesNotMatch(
    readme,
    /Premium SMTP|premium account/iu,
    'README examples must not imply that MagicMail accounts require payment'
  );
  assert.match(
    readme,
    /\|\s*Feature\s*\|\s*Included\s*\|/iu,
    'README must use one all-inclusive Email Designer feature table'
  );
  assert.match(
    readme,
    /\|\s*\*\*Unlimited Templates\*\*\s*\|\s*✅\s*\|/u,
    'README must state that templates are unlimited'
  );
});
