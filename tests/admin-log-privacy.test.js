'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const files = [
  'admin/src/components/AddAccountModal.jsx',
  'admin/src/components/AccountWizard/useOAuthPopup.js',
  'admin/src/pages/Accounts/TestEmailModal.jsx',
  'admin/src/pages/Analytics.jsx',
  'admin/src/pages/EmailDesigner/EditorPage.jsx',
  'admin/src/pages/EmailDesigner/TemplateList.jsx',
  'admin/src/pages/HomePage.jsx',
  'admin/src/pages/PluginSettings.jsx',
  'admin/src/pages/RoutingRules.jsx',
  'admin/src/pages/Routing/RuleModal.jsx',
];

test('admin logs never print raw API responses, errors, account credentials or template data', () => {
  for (const file of files) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
    const loggingLines = source.split('\n').filter((line) => /console\.(?:log|error|warn|debug)\s*\(/.test(line));

    for (const line of loggingLines) {
      assert.ok(
        !/,\s*(?:err|error|response|data|account|template|token|settings)\b/i.test(line),
        `${file} logs a potentially sensitive runtime value`,
      );
    }

    if (file.endsWith('/Analytics.jsx')) {
      assert.ok(!/console\.log\s*\(/.test(source), 'analytics must not log full API responses');
    }
  }
});
