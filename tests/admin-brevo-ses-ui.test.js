'use strict';

/**
 * Account wizard state for Brevo and Amazon SES, the provider-template
 * helpers for language versions, and style guards for the new admin files.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { loadAdminModule, ROOT } = require('./helpers/load-admin-module');
const {
  findCssVarTokens,
  findTinyRemFontSizes,
  findEmoji,
} = require('./helpers/admin-style-guards');

const wizard = loadAdminModule('admin/src/components/AccountWizard/wizardState.js');
const templateUtils = loadAdminModule(
  'admin/src/pages/EmailDesigner/providerTemplates/providerTemplateUtils.js'
);
const hints = loadAdminModule('admin/src/utils/providerHints.js');

const NEW_FILES = [
  'admin/src/components/AccountWizard/ApiProviderFields.jsx',
  'admin/src/components/AccountWizard/fieldParts.jsx',
  'admin/src/pages/EmailDesigner/providerTemplates/LanguageVersions.jsx',
];

test('a Brevo account needs only an API key; the webhook token is never sent', () => {
  const form = { ...wizard.createEmptyForm(), name: 'Brevo', fromEmail: 'no-reply@example.test' };
  assert.equal(wizard.canProceedStep(3, { provider: 'brevo', form }), false);
  form.apiKey = ' xkeysib-synthetic ';
  assert.equal(wizard.canProceedStep(3, { provider: 'brevo', form }), true);
  assert.deepEqual(wizard.buildConfig('brevo', form), { apiKey: 'xkeysib-synthetic' });
  assert.equal(wizard.buildBounceMonitor('brevo', form), undefined);
  assert.equal(
    wizard.getWebhookUrl('brevo', 'abc123', { origin: 'https://cms.example.test' }),
    'https://cms.example.test/api/magic-mail/webhooks/brevo/abc123'
  );
});

test('Amazon SES: access keys or environment credentials, validated like the server', () => {
  const form = {
    ...wizard.createEmptyForm(),
    sesRegion: 'eu-west-1',
    sesAccessKeyId: 'AKIAEXAMPLE000000001',
    sesSecretAccessKey: 'synthetic/secret/0000000000000000',
  };
  assert.equal(wizard.canProceedStep(3, { provider: 'ses', form }), true);
  assert.deepEqual(wizard.buildConfig('ses', form), {
    region: 'eu-west-1',
    credentialSource: 'keys',
    accessKeyId: 'AKIAEXAMPLE000000001',
    secretAccessKey: 'synthetic/secret/0000000000000000',
    configurationSetName: '',
    snsTopicArn: '',
  });

  const env = {
    ...form,
    sesCredentialSource: 'environment',
    sesAccessKeyId: '',
    sesSecretAccessKey: '',
  };
  assert.equal(wizard.canProceedStep(3, { provider: 'ses', form: env }), true);
  assert.deepEqual(wizard.buildConfig('ses', env), {
    region: 'eu-west-1',
    credentialSource: 'environment',
    configurationSetName: '',
    snsTopicArn: '',
  });

  const errors = (patch) => wizard.validateCredentials('ses', { ...form, ...patch });
  assert.deepEqual(errors({}), {});
  assert.equal(errors({ sesRegion: 'Frankfurt' }).sesRegion, 'invalid');
  assert.equal(errors({ sesRegion: 'cn-north-1' }).sesRegion, 'invalid');
  assert.equal(errors({ sesAccessKeyId: 'short' }).sesAccessKeyId, 'invalid');
  assert.equal(errors({ sesConfigurationSet: 'has space' }).sesConfigurationSet, 'invalid');
  assert.equal(errors({ sesTopicArn: 'arn:aws:sqs:eu-west-1:1:x' }).sesTopicArn, 'invalid');
  assert.equal(
    errors({ sesTopicArn: 'arn:aws-us-gov:sns:us-gov-west-1:123456789012:t' }).sesTopicArn,
    'partition'
  );
  assert.deepEqual(errors({ sesTopicArn: 'arn:aws:sns:eu-west-1:123456789012:ses-events' }), {});
  assert.equal(
    wizard.canProceedStep(3, { provider: 'ses', form: { ...form, sesRegion: 'nope' } }),
    false
  );
  assert.equal(
    wizard.canProceedStep(3, { provider: 'ses', form: { ...form, sesSecretAccessKey: '' } }),
    false
  );
});

test('editing an SES account keeps the masked secret and maps every field back', () => {
  const values = wizard.accountToForm({
    provider: 'ses',
    config: {
      region: 'us-east-1',
      credentialSource: 'keys',
      accessKeyId: 'AKIAEXAMPLE000000001',
      secretAccessKey: '********',
      configurationSetName: 'events',
      snsTopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-events',
    },
  });
  assert.equal(values.sesRegion, 'us-east-1');
  assert.equal(values.sesSecretAccessKey, '********');
  assert.equal(wizard.buildConfig('ses', values).secretAccessKey, '********');
  assert.equal(values.sesConfigurationSet, 'events');
  assert.equal(wizard.PROVIDER_LABELS.ses, 'Amazon SES');
  assert.deepEqual(wizard.BOUNCE_MODES.brevo, []);
});

test('language tags and version candidates follow the server rules', () => {
  const { canonicalLocaleTag, languageVersionCandidates, hasTemplateProviderAccount } =
    templateUtils;
  assert.equal(canonicalLocaleTag('pt_br'), 'pt-BR');
  assert.equal(canonicalLocaleTag('DE'), 'de');
  assert.equal(canonicalLocaleTag('not a tag'), null);
  const detail = {
    key: 'sendgrid:welcome',
    provider: 'sendgrid',
    locales: [{ key: 'sendgrid:de' }],
  };
  const templates = [
    { key: 'sendgrid:welcome', provider: 'sendgrid' },
    { key: 'sendgrid:de', provider: 'sendgrid', localeVariantOf: 'sendgrid:welcome' },
    { key: 'sendgrid:fr', provider: 'sendgrid' },
    { key: 'sendgrid:other-base', provider: 'sendgrid', locales: [{ key: 'sendgrid:x' }] },
    { key: 'sendgrid:x', provider: 'sendgrid', localeVariantOf: 'sendgrid:other-base' },
    { key: 'mailgun:fr', provider: 'mailgun' },
  ];
  assert.deepEqual(
    languageVersionCandidates(detail, templates).map((t) => t.key),
    ['sendgrid:fr']
  );
  assert.equal(hasTemplateProviderAccount([{ provider: 'smtp' }]), false);
  assert.equal(hasTemplateProviderAccount([{ provider: 'ses' }]), true);
  assert.equal(hasTemplateProviderAccount(null), false);
});

test('every Brevo and SES hint code has a translated admin text', () => {
  const { ADAPTERS } = require('../server/src/providers');
  const t = (_key, fallback) => fallback;
  for (const adapter of Object.values(ADAPTERS)) {
    for (const [code, text] of Object.entries(adapter.HINTS)) {
      assert.equal(hints.providerHintMessage(t, code, null), text, code);
    }
  }
});

test('new admin files use theme tokens, real rem sizes and no emoji or window.confirm', () => {
  for (const file of NEW_FILES) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    assert.deepEqual(findCssVarTokens(source), [], file);
    assert.deepEqual(findTinyRemFontSizes(source), [], file);
    assert.deepEqual(findEmoji(source), [], file);
    assert.doesNotMatch(source, /window\.confirm/, file);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, file);
  }
});
