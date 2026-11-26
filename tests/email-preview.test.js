'use strict';

// Email preview with variables (4.11): masking at store time, re-render
// equals the sent output, deleted template versions, retention, the
// content.read grant and "the preview never fires tracking". Synthetic data
// only (example.test); no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const privacy = require('../server/src/utils/content-privacy');
const preview = require('../server/src/utils/email-preview');
const { createStrapi } = require('./helpers/provider-template-strapi');
const { templateContentHash } = preview;

const CONTENT_UID = 'plugin::magic-mail.email-content';
const RESET_TOKEN = 'a3f9c1d2e4b5a6978877665544332211ffeeddccbbaa0099';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDIsImlhdCI6MTcwMDAwMDAwMH0.c2lnbmF0dXJlLXN5bnRoZXRpYw';
const MAGIC_TOKEN = 'Zx81Kq0vLmN3pR7sT2uW9yB4cD6eF1gH';

// ---------------------------------------------------------------- masking

test('masking: secret key names are masked, harmless code compounds are kept', () => {
  const { variables, maskedPaths } = privacy.maskVariables({
    firstName: 'Anna',
    password: 'hunter22',
    resetPasswordToken: 'abc123def',
    login_token: 'xyz789',
    otp: 123456,
    code: '4711',
    apiKey: 'k-1',
    postalCode: '10115',
    countryCode: 'DE',
    order: { total: 19.9, couponCode: 'SAVE20', items: [{ sku: 'A-1' }] },
  });
  assert.equal(variables.firstName, 'Anna');
  assert.equal(variables.postalCode, '10115');
  assert.equal(variables.countryCode, 'DE');
  assert.equal(variables.order.total, 19.9);
  assert.equal(variables.order.items[0].sku, 'A-1');
  for (const key of ['password', 'resetPasswordToken', 'login_token', 'otp', 'code', 'apiKey']) {
    assert.equal(variables[key], privacy.MASK, key);
  }
  assert.equal(variables.order.couponCode, privacy.MASK);
  assert.ok(maskedPaths.includes('order.couponCode'));
  assert.ok(maskedPaths.includes('password'));
});

test('masking: values that look like tokens are masked under neutral keys', () => {
  const { variables } = privacy.maskVariables({
    ref: JWT,
    session: 'x',
    hex: RESET_TOKEN,
    uuid: '3f2b8c1e-9a4d-4e5f-8b6a-1c2d3e4f5a6b',
    random: MAGIC_TOKEN,
    sentence: 'Your order has been shipped and will arrive soon.',
    email: 'anna.beispiel@example.test',
    id: 'order-2026-000123',
  });
  assert.equal(variables.ref, privacy.MASK);
  assert.equal(variables.hex, privacy.MASK);
  assert.equal(variables.uuid, privacy.MASK);
  assert.equal(variables.random, privacy.MASK);
  assert.equal(variables.sentence, 'Your order has been shipped and will arrive soon.');
  assert.equal(variables.email, 'anna.beispiel@example.test');
  assert.equal(variables.id, 'order-2026-000123');
});

test('masking: Strapi reset, confirmation and magic links keep the URL but lose the token', () => {
  const { variables, maskedPaths } = privacy.maskVariables({
    link: `https://app.example.test/reset-password?code=${RESET_TOKEN}`,
    activation: `https://cms.example.test/api/auth/email-confirmation?confirmation=${RESET_TOKEN}`,
    signIn: `https://app.example.test/magic?loginToken=${MAGIC_TOKEN}&lang=de`,
    verifyPage: `https://app.example.test/verify/${MAGIC_TOKEN}`,
    plain: 'https://shop.example.test/products?page=2',
    note: `Open https://app.example.test/reset-password?code=${RESET_TOKEN} today`,
  });
  assert.equal(variables.link, `https://app.example.test/reset-password?code=${privacy.MASK}`);
  assert.equal(
    variables.activation,
    `https://cms.example.test/api/auth/email-confirmation?confirmation=${privacy.MASK}`
  );
  assert.equal(
    variables.signIn,
    `https://app.example.test/magic?loginToken=${privacy.MASK}&lang=de`
  );
  assert.equal(variables.verifyPage, `https://app.example.test/verify/${privacy.MASK}`);
  assert.equal(variables.plain, 'https://shop.example.test/products?page=2');
  assert.equal(
    variables.note,
    `Open https://app.example.test/reset-password?code=${privacy.MASK} today`
  );
  for (const key of ['link', 'activation', 'signIn', 'verifyPage', 'note']) {
    assert.ok(maskedPaths.includes(key), key);
  }
  assert.ok(!JSON.stringify(variables).includes(RESET_TOKEN));
  assert.ok(!JSON.stringify(variables).includes(MAGIC_TOKEN));
});

test('masking: the denylist masks, the allowlist keeps readable but never unmasks JWTs or token links', () => {
  const data = {
    customerRef: 'CR-1',
    nested: { internalNote: 'call back' },
    trackingCode: 'DHL-123',
    hash: JWT,
    link: `https://app.example.test/reset-password?code=${RESET_TOKEN}`,
  };
  const { variables } = privacy.maskVariables(data, {
    denylist: ['customerRef', 'nested.internalNote'],
    allowlist: ['trackingCode', 'hash', 'link'],
  });
  assert.equal(variables.customerRef, privacy.MASK);
  assert.equal(variables.nested.internalNote, privacy.MASK);
  assert.equal(variables.trackingCode, 'DHL-123');
  assert.equal(variables.hash, privacy.MASK, 'JWT stays masked');
  assert.equal(variables.link, `https://app.example.test/reset-password?code=${privacy.MASK}`);
});

test('masking: bounded output, prototype keys dropped, oversized data marked', () => {
  const deep = {};
  let cursor = deep;
  for (let i = 0; i < 20; i += 1) cursor = cursor.next = {};
  const result = privacy.maskVariables({
    deep,
    long: 'x'.repeat(20_000),
    list: Array.from({ length: 500 }, (_, i) => i),
    ['__proto__']: { polluted: true },
  });
  assert.equal(result.truncated, true);
  assert.equal(result.variables.long.length, privacy.LIMITS.stringLength);
  assert.equal(result.variables.list.length, privacy.LIMITS.itemsPerArray);
  assert.equal({}.polluted, undefined);
  const huge = privacy.maskVariables({
    rows: Array.from({ length: 200 }, (_, i) => ({ text: `row ${i} `.repeat(60) })),
  });
  assert.equal(huge.tooLarge, true);
  assert.deepEqual(huge.variables, {});
});

test('masking: HTML bodies lose token links (also with &amp;) and every masked value', () => {
  const html =
    `<p>Hi</p><a href="https://app.example.test/reset?lang=de&amp;code=${RESET_TOKEN}">Reset</a>` +
    '<p>Your code: 482913</p>';
  const out = privacy.maskStoredBody(html, ['482913']);
  assert.ok(!out.includes(RESET_TOKEN));
  assert.ok(!out.includes('482913'));
  assert.ok(out.includes(`https://app.example.test/reset?lang=de&amp;code=${privacy.MASK}`));
});

test('masking: adversarial input stays linear (ReDoS budget)', () => {
  const inputs = [
    `https://${'a'.repeat(50_000)}`,
    `eyJ${'A'.repeat(50_000)}.`,
    `${'a'.repeat(50_000)}!`,
    `https://x.example.test/?${'a=&'.repeat(20_000)}`,
  ];
  for (const input of inputs) {
    const started = process.hrtime.bigint();
    privacy.maskText(input);
    privacy.maskVariables({ value: input });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1000, `took ${ms} ms`);
  }
});

// ------------------------------------------------------- strapi double

/**
 * Strapi double with the real email-router, email-designer and
 * email-content services, a captured provider send and an in-memory
 * email-content table behind strapi.db.query.
 */
function setup({ settings = {}, config = {} } = {}) {
  const contents = [];
  let nextId = 1;
  const db = {
    query(uid) {
      assert.equal(uid, CONTENT_UID);
      const match = (row, where = {}) =>
        Object.entries(where).every(([key, cond]) => {
          if (cond && typeof cond === 'object') {
            if (cond.$in) return cond.$in.includes(row[key]);
            if (cond.$lt) return new Date(row[key]) < cond.$lt;
          }
          return row[key] === cond;
        });
      return {
        create: async ({ data }) => {
          const row = {
            id: nextId++,
            createdAt: new Date(),
            ...JSON.parse(JSON.stringify(data)),
          };
          contents.push(row);
          return row;
        },
        findOne: async ({ where }) => contents.find((row) => match(row, where)) || null,
        findMany: async ({ where, limit }) =>
          contents.filter((row) => match(row, where)).slice(0, limit),
        deleteMany: async ({ where }) => {
          let count = 0;
          for (let i = contents.length - 1; i >= 0; i -= 1) {
            if (match(contents[i], where)) {
              contents.splice(i, 1);
              count += 1;
            }
          }
          return { count };
        },
      };
    },
  };
  const template = {
    id: 1,
    documentId: 'tpl1',
    templateReferenceId: 1001,
    name: 'Password help',
    subject: 'Hello {{firstName}}',
    bodyHtml:
      '<html><body><h1>Hello {{firstName}}</h1><p>Total: {{order.total}} &amp; more</p>' +
      '<a href="{{link}}">Open</a><p>{{system.year}}</p><script>x()</script></body></html>',
    bodyText: 'Hello {{firstName}}, open {{link}}',
    category: 'transactional',
    isActive: true,
  };
  const ctx = createStrapi({
    localTemplates: [template],
    db,
    config: { 'plugin::magic-mail.tracking.logRetentionDays': 0, ...config },
  });
  const { strapi } = ctx;
  const services = {};
  const originalPlugin = strapi.plugin.bind(strapi);
  strapi.plugin = (name) => {
    const plugin = originalPlugin(name);
    if (name !== 'magic-mail') return plugin;
    return {
      service: (serviceName) => services[serviceName] || plugin.service(serviceName) || undefined,
    };
  };
  ctx.service('plugin-settings').getSettings = async () => ({ ...settings });
  delete require.cache[require.resolve('../server/src/services/email-content')];
  services['email-content'] = require('../server/src/services/email-content')({ strapi });

  const sent = [];
  const router = ctx.service('email-router');
  router.selectAccount = async () => ({
    documentId: 'acc1',
    name: 'Synthetic SMTP',
    provider: 'smtp',
    fromEmail: 'noreply@example.test',
    isActive: true,
  });
  router.sendViaAccount = async (_account, emailData) => {
    sent.push({ html: emailData.html, text: emailData.text, subject: emailData.subject });
    return { messageId: '<m1@example.test>' };
  };
  // Tracking adds a pixel and rewrites links, like the real analytics service.
  ctx.service('analytics').addTracking = async (html, emailId, recipientHash, { applied }) => {
    if (applied) {
      applied.opens = true;
      applied.clicks = true;
    }
    return `${html.replace(
      /href="[^"]*"/g,
      `href="https://cms.example.test/api/magic-mail/track/click/${emailId}/l1/${recipientHash}"`
    )}<img src="https://cms.example.test/api/magic-mail/track/open/${emailId}/${recipientHash}" width="1" height="1">`;
  };
  // Delivery logs with real-looking 32-hex email ids.
  const analytics = ctx.service('analytics');
  const createLog = analytics.createEmailLog;
  analytics.createEmailLog = async (data) => {
    const entry = await createLog(data);
    entry.emailId = require('node:crypto').randomBytes(16).toString('hex');
    return entry;
  };
  const opened = [];
  ctx.service('analytics').recordOpen = async (...args) => opened.push(args);
  ctx.service('analytics').recordClick = async (...args) => opened.push(args);

  return {
    ...ctx,
    contents,
    sent,
    opened,
    template,
    content: services['email-content'],
    router,
  };
}

const send = (env, templateData, extra = {}) =>
  env.router.send({
    to: 'anna.beispiel@example.test',
    templateReferenceId: 1001,
    templateData,
    ...extra,
  });

// ------------------------------------------------------------ store time

test('store time: the database row never holds a secret, also not for core mails', async () => {
  const env = setup();
  await send(env, {
    firstName: 'Anna',
    order: { total: 42 },
    link: `https://app.example.test/reset-password?code=${RESET_TOKEN}`,
    resetToken: RESET_TOKEN,
    session: JWT,
  });
  // users-permissions reset password (native interception, no template).
  await env.router.send(
    {
      to: 'ben.muster@example.test',
      subject: 'Reset password',
      html: `<p><a href="https://app.example.test/reset-password?code=${RESET_TOKEN}">Reset</a></p>`,
    },
    {
      source: 'strapi-email',
      coreMailVariables: {
        URL: 'https://app.example.test/reset-password',
        TOKEN: RESET_TOKEN,
        USER: { id: 7, email: 'ben.muster@example.test', username: 'ben' },
      },
    }
  );
  assert.equal(env.contents.length, 2);
  const stored = JSON.stringify(env.contents);
  assert.ok(!stored.includes(RESET_TOKEN), 'reset token never stored');
  assert.ok(!stored.includes(JWT), 'JWT never stored');
  const [templated, core] = env.contents;
  assert.equal(templated.variablesState, 'stored');
  assert.equal(templated.variables.firstName, 'Anna');
  assert.equal(templated.variables.resetToken, privacy.MASK);
  assert.equal(templated.templateDocumentId, 'tpl1');
  assert.equal(templated.templateHash, templateContentHash(env.template));
  assert.equal(templated.copyState, 'none');
  assert.equal(templated.htmlCopy, null);
  assert.equal(core.variables.TOKEN, privacy.MASK);
  assert.equal(core.variables.USER.email, 'ben.muster@example.test');
  assert.equal(core.templateDocumentId, null);
});

test('store time: the optional full copy is masked and compressed; variables can be turned off', async () => {
  const env = setup({ settings: { storeFullEmail: true, storeEmailVariables: false } });
  await send(env, {
    firstName: 'Anna',
    link: `https://app.example.test/magic?loginToken=${MAGIC_TOKEN}`,
    otp: '482913',
  });
  const [row] = env.contents;
  assert.equal(row.variablesState, 'disabled');
  assert.equal(row.variables, null);
  assert.equal(row.copyState, 'stored');
  const html = preview.decompressCopy(row.htmlCopy);
  assert.match(html, /Hello Anna/);
  assert.ok(!html.includes(MAGIC_TOKEN));
  assert.ok(!JSON.stringify(row).includes(MAGIC_TOKEN));
  assert.ok(!preview.decompressCopy(row.textCopy).includes(MAGIC_TOKEN));
  // The stored copy is the body before tracking: no pixel, no click redirect.
  assert.ok(!html.includes('/magic-mail/track/'));
});

// --------------------------------------------------------------- re-render

test('re-render: equals the HTML and text that were sent (before tracking)', async () => {
  const env = setup();
  const data = { firstName: 'Anna <b>', order: { total: 42 }, link: 'https://shop.example.test/a' };
  await send(env, data);
  const [row] = env.contents;
  const rendered = await env.content.rerender(row);
  // What went to the provider = re-render + tracking.
  const sent = env.sent[0];
  const untracked = sent.html
    .replace(
      /https:\/\/cms\.example\.test\/api\/magic-mail\/track\/click\/[a-f0-9]+\/l1\/[^"]+/g,
      'https://shop.example.test/a'
    )
    .replace(/<img src="https:\/\/cms\.example\.test\/api\/magic-mail\/track\/open\/[^>]+>$/, '');
  assert.equal(rendered.html, untracked);
  assert.equal(rendered.text, sent.text);
  assert.equal(rendered.subject, sent.subject);
  assert.doesNotMatch(rendered.html, /<script/);
  assert.match(rendered.html, /Hello Anna &lt;b&gt;/);
});

test('re-render: an older template version is found by its hash; a deleted one is reported', async () => {
  const env = setup();
  await send(env, { firstName: 'Anna', link: 'https://shop.example.test/a' });
  const [row] = env.contents;
  // The template was edited later; v1 holds the content that was sent.
  const versions = env.tables['plugin::magic-mail.email-template-version'];
  versions.push({
    documentId: 'v1',
    versionNumber: 1,
    template: { documentId: 'tpl1' },
    subject: env.template.subject,
    bodyHtml: env.template.bodyHtml,
    bodyText: env.template.bodyText,
    name: env.template.name,
  });
  const stored = env.tables['plugin::magic-mail.email-template'][0];
  stored.bodyHtml = '<p>New design {{firstName}}</p>';

  const designer = env.service('email-designer');
  const originalFindMany = env.strapi.documents;
  env.strapi.documents = (uid) => {
    const docs = originalFindMany.call(env.strapi, uid);
    if (uid !== 'plugin::magic-mail.email-template-version') return docs;
    return {
      ...docs,
      findMany: async () => versions.filter((v) => v.template.documentId === 'tpl1'),
    };
  };
  const found = await designer.findRenderedContent('tpl1', row.templateHash);
  assert.equal(found.source, 'version');
  assert.equal(found.versionNumber, 1);

  const ok = await env.content.preview({ emailId: row.emailId, subject: 'Hello Anna' });
  assert.equal(ok.state, 'rerendered');
  assert.equal(ok.template.versionNumber, 1);
  assert.match(ok.html, /Hello Anna/);

  versions.length = 0; // version history deleted
  const missing = await env.content.preview({ emailId: row.emailId, subject: 'Hello Anna' });
  assert.equal(missing.state, 'templateMissing');
  assert.equal(missing.html, null);
  assert.equal(missing.subject, 'Hello Anna');
  assert.equal(missing.variables.firstName, 'Anna');
});

test('preview: logs without stored data say so (no retro-fill)', async () => {
  const env = setup();
  const result = await env.content.preview({ emailId: 'a'.repeat(32), subject: 'Old mail' });
  assert.equal(result.state, 'notStored');
  assert.equal(result.subject, 'Old mail');
  assert.equal(result.html, null);
  assert.equal(env.contents.length, 0);
});

// ---------------------------------------------------------------- tracking

test('preview never fires tracking: no tracking URL, no link, no remote image by default', async () => {
  const env = setup({ settings: { storeFullEmail: true } });
  await send(env, { firstName: 'Anna', link: 'https://shop.example.test/a' });
  const [row] = env.contents;
  // Even a stored copy that contains a pixel and tracked links is neutralised.
  row.htmlCopy = preview.compressCopy(env.sent[0].html);
  assert.match(env.sent[0].html, /magic-mail\/track\/open/);

  for (const allowImages of [false, true]) {
    const result = await env.content.preview(
      { emailId: row.emailId, subject: 'x' },
      { allowImages }
    );
    assert.equal(result.state, 'copy');
    assert.equal(result.exactCopy, true);
    assert.doesNotMatch(result.html, /magic-mail\/track/);
    assert.doesNotMatch(result.html, /\shref=/i);
    assert.doesNotMatch(result.html, /<script|<iframe|<form|http-equiv="refresh"/i);
    assert.match(result.html, /Content-Security-Policy/);
  }
  assert.equal(env.opened.length, 0, 'no open or click recorded');

  const doc = preview.toPreviewDocument(
    '<img src="https://cdn.example.test/logo.png"><p style="background:url(https://cdn.example.test/bg.png)">x</p>'
  );
  assert.doesNotMatch(doc.html, /cdn\.example\.test/);
  assert.equal(doc.blockedImages, 2);
  assert.match(doc.html, /img-src data:;/);
  const allowed = preview.toPreviewDocument('<img src="https://cdn.example.test/logo.png">', {
    allowImages: true,
  });
  assert.match(allowed.html, /cdn\.example\.test\/logo\.png/);
});

// ---------------------------------------------------------------- retention

test('retention: rows older than the setting are deleted; log retention caps it', async () => {
  const env = setup({ settings: { emailContentRetentionDays: 30 } });
  await send(env, { firstName: 'A' });
  await send(env, { firstName: 'B' });
  await send(env, { firstName: 'C' });
  const day = 24 * 60 * 60 * 1000;
  env.contents[0].createdAt = new Date(Date.now() - 31 * day);
  env.contents[1].createdAt = new Date(Date.now() - 10 * day);
  assert.equal(await env.content.purgeExpired(), 1);
  assert.equal(env.contents.length, 2);

  const capped = setup({
    settings: { emailContentRetentionDays: 30 },
    config: { 'plugin::magic-mail.tracking.logRetentionDays': 7 },
  });
  await send(capped, { firstName: 'A' });
  capped.contents[0].createdAt = new Date(Date.now() - 8 * day);
  assert.equal(await capped.content.purgeExpired(), 1);

  const { contentSettings } = require('../server/src/services/email-content');
  assert.equal(contentSettings({}).retentionDays, 30, 'pre-4.11 settings rows default to 30');
  assert.equal(contentSettings({}).storeVariables, true);
  assert.equal(contentSettings({}).storeFull, false);
});

test('retention: deleting logs deletes their preview rows', async () => {
  const env = setup();
  await send(env, { firstName: 'A' });
  const removed = await env.content.deleteForEmailIds([env.contents[0].emailId, 'not-an-id']);
  assert.equal(removed, 1);
  assert.equal(env.contents.length, 0);
});

// --------------------------------------------------------------------- RBAC

test('RBAC: the content route needs read AND content.read; without content.read the policy denies (403)', () => {
  const routes = require('../server/src/routes/admin').routes;
  const route = routes.find((r) => r.path === '/analytics/emails/:emailId/content');
  assert.ok(route);
  const policy = route.config.policies.find((p) => p.name === 'admin::hasPermissions');
  assert.deepEqual(policy.config.actions, [
    'plugin::magic-mail.read',
    'plugin::magic-mail.content.read',
  ]);
  const hasPermissions = require(
    path.join(
      path.dirname(require.resolve('@strapi/admin/package.json')),
      'dist/server/server/src/policies/hasPermissions.js'
    )
  );
  const handler = hasPermissions.handler || hasPermissions.default?.handler;
  const ctxFor = (granted) => ({
    state: { userAbility: { can: (action) => granted.includes(action) } },
  });
  assert.equal(handler(ctxFor(['plugin::magic-mail.read']), policy.config), false);
  assert.equal(
    handler(ctxFor(['plugin::magic-mail.read', 'plugin::magic-mail.content.read']), policy.config),
    true
  );
  // The log detail (Overview) stays on read only.
  const detail = routes.find((r) => r.path === '/analytics/emails/:emailId' && r.method === 'GET');
  const detailPolicy = detail.config.policies.find((p) => p.name === 'admin::hasPermissions');
  assert.equal(handler(ctxFor(['plugin::magic-mail.read']), detailPolicy.config), true);
});

test('GraphQL shadow CRUD stays disabled for the new content type', () => {
  const { disableGraphqlShadowCrud } = require('../server/src/register');
  const disabled = [];
  const uids = disableGraphqlShadowCrud({
    plugin: (name) =>
      name === 'graphql'
        ? {
            service: () => ({
              shadowCRUD: (uid) => ({ disable: () => disabled.push(uid) }),
            }),
          }
        : null,
  });
  assert.ok(uids.includes(CONTENT_UID));
  assert.ok(disabled.includes(CONTENT_UID));
  const schema = require('../server/src/content-types/email-content/schema.json');
  for (const [name, attribute] of Object.entries(schema.attributes)) {
    assert.equal(attribute.private, true, `${name} is private (never in Content API output)`);
  }
});

test('Load images: the admin CSP decides whether remote images can appear', () => {
  const { remoteImagesAllowedByCsp } = require('../server/src/services/email-content');
  const host = (middlewares) => ({ config: { get: () => middlewares } });
  assert.equal(remoteImagesAllowedByCsp(host(['strapi::security'])), 'none', 'Strapi default');
  const withImg = (imgSrc) => [
    {
      name: 'strapi::security',
      config: { contentSecurityPolicy: { directives: { 'img-src': imgSrc } } },
    },
  ];
  assert.equal(remoteImagesAllowedByCsp(host(withImg(["'self'", 'data:', 'blob:']))), 'none');
  assert.equal(remoteImagesAllowedByCsp(host(withImg(["'self'", 'cdn.example.test']))), 'some');
  assert.equal(remoteImagesAllowedByCsp(host(withImg(["'self'", 'https:']))), 'all');
});

test('admin helpers: "Not tracked" only when tracking was not applied; hint and template name', async () => {
  const ui = await import('../admin/src/utils/emailPreview.mjs');
  const applied = (opens, clicks) => ({ metadata: { trackingApplied: { opens, clicks } } });
  assert.equal(ui.trackingCell({ ...applied(false, false), openCount: 0 }, 'opens'), 'notTracked');
  assert.equal(ui.trackingCell({ ...applied(true, false), openCount: 0 }, 'opens'), 'count');
  assert.equal(ui.trackingCell({ ...applied(true, false), clickCount: 0 }, 'clicks'), 'notTracked');
  assert.equal(ui.trackingCell({ openCount: 0 }, 'opens'), 'count', 'older logs keep the count');
  assert.equal(
    ui.trackingCell({ ...applied(false, false), providerTracking: true }, 'opens'),
    'count'
  );
  assert.equal(
    ui.trackingHint({ openTracking: false, linkTracking: false, publicUrl: true }),
    'off'
  );
  assert.equal(
    ui.trackingHint({ openTracking: true, linkTracking: true, publicUrl: false }),
    'noPublicUrl'
  );
  assert.equal(ui.trackingHint({ openTracking: true, linkTracking: false, publicUrl: true }), null);
  assert.equal(ui.trackingHint(null), null);
  const short = ui.shortTemplateName('Order confirmation (customer, DE + EN, with tracking link)');
  assert.equal(short.shortened, true);
  assert.ok(short.text.length <= 28);
  assert.equal(ui.shortTemplateName('Welcome').shortened, false);
  assert.equal(ui.countVariables({ a: 1, b: { c: 2, d: [3, 4] } }), 4);
  assert.deepEqual(ui.truncateValue('x'.repeat(200), 10), {
    text: `${'x'.repeat(10)}…`,
    truncated: true,
  });
});
