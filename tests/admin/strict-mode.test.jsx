/**
 * StrictMode checks of every MagicMail admin entry point: the plugin page with its five sections
 * (accounts, routing rules, templates incl. provider templates, analytics, outbox), the template
 * editor, the Plugin Settings page and the initializer, plus the dialogs they open. See harness/index.jsx for what each
 * assertion counts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from 'react';
import { checkStrictEntry, network, permission } from './harness/index.jsx';
import App from '../../admin/src/pages/App';
import PluginSettings from '../../admin/src/pages/PluginSettings';
import Initializer from '../../admin/src/components/Initializer';
import plugin from '../../admin/src/index';

const ALL = ['access', 'read', 'manage', 'test-send', 'queue.read', 'queue.manage'].map((action) =>
  permission(`plugin::magic-mail.${action}`)
);

const ACCOUNT = {
  id: 1,
  documentId: 'account-1',
  name: 'Primary SMTP',
  provider: 'smtp',
  fromEmail: 'noreply@example.test',
  isActive: true,
  isPrimary: true,
  priority: 1,
  dailyLimit: 500,
  emailsSentToday: 3,
  totalEmailsSent: 42,
  lastUsed: null,
};

/** Provider-template overview without SendGrid or Mailgun accounts. */
const NO_PROVIDER_TEMPLATES = {
  enabled: false,
  accounts: [],
  templates: [],
  lastSyncedAt: null,
  stale: false,
};

/** Routes of every section of the plugin page. */
const pluginRoutes = () => {
  network.on('GET', '/magic-mail/accounts', { data: [ACCOUNT] });
  network.on('GET', '/magic-mail/routing-rules', { data: [] });
  network.on('GET', '/magic-mail/designer/templates', { data: [] });
  network.on('GET', '/magic-mail/designer/stats', { data: { total: 0 } });
  network.on('GET', '/magic-mail/analytics/stats', { data: { totalSent: 0 } });
  network.on('GET', '/magic-mail/analytics/emails', {
    data: [],
    pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 },
  });
  network.on('GET', '/magic-mail/outbox', {
    data: [],
    pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 },
    counts: {},
  });
  network.on('GET', '/magic-mail/designer/editor-config', { data: {} });
  network.on('GET', '/magic-mail/provider-templates', { data: NO_PROVIDER_TEMPLATES });
};

/**
 * Clicks an element inside `act` (Radix triggers also need pointerdown).
 * @param {Element | null | undefined} element - Element.
 */
const click = async (element) => {
  assert.ok(element, 'element to click exists');
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    element.click();
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
};

/**
 * Finds a button or tab by accessible label or exact text anywhere in the document.
 * @param {string | RegExp} label - Label or text.
 * @returns {HTMLElement | undefined} Button.
 */
const button = (label) =>
  [...document.querySelectorAll('button, [role="tab"]')].find((node) => {
    const name = node.getAttribute('aria-label') || node.textContent.trim();
    return label instanceof RegExp ? label.test(name) : name === label;
  });

/**
 * Clicks the button or tab with this label; fails with the visible labels when it is missing.
 * @param {string | RegExp} label - Label or text.
 */
const clickLabel = async (label) => {
  const target = button(label);
  if (!target) {
    const labels = [...document.querySelectorAll('button, [role="tab"]')].map(
      (node) => node.getAttribute('aria-label') || node.textContent.trim()
    );
    assert.fail(`no button "${label}"; visible: ${labels.join(' | ')}`);
  }
  if (target.getAttribute('role') === 'tab') {
    // Radix tabs activate on mousedown.
    await act(async () => {
      target.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
  }
  await click(target);
};

const wait = (ms) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

const live = (calls, pathname, method = 'GET') =>
  calls.filter((call) => call.method === method && call.pathname === pathname && !call.aborted);

const mutations = (calls) => calls.filter((call) => call.method !== 'GET');

test('plugin registration: menu link, settings link and initializer are registered', () => {
  const app = { menu: [], settings: [], plugins: [] };
  plugin.register({
    addMenuLink: (link) => app.menu.push(link),
    createSettingSection: (_section, links) => app.settings.push(...links),
    registerPlugin: (entry) => app.plugins.push(entry),
  });
  assert.equal(app.menu.length, 1);
  assert.deepEqual(
    app.settings.map((link) => link.id),
    ['plugin-settings']
  );
  assert.equal(app.plugins[0].initializer, Initializer);
});

test('initializer: StrictMode mount reports the plugin and leaves nothing behind', async () => {
  const ready = [];
  await checkStrictEntry(<Initializer setPlugin={(id) => ready.push(id)} />);
  assert.ok(ready.length >= 1);
  assert.ok(ready.every((id) => id === 'magic-mail'));
});

for (const [section, path, expected, endpoints] of [
  ['accounts', '/plugins/magic-mail', /Primary SMTP/, ['/magic-mail/accounts']],
  ['routing rules', '/plugins/magic-mail/routing', /Routing/, ['/magic-mail/routing-rules']],
  [
    'templates',
    '/plugins/magic-mail/designer',
    /Templates/,
    ['/magic-mail/designer/templates', '/magic-mail/provider-templates'],
  ],
  [
    'analytics',
    '/plugins/magic-mail/analytics',
    /Analytics/,
    ['/magic-mail/analytics/stats', '/magic-mail/analytics/emails'],
  ],
  ['outbox', '/plugins/magic-mail/outbox', /Outbox/, ['/magic-mail/outbox']],
]) {
  test(`plugin page, ${section}: StrictMode mount, one live request each, clean unmount`, async () => {
    pluginRoutes();
    const result = await checkStrictEntry(<App />, { path, permissions: ALL });
    assert.match(result.html, expected);
    assert.doesNotMatch(result.html, /could not be loaded|Failed to load/i);
    for (const endpoint of endpoints)
      assert.equal(live(result.mountCalls, endpoint).length, 1, endpoint);
    assert.equal(mutations(result.calls).length, 0, 'no mutation');
  });
}

test('plugin page: switching through every section tab mounts and unmounts cleanly', async () => {
  pluginRoutes();
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail',
    permissions: ALL,
    async whileMounted() {
      for (const tab of [
        'Routing rules',
        'Email templates',
        'Analytics',
        'Outbox',
        'Email accounts',
      ]) {
        await click(button(tab));
        await wait(50);
      }
    },
  });
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

const RULE = {
  id: 3,
  documentId: 'rule-1',
  name: 'Receipts',
  matchType: 'emailType',
  matchValue: 'transactional',
  accountName: 'Primary SMTP',
  priority: 1,
  isActive: true,
};
const TEMPLATE = {
  id: 5,
  documentId: 'template-5',
  templateReferenceId: 1001,
  name: 'Welcome',
  subject: 'Welcome {{name}}',
  category: 'transactional',
  isActive: true,
  bodyHtml: '<p>Hello</p>',
  bodyText: 'Hello',
  tags: [],
};
const OUTBOX_ROW = {
  documentId: 'outbox-1',
  status: 'failed',
  subject: 'Receipt',
  to: ['grace@example.test'],
  attempts: 2,
  createdAt: new Date().toISOString(),
};

test('accounts: add-account wizard and test-email dialog open and close cleanly', async () => {
  pluginRoutes();
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail',
    permissions: ALL,
    async whileMounted() {
      await click(button('Add account'));
      assert.ok(document.querySelector('[role="dialog"]'), 'wizard is open');
      await click(button('Close'));
      await wait(50);
      await click(button('Test account Primary SMTP'));
      assert.match(document.body.textContent, /Test email account/);
      await click(button('Close'));
      await wait(50);
    },
  });
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('routing rules: the rule dialog opens and closes cleanly', async () => {
  pluginRoutes();
  network.on('GET', '/magic-mail/routing-rules', { data: [RULE] });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/routing',
    permissions: ALL,
    async whileMounted() {
      await click(button('Edit rule "Receipts"'));
      assert.ok(document.querySelector('[role="dialog"]'), 'rule dialog is open');
      await click(button('Cancel'));
      await wait(50);
    },
  });
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('templates: code snippets and test-send dialogs open and close cleanly', async () => {
  pluginRoutes();
  network.on('GET', '/magic-mail/designer/templates', { data: [TEMPLATE] });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/designer',
    permissions: ALL,
    async whileMounted() {
      await click(button('Show code snippets'));
      assert.match(document.body.textContent, /Code snippets: Welcome/);
      await click(button('Close'));
      await wait(50);
      await click(button('Send test email'));
      assert.ok(document.querySelector('[role="dialog"]'), 'test-send dialog is open');
      await click(button('Close'));
      await wait(50);
    },
  });
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

const SG_ACCOUNT = { documentId: 'sg-1', name: 'SendGrid', provider: 'sendgrid', isActive: true };
const PROVIDER_TEMPLATE = {
  key: 'sendgrid:order-receipt',
  provider: 'sendgrid',
  name: 'Order receipt',
  subject: 'Your order {{order.id}}',
  status: 'ok',
  usable: true,
  updatedAtProvider: '2026-11-18T10:00:00.000Z',
  accounts: [{ documentId: 'sg-1', name: 'SendGrid', isActive: true, status: 'ok' }],
  variableCount: 2,
  fallbackTemplateReferenceId: null,
  usedByCoreMails: [],
};
/** Provider-template overview with one synced SendGrid template. */
const providerOverview = (stale = false) => ({
  enabled: true,
  accounts: [{ ...SG_ACCOUNT, lastSyncedAt: new Date().toISOString(), error: null, warning: null }],
  templates: [PROVIDER_TEMPLATE],
  lastSyncedAt: stale ? null : new Date().toISOString(),
  stale,
});
const CORE_DESIGNS = Object.fromEntries(
  ['reset-password', 'email-confirmation'].map((type) => [
    type,
    {
      mode: 'designer',
      providerTemplate: null,
      templateName: null,
      provider: null,
      status: null,
      usable: true,
      fallbackToDesigner: false,
      updatedAt: null,
      variables: ['URL', 'USER'],
    },
  ])
);

/** Routes of the templates page with provider templates. */
const providerRoutes = (stale = false) => {
  pluginRoutes();
  network.on('GET', '/magic-mail/provider-templates', { data: providerOverview(stale) });
  network.on('GET', '/magic-mail/designer/core-designs', { data: CORE_DESIGNS });
  network.on('GET', `/magic-mail/provider-templates/${encodeURIComponent(PROVIDER_TEMPLATE.key)}`, {
    data: {
      ...PROVIDER_TEMPLATE,
      previewHtml: '<p>Order {{order.id}} for {{name}}</p>',
      previewText: '',
      previewTooLarge: false,
      variables: [
        { path: 'order.id', root: 'order', raw: false, scoped: false, inSample: false },
        { path: 'name', root: 'name', raw: false, scoped: false, inSample: true },
      ],
      variablesTruncated: false,
      sampleData: { name: 'Ada' },
      coreMailVariables: [],
      copyWarnings: [],
      usage: "send({ providerTemplate: 'sendgrid:order-receipt' })",
    },
  });
};

test('provider templates: list, preview dialog and core-email design dialog open and close cleanly', async () => {
  providerRoutes();
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/designer',
    permissions: ALL,
    async whileMounted() {
      assert.match(document.body.textContent, /Order receipt/);
      await clickLabel('Open Order receipt');
      assert.ok(document.querySelector('[role="dialog"]'), 'provider template dialog is open');
      await wait(50);
      assert.match(document.body.textContent, /order\.id/);
      await clickLabel('Close');
      await wait(50);
      await clickLabel('Core emails');
      await wait(50);
      await clickLabel('Choose design of Reset password');
      assert.ok(document.querySelector('[role="dialog"]'), 'core design dialog is open');
      await clickLabel('Close');
      await wait(50);
    },
  });
  assert.equal(live(result.mountCalls, '/magic-mail/provider-templates').length, 1);
  assert.equal(
    live(
      result.calls,
      `/magic-mail/provider-templates/${encodeURIComponent(PROVIDER_TEMPLATE.key)}`
    ).length,
    1,
    'the preview is loaded once'
  );
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('provider templates: a stale list starts exactly one background sync in StrictMode', async () => {
  providerRoutes(true);
  network.on('POST', '/magic-mail/provider-templates/sync', { data: providerOverview(false) });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/designer',
    permissions: ALL,
    async whileMounted() {
      await wait(100);
    },
  });
  const syncs = live(result.calls, '/magic-mail/provider-templates/sync', 'POST');
  assert.equal(syncs.length, 1, 'one background sync, not one per StrictMode effect run');
  assert.deepEqual(
    mutations(result.calls).map((call) => call.pathname),
    ['/magic-mail/provider-templates/sync']
  );
});

test('outbox: the detail drawer opens and closes cleanly', async () => {
  pluginRoutes();
  network.on('GET', '/magic-mail/outbox', {
    data: [OUTBOX_ROW],
    pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 },
    counts: { failed: 1 },
  });
  network.on('GET', '/magic-mail/outbox/outbox-1', { data: OUTBOX_ROW });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/outbox',
    permissions: ALL,
    async whileMounted() {
      await click(button(/^Show details for /));
      assert.ok(document.querySelector('[role="dialog"]'), 'detail drawer is open');
      await click(button('Close details'));
      await wait(50);
    },
  });
  assert.equal(live(result.calls, '/magic-mail/outbox/outbox-1').length, 1);
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('template editor (existing template): load and version history open and close cleanly', async () => {
  pluginRoutes();
  network.on('GET', '/magic-mail/designer/templates/5', { data: TEMPLATE });
  network.on('GET', '/magic-mail/designer/templates/5/versions', { data: [] });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/designer/5',
    permissions: ALL,
    async whileMounted() {
      await click(button('Version history'));
      assert.ok(document.querySelector('[role="dialog"]'), 'version history is open');
      await click(button('Close version history'));
      await wait(50);
    },
  });
  assert.equal(live(result.mountCalls, '/magic-mail/designer/templates/5').length, 1);
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('template editor (new template): StrictMode mount, editor load timeout cleared on unmount', async () => {
  pluginRoutes();
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/designer/new',
    permissions: ALL,
  });
  assert.equal(live(result.mountCalls, '/magic-mail/designer/editor-config').length, 1);
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('plugin settings page: StrictMode mount shows the loaded form, clean unmount', async () => {
  network.on('GET', '/magic-mail/settings', { data: {} });
  network.on('GET', '/magic-mail/suppressions', {
    data: [],
    pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 },
  });
  const result = await checkStrictEntry(<PluginSettings />, {
    path: '/settings/magic-mail/plugin-settings',
    permissions: ALL,
  });
  assert.doesNotMatch(result.html, /Failed to load settings/i);
  assert.equal(live(result.mountCalls, '/magic-mail/settings').length, 1);
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

const BREVO_ACCOUNT = {
  ...ACCOUNT,
  id: 2,
  documentId: 'brevo-1',
  name: 'Brevo Transactional',
  provider: 'brevo',
  fromEmail: 'noreply@brevo.example.test',
  isPrimary: false,
};
const SES_ACCOUNT = {
  ...ACCOUNT,
  id: 3,
  documentId: 'ses-1',
  name: 'Amazon SES EU',
  provider: 'ses',
  fromEmail: 'noreply@ses.example.test',
  isPrimary: false,
};

/**
 * Opens an account in the wizard, goes to the credentials step and runs the
 * read-only connection check.
 * @param {string} name - Account name.
 * @param {RegExp} heading - Heading of the credentials section.
 * @param {RegExp} result - Text of the check result.
 */
const checkAccountConnection = async (name, heading, result) => {
  await clickLabel(`Edit account ${name}`);
  await wait(50);
  await clickLabel('Continue');
  await wait(50);
  assert.match(document.body.textContent, heading);
  await clickLabel('Check connection');
  await wait(50);
  assert.match(document.body.textContent, result);
  await clickLabel('Close');
  await wait(50);
};

test('accounts: Brevo and Amazon SES credentials steps and the connection check mount and close cleanly', async () => {
  pluginRoutes();
  network.on('GET', '/magic-mail/accounts', { data: [ACCOUNT, BREVO_ACCOUNT, SES_ACCOUNT] });
  network.on('GET', '/magic-mail/accounts/brevo-1', {
    data: { ...BREVO_ACCOUNT, config: { apiKey: '********', webhookToken: '********' } },
  });
  network.on('GET', '/magic-mail/accounts/ses-1', {
    data: {
      ...SES_ACCOUNT,
      config: {
        region: 'eu-west-1',
        credentialSource: 'keys',
        accessKeyId: 'AKIAEXAMPLE000000001',
        secretAccessKey: '********',
        configurationSetName: 'events',
        snsTopicArn: '',
      },
    },
  });
  network.on('POST', '/magic-mail/accounts/brevo-1/check', {
    ok: true,
    provider: 'brevo',
    details: {},
  });
  network.on('POST', '/magic-mail/accounts/ses-1/check', {
    ok: true,
    provider: 'ses',
    details: { sandbox: true },
  });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail',
    permissions: ALL,
    async whileMounted() {
      await checkAccountConnection(
        'Brevo Transactional',
        /Brevo API configuration/,
        /Connected\. The credentials work\./
      );
      await checkAccountConnection('Amazon SES EU', /Amazon SES configuration/, /SES sandbox/);
    },
  });
  const posts = mutations(result.calls).map((call) => call.pathname);
  assert.deepEqual(posts.sort(), [
    '/magic-mail/accounts/brevo-1/check',
    '/magic-mail/accounts/ses-1/check',
  ]);
});

test('provider templates: a Brevo template dialog with language versions opens and closes cleanly', async () => {
  const brevoTemplate = {
    ...PROVIDER_TEMPLATE,
    key: 'brevo:welcome',
    provider: 'brevo',
    name: 'Welcome',
    locales: [{ locale: 'de', key: 'brevo:welcome-de' }],
    localeVariantOf: null,
  };
  const german = {
    ...brevoTemplate,
    key: 'brevo:welcome-de',
    name: 'Welcome DE',
    locales: [],
    localeVariantOf: 'brevo:welcome',
  };
  pluginRoutes();
  network.on('GET', '/magic-mail/provider-templates', {
    data: { ...providerOverview(), templates: [brevoTemplate, german] },
  });
  network.on('GET', '/magic-mail/designer/core-designs', { data: CORE_DESIGNS });
  network.on('GET', `/magic-mail/provider-templates/${encodeURIComponent('brevo:welcome')}`, {
    data: {
      ...brevoTemplate,
      previewHtml: '<p>Hi {{ params.name }}</p>',
      previewText: '',
      previewTooLarge: false,
      variables: [{ path: 'name', root: 'name', raw: false, scoped: false, inSample: true }],
      variablesTruncated: false,
      sampleData: { name: 'Ada' },
      coreMailVariables: [],
      copyWarnings: [],
      usage: "send({ providerTemplate: 'brevo:welcome' })",
    },
  });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/designer',
    permissions: ALL,
    async whileMounted() {
      await clickLabel('Open Welcome');
      await wait(50);
      assert.match(document.body.textContent, /Language versions/);
      assert.match(document.body.textContent, /Welcome DE/);
      assert.match(document.body.textContent, /Brevo reads your data under params/);
      assert.equal(button('Copy as Magic Mail template'), undefined, 'no Mustache copy for Brevo');
      await clickLabel('Close');
      await wait(50);
    },
  });
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

test('plugin settings page: the provider-tracking switch appears only with a template provider account', async () => {
  network.on('GET', '/magic-mail/settings', { data: {} });
  network.on('GET', '/magic-mail/suppressions', {
    data: [],
    pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 },
  });
  network.on('GET', '/magic-mail/accounts', { data: [BREVO_ACCOUNT] });
  const result = await checkStrictEntry(<PluginSettings />, {
    path: '/settings/magic-mail/plugin-settings',
    permissions: ALL,
    async whileMounted() {
      await wait(50);
      assert.match(document.body.textContent, /Count provider opens and clicks/);
    },
  });
  assert.equal(live(result.mountCalls, '/magic-mail/settings').length, 1);
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});

/** Core designs with the admin forgot-password row (RFC #27752). */
const coreDesignsWithAdmin = ({ editable, broken = false }) => ({
  ...Object.fromEntries(
    Object.entries(CORE_DESIGNS).map(([type, design]) => [type, { ...design, editable: true }])
  ),
  'admin-forgot-password': broken
    ? {
        ...CORE_DESIGNS['reset-password'],
        mode: 'provider',
        providerTemplate: 'sendgrid:admin-reset',
        templateName: null,
        provider: 'sendgrid',
        status: 'missing',
        usable: false,
        problem: 'MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE',
        checkedAt: '2026-11-19T08:00:00.000Z',
        editable,
      }
    : { ...CORE_DESIGNS['reset-password'], editable },
});

test('core emails: the admin password reset row offers the design choice to super admins only', async () => {
  for (const editable of [true, false]) {
    providerRoutes();
    network.on('GET', '/magic-mail/designer/core-designs', {
      data: coreDesignsWithAdmin({ editable }),
    });
    const result = await checkStrictEntry(<App />, {
      path: '/plugins/magic-mail/designer',
      permissions: ALL,
      async whileMounted() {
        await clickLabel('Core emails');
        await wait(50);
        assert.match(document.body.textContent, /Admin password reset/);
        assert.match(document.body.textContent, /subject and body from Users & Permissions/);
        assert.equal(button('Edit Admin password reset'), undefined, 'no local editor');
        assert.ok(button('Edit Reset password'));
        if (editable) {
          await clickLabel('Choose design of Admin password reset');
          assert.match(document.body.textContent, /Design of Admin password reset/);
          await clickLabel('Close');
          await wait(50);
        } else {
          assert.equal(button('Choose design of Admin password reset'), undefined);
          assert.ok(button('Choose design of Reset password'));
        }
      },
    });
    assert.equal(mutations(result.calls).length, 0, 'no mutation');
  }
});

test('dashboard: the core email alert names the admin mail with its reason and check time', async () => {
  pluginRoutes();
  network.on('GET', '/magic-mail/accounts', { data: [ACCOUNT, BREVO_ACCOUNT] });
  network.on('GET', '/magic-mail/designer/core-designs', {
    data: coreDesignsWithAdmin({ editable: true, broken: true }),
  });
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail',
    permissions: ALL,
    async whileMounted() {
      await wait(50);
      const alert = document.querySelector('[role="alert"]');
      assert.ok(alert, 'alert is shown');
      assert.match(alert.textContent, /Admin password reset \(deleted or unpublished/);
      assert.match(alert.textContent, /Last checked:/);
    },
  });
  assert.equal(mutations(result.calls).length, 0, 'no mutation');
});
