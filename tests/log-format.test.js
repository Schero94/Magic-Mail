'use strict';

/**
 * Strapi's default logger (@strapi/logger 5.x prettyPrint: winston printf
 * without format.splat()) prints only the first argument of a log call.
 * Extra arguments such as an error name or code are silently dropped, so
 * every `strapi.log.*` call in the server code must pass one message string.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Linter } = require('eslint');

const SERVER_ROOT = path.join(__dirname, '..', 'server', 'src');

/** @param {string} dir @returns {string[]} */
const listJs = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listJs(path.join(dir, entry.name))
        : entry.name.endsWith('.js')
          ? [path.join(dir, entry.name)]
          : []
    );

const SELECTOR = "CallExpression[callee.object.property.name='log'][arguments.length>1]";

const config = [
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: SELECTOR, message: 'Pass one message string to strapi.log.*' },
      ],
    },
  },
];

test('the selector catches a multi-argument log call', () => {
  const linter = new Linter();
  const messages = linter.verify(
    "strapi.log.warn('[magic-mail] failed:', error.name);\nstrapi.log.info(`ok ${x}`);",
    config
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].line, 1);
});

test('server log calls pass a single message (Strapi drops extra arguments)', () => {
  const linter = new Linter();
  const offenders = [];
  for (const file of listJs(SERVER_ROOT)) {
    const messages = linter.verify(fs.readFileSync(file, 'utf8'), config, file);
    for (const message of messages) {
      offenders.push(`${path.relative(SERVER_ROOT, file)}:${message.line} ${message.message}`);
    }
  }
  assert.deepEqual(offenders, []);
});
