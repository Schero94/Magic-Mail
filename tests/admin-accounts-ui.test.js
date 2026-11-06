'use strict';

/**
 * Email Accounts view and account wizard (UI-05/06/07/12/18, UI-M02, UI-M04,
 * FUN-07/16 UI parts, SUP-07 UI part, SUP-13 OAuth popup).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { loadAdminModule, ROOT } = require('./helpers/load-admin-module');
const { findCssVarTokens, findTinyRemFontSizes, findEmoji } = require('./helpers/admin-style-guards');

const wizard = loadAdminModule('admin/src/components/AccountWizard/wizardState.js');
const helpers = loadAdminModule('admin/src/pages/Accounts/accountHelpers.js');

const VIEW_FILES = [
  'admin/src/pages/HomePage.jsx',
  'admin/src/pages/Accounts/TestEmailModal.jsx',
  'admin/src/pages/Accounts/styles.js',
  'admin/src/pages/Accounts/accountHelpers.js',
  'admin/src/components/AddAccountModal.jsx',
  'admin/src/components/AccountWizard/ProviderStep.jsx',
  'admin/src/components/AccountWizard/DetailsStep.jsx',
  'admin/src/components/AccountWizard/CredentialsStep.jsx',
  'admin/src/components/AccountWizard/SettingsStep.jsx',
  'admin/src/components/AccountWizard/styles.js',
  'admin/src/components/AccountWizard/useOAuthPopup.js',
  'admin/src/components/AccountWizard/wizardState.js',
];
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

// ---------------------------------------------------------------- wizard state

test('UI-05/FUN-16: editing an unlimited account keeps 0 limits instead of 500/50', () => {
  const form = wizard.accountToForm({
    name: 'Bulk',
    provider: 'smtp',
    priority: 3,
    dailyLimit: 0,
    hourlyLimit: 0,
    config: { host: 'smtp.example.test', port: 2525, user: 'u', pass: '****abcd' },
  });
  assert.equal(form.dailyLimit, 0);
  assert.equal(form.hourlyLimit, 0);
  assert.equal(form.priority, 3);
  assert.equal(form.port, 2525);

  const payload = wizard.buildAccountPayload('smtp', { ...form, fromEmail: 'bulk@example.test' }, { isEditMode: true });
  assert.equal(payload.dailyLimit, 0);
  assert.equal(payload.hourlyLimit, 0);
  assert.equal(payload.config.pass, '****abcd', 'the mask is sent back so the server keeps the stored secret');
});

test('missing stored limits map to the database defaults (unlimited, priority 1), not the new-account defaults', () => {
  const form = wizard.accountToForm({ name: 'Legacy', provider: 'smtp' });
  assert.equal(form.dailyLimit, 0);
  assert.equal(form.hourlyLimit, 0);
  assert.equal(form.priority, 1);
  assert.equal(wizard.createEmptyForm().dailyLimit, 500, 'new accounts keep the suggested defaults');
});

test('FUN-16: clearing Reply-To and description sends empty values instead of keeping the old ones', () => {
  const form = { ...wizard.accountToForm({ name: 'A', replyTo: 'old@example.test', description: 'old' }), replyTo: '  ', description: '' };
  const payload = wizard.buildAccountPayload('sendgrid', { ...form, fromEmail: 'a@example.test', apiKey: 'SG.x' }, { isEditMode: true });
  assert.equal(payload.replyTo, '');
  assert.equal(payload.description, '');
});

test('settings step rejects negative, fractional and out-of-range values', () => {
  const base = wizard.createEmptyForm();
  assert.deepEqual(wizard.validateLimits(base), {});
  assert.deepEqual(wizard.validateLimits({ ...base, dailyLimit: 0, hourlyLimit: 0 }), {});
  assert.equal(wizard.validateLimits({ ...base, dailyLimit: -1 }).dailyLimit, 'limit');
  assert.equal(wizard.validateLimits({ ...base, hourlyLimit: 1.5 }).hourlyLimit, 'limit');
  assert.equal(wizard.validateLimits({ ...base, hourlyLimit: undefined }).hourlyLimit, 'limit');
  assert.equal(wizard.validateLimits({ ...base, priority: 0 }).priority, 'priority');
  assert.equal(wizard.canProceedStep(4, { provider: 'smtp', form: { ...base, priority: 11 } }), false);
});

test('UI-18: OAuth accounts need no sender address and never send a placeholder address', () => {
  const form = { ...wizard.createEmptyForm(), name: 'Google', oauthClientId: 'cid', oauthClientSecret: 'secret' };
  assert.equal(wizard.canProceedStep(2, { provider: 'microsoft-oauth', form }), true);
  assert.equal(wizard.canProceedStep(2, { provider: 'smtp', form }), false, 'non-OAuth providers need a valid sender');
  assert.equal(wizard.canProceedStep(2, { provider: 'smtp', form: { ...form, fromEmail: 'a@example.test' } }), true);
  assert.equal(wizard.canProceedStep(2, { provider: 'smtp', form: { ...form, name: '   ', fromEmail: 'a@example.test' } }), false);

  const body = wizard.buildOAuthCreatePayload('gmail-oauth', form, 'code-1', 'state-1');
  assert.equal(body.provider, 'gmail');
  assert.equal(body.code, 'code-1');
  assert.equal(body.accountDetails.fromEmail, undefined);
  assert.ok(!JSON.stringify(body).includes('placeholder'));
  assert.deepEqual(body.accountDetails.config, { clientId: 'cid', clientSecret: 'secret' });
});

test('SMTP credentials require host, user, password and a valid port', () => {
  const form = { ...wizard.createEmptyForm(), host: 'smtp.example.test', user: 'u', pass: 'p' };
  assert.equal(wizard.canProceedStep(3, { provider: 'smtp', form }), true);
  assert.equal(wizard.canProceedStep(3, { provider: 'smtp', form: { ...form, port: 0 } }), false);
  assert.equal(wizard.canProceedStep(3, { provider: 'smtp', form: { ...form, port: 70000 } }), false);
  assert.equal(wizard.canProceedStep(3, { provider: 'smtp', form: { ...form, pass: '' } }), false);
  assert.equal(wizard.canProceedStep(3, { provider: 'mailgun', form: { ...form, apiKey: 'k' } }), false, 'Mailgun needs a domain');
  assert.equal(wizard.canProceedStep(3, { provider: 'mailgun', form: { ...form, apiKey: 'k', mailgunDomain: 'mg.example.test' } }), true);
});

test('OAuth create mode needs app credentials and an authorization code; edit mode never claims a new authorization', () => {
  const form = { ...wizard.createEmptyForm(), oauthClientId: 'cid', oauthClientSecret: 'sec', microsoftTenantId: 'tid' };
  assert.equal(wizard.canProceedStep(3, { provider: 'gmail-oauth', form }), false, 'no code yet');
  assert.equal(wizard.canProceedStep(3, { provider: 'gmail-oauth', form, oauthCode: 'c', oauthState: 's' }), true);
  assert.equal(
    wizard.canProceedStep(3, { provider: 'gmail-oauth', form: { ...form, oauthClientSecret: '' }, oauthCode: 'c', oauthState: 's' }),
    false,
    'the server rejects a missing client secret, so the wizard does too'
  );
  assert.equal(
    wizard.canProceedStep(3, { provider: 'microsoft-oauth', form: { ...form, microsoftTenantId: '' }, oauthCode: 'c', oauthState: 's' }),
    false
  );
  assert.equal(wizard.canProceedStep(3, { provider: 'yahoo-oauth', form, isEditMode: true }), true);
});

test('UI-07: unreadable OAuth credentials do not overwrite the stored config on save', () => {
  const form = { ...wizard.createEmptyForm(), name: 'Old', oauthClientId: '', oauthClientSecret: '' };
  assert.equal(
    wizard.canProceedStep(3, { provider: 'gmail-oauth', form, isEditMode: true, credentialsUnreadable: true }),
    true,
    'other settings can still be saved'
  );
  const payload = wizard.buildAccountPayload('gmail-oauth', form, { isEditMode: true, credentialsUnreadable: true });
  assert.equal('config' in payload, false);
  assert.equal('fromEmail' in payload, false);

  const smtpPayload = wizard.buildAccountPayload('smtp', { ...form, fromEmail: 'a@example.test', host: 'h', user: 'u', pass: 'new' }, {
    isEditMode: true,
    credentialsUnreadable: true,
  });
  assert.equal(smtpPayload.config.pass, 'new', 'non-OAuth credentials are re-entered and sent');
  assert.equal(wizard.isMaskedSecret('****abcd'), true);
  assert.equal(wizard.isMaskedSecret('plain'), false);
});

test('SUP-07: the redirect URI prefers the server value, then the backend URL, then the admin origin', () => {
  assert.equal(
    wizard.getRedirectUri('gmail', { serverRedirectUri: 'https://api.example.test/magic-mail/oauth/gmail/callback', origin: 'https://admin.example.test' }),
    'https://api.example.test/magic-mail/oauth/gmail/callback'
  );
  assert.equal(
    wizard.getRedirectUri('yahoo', { backendURL: 'https://api.example.test/', origin: 'https://admin.example.test' }),
    'https://api.example.test/magic-mail/oauth/yahoo/callback'
  );
  assert.equal(
    wizard.getRedirectUri('microsoft', { backendURL: '', origin: 'https://cms.example.test' }),
    'https://cms.example.test/magic-mail/oauth/microsoft/callback'
  );
  assert.equal(
    wizard.getRedirectUri('gmail', { serverRedirectUri: 'javascript:alert(1)', origin: 'https://cms.example.test' }),
    'https://cms.example.test/magic-mail/oauth/gmail/callback',
    'a non-http server value is ignored'
  );
});

test('SUP-13/UI-06: OAuth messages are accepted only from allowed origins, for the started provider, with sane tokens', () => {
  const allowedOrigins = wizard.getAllowedMessageOrigins({
    backendURL: 'https://api.example.test',
    origin: 'https://admin.example.test',
  });
  assert.deepEqual([...allowedOrigins].sort(), ['https://admin.example.test', 'https://api.example.test']);

  const ok = { origin: 'https://admin.example.test', data: { type: 'microsoft-oauth-success', code: 'c', state: 's' } };
  assert.deepEqual(wizard.parseOAuthMessage(ok, { allowedOrigins, expectedProvider: 'microsoft-oauth' }), {
    provider: 'microsoft-oauth',
    code: 'c',
    state: 's',
  });
  assert.equal(wizard.parseOAuthMessage({ ...ok, origin: 'https://evil.example.test' }, { allowedOrigins }), null);
  assert.equal(wizard.parseOAuthMessage(ok, { allowedOrigins, expectedProvider: 'gmail-oauth' }), null, 'other provider');
  assert.equal(wizard.parseOAuthMessage({ ...ok, data: 'string' }, { allowedOrigins }), null);
  assert.equal(wizard.parseOAuthMessage({ ...ok, data: { ...ok.data, code: '' } }, { allowedOrigins }), null);
  assert.equal(wizard.parseOAuthMessage({ ...ok, data: { ...ok.data, state: 'x'.repeat(9000) } }, { allowedOrigins }), null);
  assert.equal(wizard.parseOAuthMessage({ ...ok, data: { ...ok.data, type: 'other' } }, { allowedOrigins }), null);
});

test('the wizard dirty check sees field, provider and authorization changes', () => {
  const form = wizard.createEmptyForm();
  const initial = wizard.snapshotWizard({ provider: '', form, oauthCode: null });
  assert.equal(wizard.snapshotWizard({ provider: '', form: { ...form }, oauthCode: null }), initial);
  assert.notEqual(wizard.snapshotWizard({ provider: 'smtp', form, oauthCode: null }), initial);
  assert.notEqual(wizard.snapshotWizard({ provider: '', form: { ...form, name: 'x' }, oauthCode: null }), initial);
  assert.notEqual(wizard.snapshotWizard({ provider: '', form, oauthCode: 'c' }), initial);
});

// ------------------------------------------------------------- account helpers

test('account filters tolerate missing fields and combine search, status and provider', () => {
  const accounts = [
    { name: 'Main', fromEmail: 'main@example.test', provider: 'smtp', isActive: true, isPrimary: true },
    { name: 'Bulk', fromEmail: null, provider: 'sendgrid', isActive: false },
    { name: null, fromEmail: 'x@example.test', provider: null, isActive: true },
  ];
  assert.equal(helpers.filterAccounts(accounts, { query: 'MAIN' }).length, 1);
  assert.equal(helpers.filterAccounts(accounts, { status: 'inactive' })[0].name, 'Bulk');
  assert.equal(helpers.filterAccounts(accounts, { status: 'primary' }).length, 1);
  assert.equal(helpers.filterAccounts(accounts, { provider: 'sendgrid', query: 'bulk' }).length, 1);
  assert.equal(helpers.filterAccounts(accounts, { query: 'nothing' }).length, 0);
  assert.deepEqual(helpers.uniqueProviders(accounts), ['sendgrid', 'smtp']);
});

test('UI-M04: routing rules that reference an account are counted case-insensitively', () => {
  const rules = [
    { accountName: 'Main' },
    { accountName: 'other', fallbackAccountName: 'main ' },
    { accountName: 'Other' },
  ];
  assert.equal(helpers.countRulesForAccount(rules, 'MAIN'), 2);
  assert.equal(helpers.countRulesForAccount(rules, 'none'), 0);
  assert.equal(helpers.countRulesForAccount(null, 'Main'), null, 'unknown when the rules could not be loaded');
});

test('UI-12: the test dialog validates recipient, CC list and unsubscribe URL', () => {
  const base = { to: 'to@example.test', cc: '', mode: 'direct', emailType: 'transactional', unsubscribeUrl: '' };
  assert.deepEqual(helpers.validateTestForm(base), {});
  assert.equal(helpers.validateTestForm({ ...base, to: '' }).to, 'required');
  assert.equal(helpers.validateTestForm({ ...base, to: 'a@b' }).to, 'invalid', 'includes("@") is no longer enough');
  assert.equal(helpers.validateTestForm({ ...base, cc: 'ok@example.test, broken' }).cc, 'invalid');
  assert.deepEqual(helpers.validateTestForm({ ...base, cc: 'a@example.test; b@example.test' }), {});
  assert.equal(
    helpers.validateTestForm({ ...base, cc: Array.from({ length: 51 }, (_, i) => `u${i}@example.test`).join(',') }).cc,
    'tooMany'
  );
  assert.equal(helpers.validateTestForm({ ...base, emailType: 'marketing' }).unsubscribeUrl, 'required');
  assert.equal(helpers.validateTestForm({ ...base, emailType: 'marketing', unsubscribeUrl: 'javascript:x' }).unsubscribeUrl, 'invalid');
  assert.deepEqual(helpers.validateTestForm({ ...base, emailType: 'marketing', unsubscribeUrl: 'https://example.test/u' }), {});
  assert.deepEqual(helpers.validateTestForm({ ...base, mode: 'strapi', emailType: 'marketing' }), {}, 'strapi mode has no unsubscribe field');
  assert.equal(helpers.normaliseCc(' a@example.test ;b@example.test, '), 'a@example.test, b@example.test');
  assert.equal(helpers.normaliseCc('  '), undefined);
});

test('usage percent is 0 for unlimited accounts', () => {
  assert.equal(helpers.getUsagePercent({ dailyLimit: 0, emailsSentToday: 10 }), 0);
  assert.equal(helpers.getUsagePercent({ dailyLimit: 200, emailsSentToday: 50 }), 25);
  assert.equal(helpers.getAccountKey({ id: 4, documentId: 'abc' }), 'abc');
  assert.equal(helpers.getAccountKey({ id: 4 }), 4);
});

// ---------------------------------------------------------------- source rules

test('accounts view sources follow the admin foundation rules', () => {
  for (const file of VIEW_FILES) {
    const src = source(file);
    assert.deepEqual(findCssVarTokens(src), [], `${file}: var(--colors-*) tokens`);
    assert.deepEqual(findTinyRemFontSizes(src), [], `${file}: font sizes below 12px`);
    assert.deepEqual(findEmoji(src), [], `${file}: emoji`);
    assert.doesNotMatch(src, /useAuthRefresh/, `${file}: keep-alive polling`);
    assert.doesNotMatch(src, /(?<![\w.])confirm\(/, `${file}: window.confirm`);
    assert.doesNotMatch(src, /navigator\.clipboard/, `${file}: direct clipboard access`);
    assert.doesNotMatch(src, /'de-DE'|'en-US'|toLocaleString\(|toLocaleDateString\(/, `${file}: hard-coded locales`);
    assert.doesNotMatch(src, /\bas="span"/, `${file}: DS v1 'as' prop`);
    assert.doesNotMatch(src, /backgroundColor="(?:success|warning|neutral|primary|danger)\d+"/, `${file}: Badge colours instead of variants`);
    assert.doesNotMatch(src, /oauth@placeholder/, `${file}: placeholder sender`);
  }
});

test('accounts page: i18n, labelled controls, confirm dialog, error state and RBAC states', () => {
  const home = source('admin/src/pages/HomePage.jsx');
  assert.match(home, /useMagicMailIntl/);
  assert.match(home, /<SearchField[\s\S]*?label=\{t\('accounts\.search\.label'/);
  assert.equal((home.match(/<SingleSelect\s[^>]*?aria-label=\{t\(/g) || []).length, 2, 'both filter selects are labelled');
  assert.match(home, /<ConfirmDialog[\s\S]*?isOpen=\{canManage && pendingDelete !== null\}/);
  assert.match(home, /const deleteAccount = async \(account\) => \{\s*if \(!canManage\) return;/);
  assert.match(home, /Promise\.allSettled/);
  assert.match(home, /loadError/);
  assert.match(home, /accounts\.error\.retry/);
  assert.match(home, /permissionsLoading/);
  assert.match(home, /common\.permissions\.loadError/);
  assert.match(home, /\{hasRowActions && <Th>/, 'Actions column is hidden when no action is allowed');
  assert.match(home, /<Title tag="h1">/);
  assert.match(home, /useFormatters/);
  for (const match of home.matchAll(/<IconButton\w*\b[\s\S]*?<\/IconButton\w*>/g)) {
    assert.match(match[0], /aria-label=\{t\(/, 'icon buttons have translated labels');
  }
});

test('test dialog: labelled inputs, radio group for modes, in-flight state, stays open until the result', () => {
  const modal = source('admin/src/pages/Accounts/TestEmailModal.jsx');
  assert.match(modal, /<ModalFieldLabel htmlFor=\{ids\.to\}>/);
  assert.match(modal, /<StyledModalSelect id=\{ids\.priority\}/);
  assert.match(modal, /<StyledModalSelect id=\{ids\.type\}/);
  assert.match(modal, /role="radiogroup"/);
  assert.match(modal, /role="radio"[\s\S]*?aria-checked=\{selected\}/);
  assert.match(modal, /loading=\{sending\}/);
  assert.match(modal, /if \(succeeded\) onClose\(\);/);
  assert.match(modal, /validateTestForm/);
  assert.doesNotMatch(modal, /includes\('@'\)/);
});

test('wizard: Modal.Title, discard guard, accessible stepper and provider toggles, single OAuth flow', () => {
  const modal = source('admin/src/components/AddAccountModal.jsx');
  const providers = source('admin/src/components/AccountWizard/ProviderStep.jsx');
  const popup = source('admin/src/components/AccountWizard/useOAuthPopup.js');
  const credentials = source('admin/src/components/AccountWizard/CredentialsStep.jsx');
  const details = source('admin/src/components/AccountWizard/DetailsStep.jsx');

  assert.match(modal, /<Modal\.Title/);
  assert.match(modal, /useDiscardGuard\(/);
  assert.match(modal, /<UnsavedChangesDialog guard=\{discard\} \/>/);
  assert.match(modal, /aria-current=\{active \? 'step' : undefined\}/);
  assert.match(modal, /credentialsUnreadable/);
  assert.match(providers, /aria-pressed=\{selected\}/);

  assert.match(popup, /if \(!popup\) \{/, 'blocked popups are reported');
  assert.match(popup, /completedRef/, 'no "window closed" message after success');
  assert.match(popup, /removeEventListener\('message'/);
  assert.match(popup, /stopPolling\(\);\s*\};/, 'polling stops on unmount');
  assert.doesNotMatch(credentials, /startGmailOAuth|startMicrosoftOAuth|startYahooOAuth/);
  assert.match(credentials, /useCopyToClipboard/);
  assert.match(credentials, /if \(isEditMode\) \{[\s\S]*?accountModal\.oauth\.editTitle/, 'UI-M02: no Connect button in edit mode');
  assert.match(details, /accountModal\.details\.renameRules/, 'UI-M04: rename warning');
  assert.match(details, /<Field\.Error \/>/, 'UI-18: errors are linked through Field.Error');
});

test('the add-account and edit-account wizards are not mounted without manage permission', () => {
  const home = source('admin/src/pages/HomePage.jsx');
  assert.equal((home.match(/\{canManage && \(\s*<AddAccountModal/g) || []).length, 2);
});
