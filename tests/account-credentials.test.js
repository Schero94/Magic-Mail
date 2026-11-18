'use strict';

/**
 * Account wizard credential checks (ACC-MG-01, ACC-MG-04, ACC-ERR-01,
 * ACC-MG-02/03, ACC-SG-02): Mailgun domain normalisation and validation on
 * save, trimmed webhook signing key, fixed provider error hints, wizard copy.
 * Synthetic data only; no request leaves the process.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdminModule, ROOT } = require('./helpers/load-admin-module');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const KEY = 'k'.repeat(32);
const LOCALES = ['en', 'de', 'fr', 'es', 'pt'];
const locales = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'admin/src/translations', `${locale}.json`), 'utf8')
    ),
  ])
);

async function withKey(fn) {
  const previous = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = KEY;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previous;
  }
}

function makeStrapi(accounts = [], send) {
  return {
    log: quietLog,
    documents: () => ({
      findOne: async ({ documentId }) =>
        accounts.find((row) => row.documentId === documentId) || null,
      findMany: async () => [],
      create: async ({ data }) => {
        const row = { documentId: `d${accounts.length + 1}`, ...data };
        accounts.push(row);
        return row;
      },
      update: async ({ documentId, data }) => {
        const row = accounts.find((r) => r.documentId === documentId);
        Object.assign(row, data);
        return { ...row };
      },
    }),
    plugin: () => ({ service: () => ({ send }) }),
  };
}

const mailgunAccount = { name: 'Mailgun', provider: 'mailgun', fromEmail: 'from@example.test' };

// Normalisation vectors shared by the server helper and its admin mirror.
const DOMAIN_VECTORS = [
  ['mg.example.test', 'mg.example.test', true],
  ['  MG.Example.TEST  ', 'mg.example.test', true],
  ['https://mg.example.test/', 'mg.example.test', true],
  ['http://mg.example.test//', 'mg.example.test', true],
  ['HTTPS://mg.example.test', 'mg.example.test', true],
  ['sandbox0123abcd.mailgun.org', 'sandbox0123abcd.mailgun.org', true],
  ['mg.example.test/v3', 'mg.example.test/v3', false],
  ['https://mg.example.test/messages/', 'mg.example.test/messages', false],
  ['mg example.test', 'mg example.test', false],
  ['localhost', 'localhost', false],
  ['-mg.example.test', '-mg.example.test', false],
  ['', '', false],
  [`${'a'.repeat(64)}.example.test`, `${'a'.repeat(64)}.example.test`, false],
];

// ---------------------------------------------------------------- ACC-MG-01

test('ACC-MG-01: the shared Mailgun domain helper normalises and validates host names', () => {
  const {
    normalizeMailgunDomain,
    isValidMailgunDomain,
    isMailgunSandboxDomain,
  } = require('../server/src/utils/mailgun-domain');
  for (const [input, normalised, valid] of DOMAIN_VECTORS) {
    assert.equal(normalizeMailgunDomain(input), normalised, `normalise ${JSON.stringify(input)}`);
    assert.equal(isValidMailgunDomain(input), valid, `validate ${JSON.stringify(input)}`);
  }
  for (const bad of [undefined, null, 42, {}]) {
    assert.equal(normalizeMailgunDomain(bad), '');
    assert.equal(isValidMailgunDomain(bad), false);
  }
  assert.equal(isMailgunSandboxDomain('sandbox0123abcd.mailgun.org'), true);
  assert.equal(isMailgunSandboxDomain('https://SANDBOX0123abcd.mailgun.org/'), true);
  assert.equal(isMailgunSandboxDomain('mg.example.test'), false);
  assert.equal(isMailgunSandboxDomain('sandbox0123abcd.mailgun.org.example.test'), false);
});

test('ACC-MG-01: trailing-slash stripping stays linear on adversarial input', () => {
  const { normalizeMailgunDomain } = require('../server/src/utils/mailgun-domain');
  const started = process.hrtime.bigint();
  normalizeMailgunDomain(`${'/'.repeat(50_000)}x`);
  normalizeMailgunDomain(`https://${'/'.repeat(50_000)}`);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 200, `took ${ms} ms`);
});

test('ACC-MG-01: the admin mirror agrees with the server helper', () => {
  const admin = loadAdminModule('admin/src/utils/mailgunDomain.mjs');
  const server = require('../server/src/utils/mailgun-domain');
  for (const [input] of DOMAIN_VECTORS) {
    assert.equal(admin.normalizeMailgunDomain(input), server.normalizeMailgunDomain(input));
    assert.equal(admin.isValidMailgunDomain(input), server.isValidMailgunDomain(input));
  }
});

test('ACC-MG-01: createAccount rejects an invalid Mailgun domain with a 400 ValidationError', async () => {
  await withKey(async () => {
    const manager = require('../server/src/services/account-manager')({ strapi: makeStrapi() });
    for (const domain of ['mg.example.test/v3', 'not a domain', '', undefined]) {
      await assert.rejects(
        manager.createAccount({ ...mailgunAccount, config: { apiKey: 'key-synthetic', domain } }),
        (err) =>
          err.name === 'ValidationError' &&
          Array.isArray(err.details?.config) &&
          err.details.config.some((line) => line.startsWith('domain:')) &&
          !String(err.message).includes('not a domain'),
        `rejects ${JSON.stringify(domain)}`
      );
    }
  });
});

test('ACC-MG-01: createAccount stores the normalised domain (scheme, slash, case, spaces)', async () => {
  await withKey(async () => {
    const { decryptCredentials } = require('../server/src/utils/encryption');
    const manager = require('../server/src/services/account-manager')({ strapi: makeStrapi() });
    const account = await manager.createAccount({
      ...mailgunAccount,
      config: { apiKey: '  key-synthetic  ', domain: ' https://MG.Example.test/ ' },
    });
    const stored = decryptCredentials(account.config);
    assert.equal(stored.domain, 'mg.example.test');
    assert.equal(stored.apiKey, 'key-synthetic', 'the API key is trimmed');
  });
});

test('ACC-MG-01: updateAccount validates and normalises config.domain', async () => {
  await withKey(async () => {
    const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');
    const accounts = [
      {
        documentId: 'mg1',
        ...mailgunAccount,
        // Saved before this fix: scheme and slash, failed at send time.
        config: encryptCredentials({ apiKey: 'key-synthetic', domain: 'https://mg.example.test/' }),
      },
    ];
    const manager = require('../server/src/services/account-manager')({
      strapi: makeStrapi(accounts),
    });

    await assert.rejects(
      manager.updateAccount('mg1', {
        config: { apiKey: '********', domain: 'mg.example.test/v3' },
      }),
      (err) =>
        err.name === 'ValidationError' && err.details.config.some((l) => l.startsWith('domain:'))
    );

    // Edits without a domain (e.g. only the name) are not blocked by a stored legacy value.
    await manager.updateAccount('mg1', { name: 'Renamed' });
    assert.equal(accounts[0].name, 'Renamed');

    // Fixing only the spelling of the same domain keeps the stored key.
    await manager.updateAccount('mg1', {
      config: { apiKey: '********', domain: 'HTTPS://mg.example.test//', region: 'us' },
    });
    const stored = decryptCredentials(accounts[0].config);
    assert.equal(stored.domain, 'mg.example.test');
    assert.equal(stored.apiKey, 'key-synthetic');

    // A different domain is still an identity change (SEC-04).
    await assert.rejects(
      manager.updateAccount('mg1', { config: { apiKey: '********', domain: 'mg2.example.test' } }),
      (err) => err.name === 'ValidationError' && /apiKey/.test(err.message)
    );
  });
});

// ---------------------------------------------------------------- ACC-MG-04

test('ACC-MG-04: a signing key stored with surrounding whitespace still verifies', () => {
  const { verifyMailgunSignature } = require('../server/src/utils/webhook-signatures');
  const signingKey = 'synthetic-mailgun-signing-key';
  const timestamp = '1700000000';
  const token = 'abcdefghij0123456789';
  // Known answer: hex HMAC-SHA256(key, timestamp + token), Mailgun securing-webhooks recipe.
  const signature = '80b25bf9414e10ef030b66759f92d25ea41af2104881b42b8d4cec54349bfeae';
  assert.equal(
    crypto.createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest('hex'),
    signature
  );
  const nowMs = Number(timestamp) * 1000;
  for (const stored of [signingKey, ` ${signingKey} `, `${signingKey}\n`, `\t${signingKey}\r\n`]) {
    assert.equal(
      verifyMailgunSignature({ signingKey: stored, timestamp, token, signature, nowMs }),
      true,
      `verifies with ${JSON.stringify(stored)}`
    );
  }
  for (const empty of ['', '   ', '\n', null]) {
    assert.equal(
      verifyMailgunSignature({ signingKey: empty, timestamp, token, signature, nowMs }),
      false
    );
  }
  assert.equal(
    verifyMailgunSignature({ signingKey: 'other-key', timestamp, token, signature, nowMs }),
    false
  );
});

test('ACC-MG-04/ACC-MG-01: the wizard trims the signing key and normalises the domain', () => {
  const wizard = loadAdminModule('admin/src/components/AccountWizard/wizardState.js');
  const form = {
    ...wizard.createEmptyForm(),
    apiKey: ' key-synthetic ',
    mailgunDomain: ' https://MG.example.test/ ',
    webhookSigningKey: '  signing-key \n',
  };
  const config = wizard.buildConfig('mailgun', form);
  assert.equal(config.domain, 'mg.example.test');
  assert.equal(config.webhookSigningKey, 'signing-key');
  assert.equal(config.apiKey, 'key-synthetic');
  // The stored-secret mask passes through unchanged.
  assert.equal(
    wizard.buildConfig('mailgun', { ...form, webhookSigningKey: '********' }).webhookSigningKey,
    '********'
  );
});

test('ACC-MG-01: the wizard blocks Continue and reports an invalid Mailgun domain', () => {
  const wizard = loadAdminModule('admin/src/components/AccountWizard/wizardState.js');
  const base = { ...wizard.createEmptyForm(), apiKey: 'key-synthetic' };
  const ctx = (mailgunDomain) => ({ provider: 'mailgun', form: { ...base, mailgunDomain } });
  assert.equal(wizard.canProceedStep(3, ctx('mg.example.test')), true);
  assert.equal(wizard.canProceedStep(3, ctx('https://mg.example.test/')), true);
  assert.equal(wizard.canProceedStep(3, ctx('mg.example.test/v3')), false);
  assert.equal(wizard.canProceedStep(3, ctx('')), false);
  assert.deepEqual(wizard.validateCredentials('mailgun', ctx('mg.example.test/v3').form), {
    mailgunDomain: 'invalid',
  });
  assert.deepEqual(wizard.validateCredentials('mailgun', ctx('').form), {});
  assert.deepEqual(wizard.validateCredentials('mailgun', ctx('https://mg.example.test/').form), {});
  assert.deepEqual(wizard.validateCredentials('sendgrid', ctx('bad value').form), {});
});

// ---------------------------------------------------------------- ACC-ERR-01

const providerError = (provider, status, extra = {}) =>
  Object.assign(new Error(`${provider} API request failed: ${status}`), { status }, extra);

test('ACC-ERR-01: provider and status map to fixed hint codes', () => {
  const { providerErrorHint } = require('../server/src/utils/client-errors');
  const cases = [
    [providerError('SendGrid', 401), 'SENDGRID_UNAUTHORIZED'],
    [providerError('SendGrid', 403), 'SENDGRID_FORBIDDEN'],
    [providerError('SendGrid', 413), 'SENDGRID_PAYLOAD_TOO_LARGE'],
    [providerError('SendGrid', 429), 'PROVIDER_RATE_LIMITED'],
    [providerError('Mailgun', 401), 'MAILGUN_UNAUTHORIZED'],
    [providerError('Mailgun', 404), 'MAILGUN_DOMAIN_NOT_FOUND'],
    [providerError('Mailgun', 429), 'PROVIDER_RATE_LIMITED'],
  ];
  for (const [error, code] of cases) {
    const hint = providerErrorHint(error);
    assert.equal(hint?.code, code, error.message);
    assert.equal(typeof hint.message, 'string');
  }
  // Without a known sandbox domain, 400/403 on Mailgun get no guessed hint.
  assert.equal(providerErrorHint(providerError('Mailgun', 400)), null);
  assert.equal(providerErrorHint(providerError('Mailgun', 403)), null);
  for (const status of [400, 403]) {
    assert.equal(
      providerErrorHint(providerError('Mailgun', status), {
        mailgunDomain: 'sandbox0123abcd.mailgun.org',
      })?.code,
      'MAILGUN_SANDBOX_RECIPIENT'
    );
    assert.equal(
      providerErrorHint(providerError('Mailgun', status), { mailgunDomain: 'mg.example.test' }),
      null
    );
  }
  assert.equal(providerErrorHint(providerError('SendGrid', 500)), null);
  assert.equal(providerErrorHint(new Error('weird internal 192.168.0.1')), null);
  assert.equal(providerErrorHint(Object.assign(new Error('x'), { status: 401 })), null);
  assert.equal(providerErrorHint(null), null);
});

test('ACC-ERR-01: error.provider (send-path contract) wins over the message text', () => {
  const { providerErrorHint } = require('../server/src/utils/client-errors');
  const tagged = Object.assign(new Error('Mailgun API request failed: 401'), {
    status: 401,
    provider: 'sendgrid',
  });
  assert.equal(providerErrorHint(tagged)?.code, 'SENDGRID_UNAUTHORIZED');
  const unknown = Object.assign(new Error('request failed'), { status: 401, provider: 'smtp' });
  assert.equal(providerErrorHint(unknown), null);
});

test('ACC-ERR-01: hints never contain provider body text or field paths', () => {
  const { providerErrorHint, toClientSendResult } = require('../server/src/utils/client-errors');
  const body = 'The from address does not match a verified Sender Identity: ceo@victim.example';
  const error = providerError('SendGrid', 403, {
    provider: 'sendgrid',
    body,
    responseBody: body,
    providerFields: ['from.email'],
    cause: new Error(body),
  });
  const hint = providerErrorHint(error);
  const result = toClientSendResult(error);
  const serialised = JSON.stringify({ hint, result });
  assert.doesNotMatch(serialised, /victim|ceo@|does not match|from\.email/);
  assert.equal(result.message, 'SendGrid API request failed: 403');
  assert.equal(result.hintCode, 'SENDGRID_FORBIDDEN');
  assert.equal(result.hint, hint.message);

  const plain = toClientSendResult(new Error('weird internal 192.168.0.1'));
  assert.deepEqual(Object.keys(plain), ['message']);
});

test('ACC-ERR-01: the account test response adds hintCode/hint without changing message', async () => {
  await withKey(async () => {
    const { encryptCredentials } = require('../server/src/utils/encryption');
    const accounts = [
      {
        documentId: 'mg1',
        ...mailgunAccount,
        config: encryptCredentials({
          apiKey: 'key-synthetic',
          domain: 'sandbox0123abcd.mailgun.org',
        }),
      },
    ];
    let failure = providerError('Mailgun', 403);
    const strapi = makeStrapi(accounts, async () => {
      throw failure;
    });
    const manager = require('../server/src/services/account-manager')({ strapi });
    manager.resolveDocumentId = async () => 'mg1';

    let result = await manager.testAccount('mg1', 'to@example.test');
    assert.equal(result.success, false);
    assert.equal(result.message, 'Mailgun API request failed: 403');
    assert.equal(result.hintCode, 'MAILGUN_SANDBOX_RECIPIENT');
    assert.match(result.hint, /authorized recipients/);

    failure = Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:2525'), {
      code: 'ECONNREFUSED',
    });
    result = await manager.testAccount('mg1', 'to@example.test');
    assert.equal(result.hintCode, undefined);
    assert.equal(result.hint, undefined);
  });
});

// ---------------------------------------------------------------- i18n + copy

test('ACC-ERR-01: every hint code has a translated admin message in all five locales', () => {
  const { PROVIDER_HINTS } = require('../server/src/utils/client-errors');
  const adminSource = fs.readFileSync(path.join(ROOT, 'admin/src/utils/providerHints.js'), 'utf8');
  const codes = Object.keys(PROVIDER_HINTS);
  assert.ok(codes.length >= 7);
  for (const code of codes) {
    const match = adminSource.match(
      new RegExp(`case '${code}':\\s*return t\\(\\s*'([^']+)',\\s*'((?:[^'\\\\]|\\\\.)*)'`)
    );
    assert.ok(match, `admin maps ${code}`);
    const key = match[1];
    assert.equal(
      locales.en[key],
      PROVIDER_HINTS[code],
      `${code}: server fallback equals en.json ${key}`
    );
    for (const locale of LOCALES) {
      assert.ok(locales[locale][key], `${locale} has ${key}`);
    }
  }
  for (const locale of LOCALES) {
    assert.ok(locales[locale]['accounts.test.failedWithHint'], `${locale} failedWithHint`);
    assert.match(locales[locale]['accounts.test.failedWithHint'], /\{reason\}/);
    assert.match(locales[locale]['accounts.test.failedWithHint'], /\{hint\}/);
  }
});

test('ACC-MG-02/03, ACC-SG-02: wizard guidance is least-privilege and consistent', () => {
  const credentials = fs.readFileSync(
    path.join(ROOT, 'admin/src/components/AccountWizard/CredentialsStep.jsx'),
    'utf8'
  );
  assert.doesNotMatch(credentials, /key-x{4,}/, 'no key-xxx placeholder');
  for (const locale of LOCALES) {
    const copy = locales[locale];
    const all = [
      copy['accountModal.mailgun.apiKeyHint'],
      copy['accountModal.mailgun.resourcesBody'],
      copy['accountModal.mailgun.domainHint'],
      copy['accountModal.sendgrid.apiKeyHint'],
      copy['accountModal.sendgrid.resourcesBody'],
    ].join(' ');
    assert.doesNotMatch(
      all,
      /validation key|Validierungsschl|validación|validation publique|validação/i
    );
    assert.doesNotMatch(all, /API Security, Private/);
    assert.match(copy['accountModal.mailgun.apiKeyHint'], /Domain Sending Key/);
    assert.match(copy['accountModal.mailgun.domainHint'], /sandbox/i);
    assert.match(copy['accountModal.sendgrid.resourcesBody'], /Mail Send/);
    assert.match(copy['accountModal.sendgrid.resourcesBody'], /Custom Access/);
    assert.match(copy['accountModal.sendgrid.resourcesBody'], /Sender Identity/);
    assert.ok(copy['accountModal.mailgun.domainInvalid'], `${locale} domainInvalid`);
    assert.ok(copy['accountModal.mailgun.domainNormalized'], `${locale} domainNormalized`);
    assert.match(copy['accountModal.mailgun.domainNormalized'], /\{domain\}/);
  }
  assert.match(locales.en['accountModal.mailgun.apiKeyHint'], /Account Settings, API Keys/);
  assert.match(locales.en['accountModal.mailgun.resourcesBody'], /Account Settings, API Keys/);
});
