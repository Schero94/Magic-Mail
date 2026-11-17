'use strict';

/**
 * Analytics counters on real filter semantics: the email-log content type is
 * loaded into Strapi's own database layer (@strapi/database, the query engine
 * behind the Document Service) on a SQLite file, and getStats runs its filters
 * through it. The same file first gets the schema as released in 4.5.0, so
 * the test also proves that the additive schema change keeps old rows counted.
 *
 * Needs the native better-sqlite3 build: CI runs it in the multi-instance job
 * (`npm rebuild better-sqlite3`); after `npm ci --ignore-scripts` it is
 * skipped with an explicit reason.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';

const hasSqlite = () => {
  try {
    const Sqlite = require('better-sqlite3');
    new Sqlite(':memory:').close();
    return true;
  } catch {
    return false;
  }
};

/**
 * Strapi's database layer and its content-type to model transform. Loaded
 * lazily so a host without the native SQLite build only skips the test.
 * The transform is not in @strapi/core's exports map: it is loaded by path,
 * as Strapi itself uses it at boot.
 *
 * @returns {{Database: Function, transformContentTypesToModels: Function}}
 */
const loadStrapiDatabase = () => ({
  Database: require('@strapi/database').Database,
  transformContentTypesToModels: require(
    path.join(ROOT, 'node_modules/@strapi/core/dist/utils/transform-content-types-to-models.js')
  ).transformContentTypesToModels,
});

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

/** email-log schema without relations (they need the related tables). */
const emailLogSchema = (mutate = (schema) => schema) => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'server/src/content-types/email-log/schema.json'), 'utf8')
  );
  for (const [name, attribute] of Object.entries(schema.attributes)) {
    if (attribute.type === 'relation') delete schema.attributes[name];
  }
  return mutate(schema);
};

/** The email-log schema as released in 4.5.0 (before this change). */
const releasedSchema = () =>
  emailLogSchema((schema) => {
    schema.attributes.deliveryStatus.enum = ['pending', 'sent', 'failed', 'bounced', 'deferred'];
    delete schema.attributes.deliveryConfirmedAt;
    delete schema.attributes.lastDeliveryEventAt;
    return schema;
  });

const openDb = async (file, schema) => {
  const { Database, transformContentTypesToModels } = loadStrapiDatabase();
  const db = new Database({
    connection: {
      client: 'sqlite',
      connection: { filename: file },
      useNullAsDefault: true,
    },
    settings: { migrations: { dir: path.join(path.dirname(file), 'migrations') } },
    logger: quiet,
  });
  const models = transformContentTypesToModels(
    [{ ...schema, uid: EMAIL_LOG_UID, modelName: 'email-log', modelType: 'contentType' }],
    db.metadata.identifiers
  );
  await db.init({ models });
  await db.schema.sync();
  return db;
};

const row = (emailId, data) => ({
  emailId,
  recipient: `${emailId}@example.test`,
  subject: 'Synthetic',
  sentAt: new Date('2026-11-01T10:00:00Z'),
  ...data,
});

test(
  'getStats counts bounced, deferred and blocked mail as accepted on SQLite, old rows included',
  { skip: !hasSqlite() && 'better-sqlite3 (native build) is not available' },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-analytics-'));
    const file = path.join(dir, 'data.sqlite');
    const previousStrapi = global.strapi;
    let db = null;
    try {
      // 1. Rows written by 4.5.0.
      db = await openDb(file, releasedSchema());
      global.strapi = { db };
      const accepted = new Date('2026-11-01T10:00:01Z');
      const q = () => db.query(EMAIL_LOG_UID);
      await q().create({ data: row('sent', { deliveryStatus: 'sent', deliveredAt: accepted }) });
      await q().create({
        data: row('webhook-bounce', {
          deliveryStatus: 'bounced',
          bounced: true,
          bounceSource: 'sendgrid',
          deliveredAt: accepted,
        }),
      });
      await q().create({
        data: row('mailbox-bounce', {
          deliveryStatus: 'bounced',
          bounced: true,
          bounceSource: 'mailbox',
          deliveredAt: accepted,
        }),
      });
      await q().create({
        data: row('deferred', { deliveryStatus: 'deferred', deliveredAt: accepted }),
      });
      await q().create({ data: row('legacy', { deliveredAt: accepted }) });
      await q().create({ data: row('legacy-bounce', { deliveredAt: accepted, bounced: true }) });
      await q().create({ data: row('legacy-unsent', {}) });
      await q().create({ data: row('pending', { deliveryStatus: 'pending' }) });
      await q().create({ data: row('failed', { deliveryStatus: 'failed' }) });
      await q().create({
        data: row('opened', { deliveryStatus: 'sent', deliveredAt: accepted, openCount: 2 }),
      });
      await db.destroy();
      db = null;

      // 2. Upgrade: the current schema syncs over the same file.
      db = await openDb(file, emailLogSchema());
      global.strapi = { db };
      const columns = await db.connection.raw("pragma table_info('magic_mail_email_logs')");
      const status = columns.find((column) => column.name === 'delivery_status');
      assert.match(status.type, /^varchar/i, 'enumerations are plain string columns');
      assert.ok(columns.some((column) => column.name === 'delivery_confirmed_at'));
      assert.ok(columns.some((column) => column.name === 'last_delivery_event_at'));
      assert.equal(await q().count(), 10, 'no row was lost by the schema sync');
      const legacy = await q().findOne({ where: { emailId: 'legacy' } });
      assert.equal(legacy.deliveryStatus, null);
      assert.equal(legacy.deliveryConfirmedAt, null);

      await q().create({
        data: row('blocked', {
          deliveryStatus: 'blocked',
          bounceReason: 'SENDGRID_BLOCKED_500',
          deliveredAt: accepted,
        }),
      });

      // 3. getStats through Strapi's query engine.
      const strapi = {
        documents: (uid) => ({
          count: ({ filters }) => db.query(uid).count({ where: filters }),
        }),
      };
      const analytics = require('../server/src/services/analytics')({ strapi });
      const stats = await analytics.getStats();
      // sent, 2 bounces, deferred, 2 legacy accepted, opened, blocked
      assert.equal(stats.totalSent, 8);
      // webhook, mailbox and legacy bounces
      assert.equal(stats.totalBounced, 3);
      assert.equal(stats.totalOpened, 1);
      assert.equal(stats.bounceRate, 37.5);

      const filtered = await analytics.getStats({ dateFrom: '2026-12-01T00:00:00Z' });
      assert.equal(filtered.totalSent, 0);
      assert.equal(filtered.totalBounced, 0);
    } finally {
      if (db) await db.destroy();
      global.strapi = previousStrapi;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
);
