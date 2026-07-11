'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

test('account DTOs never expose encrypted config or oauth blobs', () => {
  const { toAccountListDTO, toAccountEditDTO } = require('../server/src/utils/account-dto');
  const raw = {
    id: 1, documentId: 'doc-1', name: 'Primary', provider: 'gmail-oauth',
    fromEmail: 'a@b.c', isActive: true, config: 'ENCRYPTED_CONFIG', oauth: 'ENCRYPTED_OAUTH',
  };

  const list = toAccountListDTO(raw);
  assert.equal(list.config, undefined);
  assert.equal(list.oauth, undefined);
  assert.equal(list.hasCredentials, true);
  assert.equal(list.hasOAuth, true);
  assert.equal(list.name, 'Primary');

  const edit = toAccountEditDTO(raw, { clientSecret: '****abcd' }, { credentialsUnreadable: false });
  assert.deepEqual(edit.config, { clientSecret: '****abcd' });
  assert.equal(edit.oauth, undefined);
  assert.equal(edit.credentialsUnreadable, false);
});

test('getAllAccounts strips secret columns from every row', async () => {
  const strapi = {
    log: quietLog,
    documents: () => ({
      findMany: async () => [
        { id: 1, documentId: 'd1', name: 'A', provider: 'smtp', config: 'ENC', oauth: 'ENCO' },
      ],
    }),
  };
  const svc = require('../server/src/services/account-manager')({ strapi });
  const list = await svc.getAllAccounts();
  assert.equal(list[0].config, undefined);
  assert.equal(list[0].oauth, undefined);
  assert.equal(list[0].hasCredentials, true);
});

test('email log listing uses a field-limited user populate and Strapi start pagination', async () => {
  let capturedQuery;
  const strapi = {
    log: quietLog,
    documents: () => ({
      findMany: async (query) => { capturedQuery = query; return []; },
      count: async () => 0,
    }),
  };
  const analytics = require('../server/src/services/analytics')({ strapi });
  await analytics.getEmailLogs({}, { page: 2, pageSize: 10 });

  assert.deepEqual(capturedQuery.populate.user.fields, ['id', 'documentId', 'email', 'username']);
  assert.equal(capturedQuery.start, 10, 'page 2 with pageSize 10 must start at 10');
  assert.equal(capturedQuery.offset, undefined, 'must not use the unsupported offset param');
});
