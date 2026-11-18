'use strict';

// Contract tests: every request the plugin builds for SendGrid and Mailgun,
// and every response of the fake servers, is validated against the official
// OpenAPI documents (vendored, pinned by SHA-256 in tests/fixtures/openapi):
// - SendGrid: github.com/twilio/sendgrid-oai spec/json tsg_templates_v3.json
//   and tsg_mail_v3.json at commit 51a0dee5a218634f0775cdc589e3d728136674de
// - Mailgun: the official API reference bundle
//   documentation.mailgun.com/_bundle/docs/mailgun/api-reference/send/mailgun.json
// Covered: template list with pagination, template detail, send with
// template_id + dynamic_template_data, Mailgun domain and account template
// list/detail, send with template + t:variables, EU base URLs, local-template
// sends (regression) and the sandbox / test-mode switches used by the live suite.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createState,
  redirectProviderFetch,
  startFakeProviders,
} = require('./helpers/fake-template-providers');
const { createStrapi } = require('./helpers/provider-template-strapi');
const { OpenApiContract, fixtureSha256 } = require('./helpers/openapi-contract');
const { encryptCredentials } = require('../server/src/utils/encryption');

// Pinned copies: a changed vendored file must be a reviewed re-extraction.
const PINNED = {
  'sendgrid-templates': {
    source: 'd38d9f0cd014ea2d2ac12738f155e969a8f81ca03d85bbcaa959048c15b05a3c',
  },
  'sendgrid-mail': {
    source: '1bf9b256780b4c32a48e054eb9a8f93c03b586f9586d12b0ebbcdde9c170fac3',
  },
  mailgun: { source: '3bf29afd36c06a9a7998ed492838ed3fd4a1f4578799af285998ad73de1f8151' },
};

/**
 * Places where the official OpenAPI document contradicts the provider's own
 * documentation or long-standing API behaviour. Each one is listed, explained
 * and re-checked by the opt-in live suite (tests/live); everything else must
 * match the spec exactly.
 */
const KNOWN_DEVIATIONS = [
  {
    contract: 'sendgrid-templates',
    pattern: /^response(\/result\/\d+)?\/id must NOT have fewer than 36 characters$/,
    reason:
      'The spec types every template id as a 36-character UUID; dynamic template ids are "d-" plus 32 hex characters (34), as the Mail Send reference says ("If a template ID begins with d-, it is a dynamic template").',
  },
  {
    contract: 'mailgun',
    pattern: /^form\/ must have required property 'subject'$/,
    reason:
      'The spec lists subject as required, but the same field description says: "not required if sending with a template that has a pre-set Subject header". Magic Mail sends subject only when set or when the template has none.',
  },
  {
    contract: 'sendgrid-mail',
    pattern: /^body\/custom_args must be string$/,
    reason:
      'Pre-existing (4.5.0 and earlier, unchanged; see the golden payloads): Magic Mail sends top-level custom_args as an object of strings. The spec types it as a string; the personalization-level custom_args is an object.',
  },
];

const withoutKnown = (contract, errors) =>
  errors.filter(
    (error) => !KNOWN_DEVIATIONS.some((d) => d.contract === contract.name && d.pattern.test(error))
  );

const contracts = {
  sgTemplates: new OpenApiContract('sendgrid-templates'),
  sgMail: new OpenApiContract('sendgrid-mail'),
  mailgun: new OpenApiContract('mailgun'),
};

let fake;
let state;
let restoreRedirect;
let exchanges;
let previousKey;

test.before(async () => {
  previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'c'.repeat(32);
  state = createState();
  fake = await startFakeProviders(state);
  restoreRedirect = redirectProviderFetch(fake.port);
  const redirected = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const entry = { method: init.method || 'GET', url };
    if (init.body instanceof FormData) {
      entry.form = [...init.body.entries()].map(([k, v]) => [
        k,
        typeof v === 'string' ? v : '<file>',
      ]);
    } else if (typeof init.body === 'string') {
      entry.json = JSON.parse(init.body);
    }
    const response = await redirected(input, init);
    entry.status = response.status;
    const text = await response.clone().text();
    try {
      entry.response = text ? JSON.parse(text) : undefined;
    } catch {
      entry.response = undefined;
    }
    exchanges.push(entry);
    return response;
  };
});

test.after(async () => {
  // Every recorded exchange was checked as a request and as a response.
  console.log(`contract-checked provider exchanges: ${checkedExchanges}`);
  restoreRedirect();
  await fake.close();
  if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
});

function reset() {
  const fresh = createState();
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
  exchanges = [];
}

const contractFor = (url) => {
  const { host, pathname } = new URL(url);
  if (host.includes('mailgun')) return contracts.mailgun;
  return pathname.startsWith('/v3/mail/') ? contracts.sgMail : contracts.sgTemplates;
};

/** Asserts that all recorded exchanges satisfy the official contracts. */
let checkedExchanges = 0;
function assertContracts(minimum) {
  checkedExchanges += exchanges.length;
  assert.ok(exchanges.length >= minimum, `expected at least ${minimum} provider calls`);
  for (const exchange of exchanges) {
    const contract = contractFor(exchange.url);
    const label = `${exchange.method} ${new URL(exchange.url).pathname}`;
    assert.deepEqual(
      withoutKnown(contract, contract.checkRequest(exchange)),
      [],
      `request ${label}`
    );
    assert.deepEqual(
      withoutKnown(contract, contract.checkResponse({ ...exchange, json: exchange.response })),
      [],
      `fake response ${label} (${exchange.status})`
    );
  }
}

function sgAccount(id, config = {}) {
  return {
    documentId: id,
    name: id,
    provider: 'sendgrid',
    fromEmail: `noreply@${id}.example.test`,
    isActive: true,
    priority: 5,
    config: encryptCredentials({ apiKey: `SG.${id}`, ...config }),
  };
}

function mgAccount(id, config = {}) {
  return {
    documentId: id,
    name: id,
    provider: 'mailgun',
    fromEmail: 'noreply@mg.example.test',
    isActive: true,
    priority: 4,
    config: encryptCredentials({ apiKey: `key-${id}`, domain: 'mg.example.test', ...config }),
  };
}

const sgTemplate = (id, name) => ({
  id,
  name,
  updated_at: '2026-11-10 08:30:00',
  versions: [
    {
      id: `${id.replace(/^d-/, '')}0000-0000-0000-0000-000000000000`.slice(0, 36),
      template_id: id,
      active: 1,
      name: 'v1',
      subject: 'Hi {{name}}',
      html_content: '<p>Hello {{name}}</p>',
      plain_content: 'Hello {{name}}',
      generate_plain_content: true,
      editor: 'code',
      updated_at: '2026-11-11 09:00:00',
    },
  ],
});

const mgTemplate = (name) => ({
  name,
  id: `${name}-0000`,
  createdAt: 'Mon, 10 Nov 2026 08:30:00 UTC',
  version: {
    tag: 'v1',
    template: '<p>Hi {{name}}</p>',
    engine: 'handlebars',
    mjml: '',
    comment: '',
    createdAt: 'Mon, 10 Nov 2026 08:30:00 UTC',
    active: true,
    id: `${name}-v1`,
    headers: { Subject: 'Welcome {{name}}' },
  },
});

test('vendored OpenAPI copies are the pinned extractions of the official documents', () => {
  for (const [name, pin] of Object.entries(PINNED)) {
    const source = new OpenApiContract(name).source;
    assert.equal(source.sha256, pin.source, `${name} source checksum`);
    assert.match(
      source.url,
      /^https:\/\/(raw\.githubusercontent\.com\/twilio\/sendgrid-oai\/51a0dee|documentation\.mailgun\.com\/)/
    );
    assert.match(fixtureSha256(name), /^[a-f0-9]{64}$/);
  }
  // The documented servers include the EU hosts the plugin uses.
  assert.deepEqual(contracts.sgTemplates.servers, ['api.sendgrid.com', 'api.eu.sendgrid.com']);
  assert.deepEqual(contracts.mailgun.servers, ['api.mailgun.net', 'api.eu.mailgun.net']);
});

test('every known spec deviation is still present in the vendored spec', () => {
  // When a provider fixes its spec, the deviation must be removed here.
  assert.ok(
    JSON.stringify(contracts.sgTemplates.spec).includes('"minLength":36'),
    'template id length'
  );
  assert.ok(
    JSON.stringify(contracts.mailgun.spec).includes('not required if sending with a template'),
    'mailgun subject'
  );
  assert.equal(
    contracts.sgMail.spec.components.requestBodies.PostMailSend.content['application/json'].schema
      .properties.custom_args.type,
    'string'
  );
});

test('the contract checker rejects undocumented fields and parameters', () => {
  assert.notDeepEqual(
    contracts.sgMail.checkRequest({
      method: 'POST',
      url: 'https://api.sendgrid.com/v3/mail/send',
      json: {
        personalizations: [{ to: [{ email: 'a@example.test' }] }],
        from: { email: 'b@example.test' },
        templateId: 'd-1',
      },
    }),
    []
  );
  assert.notDeepEqual(
    contracts.sgTemplates.checkRequest({
      method: 'GET',
      url: 'https://api.sendgrid.com/v3/templates?generations=dynamic&page_size=500',
    }),
    [],
    'page_size above 200'
  );
  assert.notDeepEqual(
    contracts.mailgun.checkRequest({
      method: 'POST',
      url: 'https://api.mailgun.net/v3/mg.example.test/messages',
      form: [
        ['from', 'a@example.test'],
        ['to', 'b@example.test'],
        ['template_variables', '{}'],
      ],
    }),
    []
  );
  assert.notDeepEqual(
    contracts.sgTemplates.checkRequest({
      method: 'GET',
      url: 'https://api.sendgrid.example/v3/templates?page_size=1',
    }),
    [],
    'unknown host'
  );
});

test('SendGrid: sync (paginated list + detail) and template send match the official contract', async () => {
  reset();
  state.sendgridPageSize = 1;
  state.sendgrid.us = [
    sgTemplate('d-11111111111111111111111111111111', 'Welcome'),
    sgTemplate('d-22222222222222222222222222222222', 'Receipt'),
  ];
  const h = createStrapi({ accounts: [sgAccount('sg1')] });
  await h.service('provider-templates').sync({ force: true });
  await h.service('email-router').send({
    to: 'a@example.test',
    providerTemplate: 'sendgrid:welcome',
    data: { name: 'Ada', items: [{ label: 'x' }], when: new Date(0) },
    replyTo: 'support@example.test',
    headers: { 'X-Campaign': 'contract' },
  });
  assert.ok(exchanges.some((e) => new URL(e.url).searchParams.get('page_token')));
  const send = exchanges.find((e) => e.url.endsWith('/v3/mail/send'));
  assert.equal(send.json.template_id, 'd-11111111111111111111111111111111');
  assert.deepEqual(send.json.personalizations[0].dynamic_template_data.items, [{ label: 'x' }]);
  assertContracts(5);
});

test('SendGrid EU: every request goes to the documented EU server', async () => {
  reset();
  state.sendgrid.eu = [sgTemplate('d-33333333333333333333333333333333', 'Welcome')];
  const h = createStrapi({ accounts: [sgAccount('sgeu', { region: 'eu' })] });
  await h.service('provider-templates').sync({ force: true });
  await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'sendgrid:welcome' });
  assert.ok(exchanges.every((e) => new URL(e.url).host === 'api.eu.sendgrid.com'));
  assertContracts(3);
});

test('Mailgun: domain and account template list/detail and template send match the official contract', async () => {
  reset();
  state.mailgunPageSize = 1;
  state.mailgun.eu.domains['mg.example.test'] = [mgTemplate('welcome'), mgTemplate('receipt')];
  state.mailgun.eu.account = [mgTemplate('shared')];
  const h = createStrapi({ accounts: [mgAccount('mg1', { region: 'eu' })] });
  await h.service('provider-templates').sync({ force: true });
  await h
    .service('email-router')
    .send({ to: 'a@example.test', providerTemplate: 'mailgun:welcome', data: { name: 'Ada' } });
  await h.service('email-router').send({
    to: 'a@example.test',
    providerTemplate: 'mailgun:shared',
    subject: 'Explicit',
    data: { name: 'Bo' },
    headers: { 'X-Campaign': 'contract' },
  });
  assert.ok(exchanges.some((e) => e.url.includes('/v4/templates')));
  assert.ok(exchanges.some((e) => new URL(e.url).searchParams.get('p')));
  assert.ok(exchanges.every((e) => new URL(e.url).host === 'api.eu.mailgun.net'));
  const sends = exchanges.filter((e) => e.url.endsWith('/messages'));
  assert.equal(sends.length, 2);
  assert.ok(sends.every((e) => e.form.some(([k]) => k === 't:variables')));
  assertContracts(8);
});

test('local-template sends (regression) also match the official send contracts', async () => {
  reset();
  const local = {
    documentId: 'tpl',
    templateReferenceId: 9,
    name: 'Local',
    subject: 'Hi {{name}}',
    bodyHtml: '<p>Hi {{name}}</p>',
    bodyText: '',
    category: 'transactional',
    isActive: true,
  };
  for (const account of [sgAccount('sg1'), mgAccount('mg1')]) {
    const h = createStrapi({ accounts: [account], localTemplates: [local] });
    await h.service('email-router').send({
      to: ['a@example.test', 'b@example.test'],
      cc: 'c@example.test',
      templateReferenceId: 9,
      templateData: { name: 'Ada' },
      type: 'marketing',
      unsubscribeUrl: 'https://example.test/unsub',
      attachments: [
        { filename: 'a.txt', content: 'aGk=', encoding: 'base64', contentType: 'text/plain' },
      ],
    });
  }
  assertContracts(2);
});

test('the live-suite switches are documented: SendGrid sandbox_mode and Mailgun o:testmode', () => {
  assert.deepEqual(
    contracts.sgMail.checkRequest({
      method: 'POST',
      url: 'https://api.sendgrid.com/v3/mail/send',
      json: {
        personalizations: [{ to: [{ email: 'a@example.test' }], dynamic_template_data: { a: 1 } }],
        from: { email: 'b@example.test' },
        template_id: 'd-11111111111111111111111111111111',
        mail_settings: { sandbox_mode: { enable: true } },
      },
    }),
    []
  );
  assert.deepEqual(
    contracts.mailgun
      .checkRequest({
        method: 'POST',
        url: 'https://api.mailgun.net/v3/mg.example.test/messages',
        form: [
          ['from', 'b@example.test'],
          ['to', 'a@example.test'],
          ['template', 'welcome'],
          ['t:variables', '{"a":1}'],
          ['o:testmode', 'yes'],
        ],
      })
      .filter((e) => !/required property 'subject'/.test(e)),
    []
  );
});
