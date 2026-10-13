const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const settingsSource = fs.readFileSync(
  path.join(__dirname, '../admin/src/pages/PluginSettings.jsx'),
  'utf8'
);

test('Magic-Mail settings keep section color props out of the DOM', () => {
  assert.match(settingsSource, /props\.\$bgColor/);
  assert.doesNotMatch(settingsSource, /SectionIcon bgColor=/);
  assert.match(settingsSource, /SectionIcon \$bgColor=/);
});
