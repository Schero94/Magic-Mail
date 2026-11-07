'use strict';

/**
 * Send queue contracts: content-type schema and the internal `indexes` key,
 * settings, Content-API and admin validation, config validation, the RBAC
 * permission migration and the admin error envelope.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = require('../server/src/content-types/outbox-message/schema.json');
const settingsSchema = require('../server/src/content-types/plugin-settings/schema.json');
const contentTypes = require('../server/src/content-types');
const { validate } = require('../server/src/validation');
const pluginConfig = require('../server/src/config');
const { migrateQueuePermissions } = require('../server/src/bootstrap');

const snake = (name) => name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

test('outbox content type: hidden, registered, indexes reference real columns', () => {
  assert.equal(contentTypes['outbox-message'].schema, schema);
  assert.equal(schema.collectionName, 'magic_mail_outbox');
  assert.equal(schema.pluginOptions['content-manager'].visible, false);
  assert.equal(schema.pluginOptions['content-type-builder'].visible, false);
  const columns = new Set(Object.keys(schema.attributes).map(snake));
  for (const index of schema.indexes) {
    for (const column of index.columns) {
      assert.ok(columns.has(column), `${index.name}: ${column} is an attribute column`);
    }
  }
  assert.ok(
    schema.indexes.some(
      (index) => index.type === 'unique' && index.columns[0] === 'idempotency_key_hash'
    )
  );
  // The payload is a text (longtext on MySQL) column; no plaintext address fields.
  assert.equal(schema.attributes.payload.type, 'text');
  for (const name of Object.keys(schema.attributes)) {
    assert.ok(!/^(to|recipient|subject|html|text)$/i.test(name), `${name} must not exist`);
  }
});

test('installed Strapi passes the content-type `indexes` key to the model (internal API pin)', () => {
  const root = path.dirname(require.resolve('@strapi/core/package.json'));
  const transform = fs.readFileSync(
    path.join(root, 'dist/utils/transform-content-types-to-models.js'),
    'utf8'
  );
  assert.match(transform, /indexes: contentType\.indexes/);
  const domain = fs.readFileSync(path.join(root, 'dist/domain/content-type/index.js'), 'utf8');
  assert.match(domain, /'indexes'/);
});

test('settings: queue attributes default off and are validated', () => {
  assert.equal(settingsSchema.attributes.queueFailedSends.default, false);
  assert.equal(settingsSchema.attributes.queueMaxAttempts.default, 3);
  assert.deepEqual(validate('pluginSettings.update', { queueFailedSends: true }), {
    queueFailedSends: true,
  });
  assert.equal(validate('pluginSettings.update', { queueMaxAttempts: 10 }).queueMaxAttempts, 10);
  for (const bad of [0, 11, 2.5, '3']) {
    assert.throws(() => validate('pluginSettings.update', { queueMaxAttempts: bad }));
  }
});

test('Content API: queue and idempotencyKey are optional and strict', () => {
  const base = { to: 'user@example.test', subject: 'Synthetic', text: 'x' };
  assert.deepEqual(validate('content.send', base), base);
  const queued = validate('content.send', { ...base, queue: true, idempotencyKey: 'order-1:a' });
  assert.equal(queued.queue, true);
  assert.throws(() => validate('content.send', { ...base, idempotencyKey: 'has space' }));
  assert.throws(() => validate('content.send', { ...base, idempotencyKey: 'x'.repeat(129) }));
  assert.throws(() => validate('content.send', { ...base, queue: 'yes' }));
  assert.equal(validate('content.sendMessage', { ...base, queue: false }).queue, false);
});

test('admin outbox validation', () => {
  assert.deepEqual(validate('outbox.listQuery', { status: 'uncertain', page: '2' }), {
    status: 'uncertain',
    page: 2,
  });
  assert.throws(() => validate('outbox.listQuery', { status: 'nope' }));
  assert.throws(() => validate('outbox.listQuery', { search: 'x' }));
  assert.throws(() => validate('outbox.documentId', { outboxId: '../x' }));
  assert.deepEqual(validate('outbox.documentId', { outboxId: 'abc123' }), { outboxId: 'abc123' });
  assert.throws(() => validate('outbox.retryBody', { confirmDuplicateRisk: 'yes' }));
  assert.throws(() => validate('outbox.deleteQuery', { olderThan: 'not a date' }));
});

test('config: queue defaults are valid and bad values are rejected', () => {
  pluginConfig.validator(pluginConfig.default);
  const bad = [
    { worker: 'yes' },
    { batchSize: 0 },
    { leaseMs: 1_000 },
    { backoffMs: [] },
    { backoffMs: [10] },
    { jitterRatio: 2 },
    { maxPayloadBytes: 50 * 1024 * 1024 },
    { retention: { rowDays: 0 } },
  ];
  for (const queue of bad) {
    assert.throws(() => pluginConfig.validator({ queue }), /config\.queue/, JSON.stringify(queue));
  }
});

test('RBAC migration grants queue.read/queue.manage once to roles with read/manage', async () => {
  const created = [];
  let flag = null;
  const rows = [
    { action: 'plugin::magic-mail.read', role: { id: 2 } },
    { action: 'plugin::magic-mail.manage', role: { id: 2 } },
    { action: 'plugin::magic-mail.read', role: { id: 3 } },
    { action: 'plugin::magic-mail.queue.read', role: { id: 3 } },
  ];
  const strapi = {
    store: () => ({ get: async () => flag }),
    admin: { services: { permission: { createMany: async (list) => created.push(...list) } } },
    db: {
      query: (uid) => {
        if (uid === 'admin::permission') return { findMany: async () => rows };
        return null;
      },
    },
  };
  // updateStoreValue falls back to store.set without a knex connection.
  strapi.store = () => ({
    get: async () => flag,
    set: async ({ value }) => {
      flag = value;
    },
  });
  const log = { info() {} };
  assert.equal(await migrateQueuePermissions(strapi, log), 2);
  assert.deepEqual(created.map((p) => `${p.role}:${p.action}`).sort(), [
    '2:plugin::magic-mail.queue.manage',
    '2:plugin::magic-mail.queue.read',
  ]);
  assert.equal(flag.done, true);
  assert.equal(await migrateQueuePermissions(strapi, log), 0, 'runs once');
});

test('outbox controller answers conflicts in the Strapi error envelope', async () => {
  global.strapi = {
    log: { warn() {}, error() {} },
    plugin: () => ({
      service: () => ({
        retry: async () => {
          const error = new Error('Confirm the duplicate risk to retry an uncertain message');
          error.code = 'MAGIC_MAIL_CONFIRMATION_REQUIRED';
          throw error;
        },
      }),
    }),
  };
  try {
    const controller = require('../server/src/controllers/outbox');
    const ctx = { params: { documentId: 'abc123' }, request: { body: {} }, state: {} };
    await controller.retry(ctx);
    assert.equal(ctx.status, 409);
    assert.deepEqual(ctx.body.error.details, { code: 'MAGIC_MAIL_CONFIRMATION_REQUIRED' });
    assert.equal(ctx.body.data, null);
  } finally {
    delete global.strapi;
  }
});
