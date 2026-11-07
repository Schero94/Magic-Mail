'use strict';

/**
 * Mailgun EU/US region: stored as config.region ("us" | "eu"), validated on
 * create/update, default US for accounts saved without a region.
 * Synthetic data only: fetch is stubbed, no request leaves the process.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
const KEY = 'k'.repeat(32);

const {
  mailgunApiBaseUrl,
  resolveMailgunRegion,
  MAILGUN_REGIONS,
} = require('../server/src/utils/mailgun-region');

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

function loadRouter() {
  delete require.cache[require.resolve('../server/src/services/email-router')];
  return require('../server/src/services/email-router')({ strapi: { log: quietLog } });
}

/** Sends one synthetic message and returns the URL fetch was called with. */
async function sendWithConfig(config) {
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const router = loadRouter();
  const originalFetch = global.fetch;
  let url = null;
  global.fetch = async (target) => {
    url = target;
    return { ok: true, status: 200, json: async () => ({ id: 'mg-1' }), text: async () => '' };
  };
  try {
    await router.sendViaMailgun(
      {
        name: 'mg',
        provider: 'mailgun',
        fromEmail: 'from@example.test',
        config: encryptCredentials({
          apiKey: 'key-synthetic',
          domain: 'mg.example.test',
          ...config,
        }),
      },
      { to: 'a@example.test', subject: 'Hi', text: 'body' }
    );
    return url;
  } finally {
    global.fetch = originalFetch;
  }
}

test('region helper accepts only us and eu, defaulting to us', () => {
  assert.deepEqual([...MAILGUN_REGIONS], ['us', 'eu']);
  assert.equal(resolveMailgunRegion(undefined), 'us');
  assert.equal(resolveMailgunRegion(null), 'us');
  assert.equal(resolveMailgunRegion(''), 'us');
  assert.equal(resolveMailgunRegion('us'), 'us');
  assert.equal(resolveMailgunRegion('eu'), 'eu');
  for (const bad of ['EU', 'de', 'api.evil.test', 1, true, {}]) {
    assert.equal(resolveMailgunRegion(bad), null, `rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(mailgunApiBaseUrl('us'), 'https://api.mailgun.net');
  assert.equal(mailgunApiBaseUrl('eu'), 'https://api.eu.mailgun.net');
});

test('Mailgun sends to the US endpoint without a region (backward compatible)', async () => {
  await withKey(async () => {
    const url = await sendWithConfig({});
    assert.equal(url, 'https://api.mailgun.net/v3/mg.example.test/messages');
  });
});

test('Mailgun sends to the region endpoint for us and eu', async () => {
  await withKey(async () => {
    assert.equal(
      await sendWithConfig({ region: 'us' }),
      'https://api.mailgun.net/v3/mg.example.test/messages'
    );
    assert.equal(
      await sendWithConfig({ region: 'eu' }),
      'https://api.eu.mailgun.net/v3/mg.example.test/messages'
    );
  });
});

test('Mailgun refuses an unsupported stored region instead of guessing a host', async () => {
  await withKey(async () => {
    await assert.rejects(sendWithConfig({ region: 'api.evil.test' }), /region/i);
  });
});

function makeStrapi(accounts = []) {
  const table = accounts;
  return {
    log: quietLog,
    documents: () => ({
      findOne: async ({ documentId }) => table.find((row) => row.documentId === documentId) || null,
      findMany: async () => [],
      create: async ({ data }) => {
        const row = { documentId: `d${table.length + 1}`, ...data };
        table.push(row);
        return row;
      },
      update: async ({ documentId, data }) => {
        const row = table.find((r) => r.documentId === documentId);
        Object.assign(row, data);
        return { ...row };
      },
    }),
  };
}

const baseAccount = {
  name: 'Mailgun EU',
  provider: 'mailgun',
  fromEmail: 'from@example.test',
};

test('createAccount validates the Mailgun region server-side', async () => {
  await withKey(async () => {
    const { decryptCredentials } = require('../server/src/utils/encryption');
    const manager = require('../server/src/services/account-manager')({ strapi: makeStrapi() });

    await assert.rejects(
      manager.createAccount({
        ...baseAccount,
        config: { apiKey: 'key-synthetic', domain: 'mg.example.test', region: 'asia' },
      }),
      (err) => err.name === 'ValidationError' && /region/.test(err.message)
    );

    const eu = await manager.createAccount({
      ...baseAccount,
      config: { apiKey: 'key-synthetic', domain: 'mg.example.test', region: 'eu' },
    });
    assert.equal(decryptCredentials(eu.config).region, 'eu');

    const legacy = await manager.createAccount({
      ...baseAccount,
      config: { apiKey: 'key-synthetic', domain: 'mg.example.test' },
    });
    assert.equal(decryptCredentials(legacy.config).region, undefined);
  });
});

test('updateAccount validates the region against the stored provider and keeps the API key', async () => {
  await withKey(async () => {
    const { encryptCredentials, decryptCredentials } = require('../server/src/utils/encryption');
    const accounts = [
      {
        documentId: 'mg1',
        ...baseAccount,
        config: encryptCredentials({ apiKey: 'key-synthetic', domain: 'mg.example.test' }),
      },
    ];
    const manager = require('../server/src/services/account-manager')({
      strapi: makeStrapi(accounts),
    });

    await assert.rejects(
      manager.updateAccount('mg1', { config: { region: 'EU' } }),
      (err) => err.name === 'ValidationError'
    );

    await manager.updateAccount('mg1', {
      config: { apiKey: '********', domain: 'mg.example.test', region: 'eu' },
    });
    const stored = decryptCredentials(accounts[0].config);
    assert.equal(stored.region, 'eu');
    assert.equal(stored.apiKey, 'key-synthetic', 'switching the region keeps the stored key');
  });
});

test('account wizard sends and restores the Mailgun region', () => {
  const { loadAdminModule } = require('./helpers/load-admin-module');
  const wizard = loadAdminModule('admin/src/components/AccountWizard/wizardState.js');
  const empty = wizard.createEmptyForm();
  assert.equal(empty.mailgunRegion, 'us', 'new accounts default to US');

  const form = { ...empty, apiKey: 'key-synthetic', mailgunDomain: 'mg.example.test' };
  assert.equal(wizard.buildConfig('mailgun', form).region, 'us');
  assert.equal(wizard.buildConfig('mailgun', { ...form, mailgunRegion: 'eu' }).region, 'eu');

  assert.equal(wizard.accountToForm({ config: { region: 'eu' } }).mailgunRegion, 'eu');
  assert.equal(
    wizard.accountToForm({ config: { domain: 'mg.example.test' } }).mailgunRegion,
    'us',
    'accounts saved without a region show US'
  );
});
