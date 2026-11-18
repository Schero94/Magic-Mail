'use strict';

// LIVE_PROVIDERS selects the Brevo and Amazon SES live suites too, and the
// SendGrid/Mailgun suites accept those names instead of failing the run.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLiveConfig, providerNotSelected } = require('./helpers/live-env');

const withEnv = (value, fn) => {
  const previous = process.env.LIVE_PROVIDERS;
  if (value === undefined) delete process.env.LIVE_PROVIDERS;
  else process.env.LIVE_PROVIDERS = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.LIVE_PROVIDERS;
    else process.env.LIVE_PROVIDERS = previous;
  }
};

test('Brevo and SES run unless LIVE_PROVIDERS names other providers only', () => {
  withEnv(undefined, () => assert.equal(providerNotSelected('brevo', {}), null));
  withEnv('sendgrid', () => assert.match(providerNotSelected('ses', {}), /ses not selected/));
  withEnv(' Brevo , ses ', () => {
    assert.equal(providerNotSelected('brevo', {}), null);
    assert.equal(providerNotSelected('ses', {}), null);
  });
  withEnv(undefined, () =>
    assert.match(providerNotSelected('brevo', { LIVE_PROVIDERS: 'mailgun' }), /not selected/)
  );
});

test('the SendGrid/Mailgun suites skip, not fail, when only Brevo or SES is selected', () => {
  const required = { sendgrid: ['SENDGRID_API_KEY'], mailgun: ['MAILGUN_API_KEY'] };
  withEnv('brevo,ses', () => {
    const config = loadLiveConfig(required);
    assert.equal(config.selectionError, null);
    assert.deepEqual(config.selected, []);
    assert.match(config.skipReason('sendgrid'), /sendgrid not selected/);
  });
  withEnv('postmark', () => {
    assert.match(loadLiveConfig(required).selectionError, /unknown provider\(s\) postmark/);
  });
});
