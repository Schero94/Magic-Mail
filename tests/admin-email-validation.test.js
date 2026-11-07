'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('required sender addresses must be valid bounded email addresses', () => {
  return import('../admin/src/utils/emailValidation.mjs').then(({ isValidEmailAddress }) => {
    assert.equal(isValidEmailAddress('noreply@example.com'), true);
    assert.equal(isValidEmailAddress('not-an-email'), false);
    assert.equal(isValidEmailAddress('sender @example.com'), false);
    assert.equal(isValidEmailAddress(`a@${'b'.repeat(250)}.com`), false);
  });
});

test('optional Reply-To accepts blank input but validates a supplied address', () => {
  return import('../admin/src/utils/emailValidation.mjs').then(
    ({ isOptionalEmailAddressValid }) => {
      assert.equal(isOptionalEmailAddressValid(''), true);
      assert.equal(isOptionalEmailAddressValid('   '), true);
      assert.equal(isOptionalEmailAddressValid('support@example.com'), true);
      assert.equal(isOptionalEmailAddressValid('invalid-reply-to'), false);
    }
  );
});
