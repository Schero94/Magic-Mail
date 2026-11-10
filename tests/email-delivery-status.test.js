'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

test('analytics rates and sent totals exclude pending and failed delivery attempts', async () => {
  const queries = [];
  const strapi = {
    documents(uid) {
      return {
        count: async ({ filters }) => {
          queries.push({ uid, filters });
          return 0;
        },
      };
    },
  };
  const analytics = require('../server/src/services/analytics')({ strapi });

  await analytics.getStats();

  assert.equal(queries.length, 4);
  for (const query of queries) {
    assert.deepEqual(
      query.filters.$or,
      [
        { deliveryStatus: 'sent' },
        { deliveryStatus: { $null: true }, deliveredAt: { $notNull: true } },
      ],
      'every analytics numerator and denominator uses accepted deliveries while retaining legacy rows'
    );
  }
});

test('analytics UI labels failed attempts instead of presenting every log as sent', () => {
  const ui = readFileSync(path.join(__dirname, '../admin/src/pages/Analytics.jsx'), 'utf8');
  assert.match(ui, /Delivery Status/);
  assert.match(ui, /Attempted At/);
  assert.match(ui, /if \(deliveryStatus === 'failed'\).*label: 'Failed'/);
  assert.match(ui, /if \(deliveryStatus === 'pending'\).*label: 'Pending'/);
  assert.match(ui, /if \(!deliveryStatus && !deliveredAt\).*label: 'Unverified'/);
  assert.match(ui, /return \{ label: 'Sent', tone: 'success' \}/);
});

test('new analytics logs start pending and legacy rows need acceptance evidence', async () => {
  const contentType = require('../server/src/content-types/email-log/schema.json');
  assert.deepEqual(contentType.attributes.deliveryStatus.enum, [
    'pending',
    'sent',
    'failed',
    'bounced',
    'deferred',
  ]);
  assert.equal(Object.hasOwn(contentType.attributes.deliveryStatus, 'default'), false);

  let created;
  const analytics = require('../server/src/services/analytics')({
    strapi: {
      log: quietLog,
      documents: () => ({
        create: async ({ data }) => {
          created = data;
          return data;
        },
      }),
    },
  });
  await analytics.createEmailLog({ to: 'recipient@example.invalid', subject: 'Audit fixture' });
  assert.equal(created.deliveryStatus, 'pending');
  assert.equal(created.messageIdLocal, null, 'no Message-ID local part without one');

  // The log stores the Message-ID local part so mailbox bounce reports match it.
  await analytics.createEmailLog({
    to: 'recipient@example.invalid',
    subject: 'Audit fixture',
    messageIdLocal: 'a1b2c3d4e5f6a7b8c9d0e1f2',
  });
  assert.equal(created.messageIdLocal, 'a1b2c3d4e5f6a7b8c9d0e1f2');
  await analytics.createEmailLog({
    to: 'recipient@example.invalid',
    subject: 'Audit fixture',
    messageIdLocal: '<injected@x>',
  });
  assert.equal(created.messageIdLocal, null, 'malformed local parts are dropped');
});

test('provider rejection records the attempt as failed without incrementing sent counters', async () => {
  const previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 'd'.repeat(32);
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const updates = [];
  const logEntry = { documentId: 'audit-log', emailId: 'audit-email' };
  const account = {
    documentId: 'audit-account',
    name: 'Fake provider',
    provider: 'sendgrid',
    fromEmail: 'sender@example.invalid',
    config: encryptCredentials({ apiKey: 'fake-provider-key' }),
  };
  const strapi = {
    log: quietLog,
    plugin: () => ({
      service(name) {
        if (name === 'plugin-settings') {
          return {
            getSettings: async () => ({ enableOpenTracking: false, enableLinkTracking: false }),
          };
        }
        if (name === 'analytics') {
          return {
            createEmailLog: async () => logEntry,
            generateRecipientHash: () => 'fake-recipient-hash',
            injectTrackingPixel: (html) => html,
            rewriteLinksForTracking: async (html) => html,
          };
        }
        throw new Error(`Unexpected MagicMail service: ${name}`);
      },
    }),
    documents: () => ({
      update: async ({ data }) => updates.push(data),
    }),
  };
  const router = require('../server/src/services/email-router')({ strapi });
  router.selectAccount = async () => account;
  router.checkRateLimits = async () => true;
  router.updateAccountStats = async () =>
    assert.fail('failed deliveries must not increment sent counters');
  router.sendViaSendGrid = async () => {
    throw new Error('fake provider rejection');
  };

  try {
    await assert.rejects(
      router.send({
        to: 'recipient@example.invalid',
        subject: 'Audit failure fixture',
        html: '<p>Fake provider rejection</p>',
        text: 'Fake provider rejection',
      }),
      /fake provider rejection/
    );

    assert.ok(updates.some((data) => data.deliveryStatus === 'failed'));
    assert.equal(
      updates.some((data) => data.deliveryStatus === 'sent'),
      false
    );
  } finally {
    if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  }
});

test('provider acceptance marks the email log sent before successful accounting completes', async () => {
  const previousKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
  process.env.MAGIC_MAIL_ENCRYPTION_KEY = 's'.repeat(32);
  const { encryptCredentials } = require('../server/src/utils/encryption');
  const updates = [];
  const account = {
    documentId: 'accepted-account',
    name: 'Fake provider',
    provider: 'sendgrid',
    fromEmail: 'sender@example.invalid',
    config: encryptCredentials({ apiKey: 'fake-provider-key' }),
  };
  const strapi = {
    log: quietLog,
    plugin: () => ({
      service(name) {
        if (name === 'plugin-settings') {
          return {
            getSettings: async () => ({ enableOpenTracking: false, enableLinkTracking: false }),
          };
        }
        if (name === 'analytics') {
          return {
            createEmailLog: async () => ({
              documentId: 'sent-log',
              emailId: 'sent-email',
              deliveryStatus: 'pending',
            }),
            generateRecipientHash: () => 'fake-recipient-hash',
            injectTrackingPixel: (html) => html,
            rewriteLinksForTracking: async (html) => html,
          };
        }
        throw new Error(`Unexpected MagicMail service: ${name}`);
      },
    }),
    documents: () => ({ update: async ({ data }) => updates.push(data) }),
  };
  const router = require('../server/src/services/email-router')({ strapi });
  router.selectAccount = async () => account;
  router.checkRateLimits = async () => true;
  router.updateAccountStats = async () => {};
  router.sendViaSendGrid = async () => ({ messageId: 'fake-accepted-message' });

  try {
    const result = await router.send({
      to: 'recipient@example.invalid',
      subject: 'Accepted audit fixture',
      html: '<p>Fake provider accepted this message.</p>',
      text: 'Fake provider accepted this message.',
    });

    assert.equal(result.success, true);
    assert.ok(
      updates.some((data) => data.deliveryStatus === 'sent' && data.deliveredAt instanceof Date)
    );
    assert.equal(
      updates.some((data) => data.deliveryStatus === 'failed'),
      false
    );
  } finally {
    if (previousKey === undefined) delete process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    else process.env.MAGIC_MAIL_ENCRYPTION_KEY = previousKey;
  }
});
