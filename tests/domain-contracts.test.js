'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

test('createAccount persists description and honours an explicit isActive:false', async () => {
  let created;
  const strapi = {
    log: quietLog,
    documents: () => ({
      create: async ({ data }) => { created = data; return { documentId: 'd1', ...data }; },
    }),
  };
  const svc = require('../server/src/services/account-manager')({ strapi });

  await svc.createAccount({
    name: 'Disabled SMTP', provider: 'smtp', fromEmail: 'a@example.com',
    description: 'Backup account', isActive: false,
  });

  assert.equal(created.description, 'Backup account');
  assert.equal(created.isActive, false, 'explicitly disabled account must not be forced active');
});

test('settings partial update never nulls unrelated fields', async () => {
  let updated;
  const strapi = {
    log: quietLog,
    documents: () => ({
      findFirst: async () => ({ documentId: 's1', trackingBaseUrl: 'https://track.example.com' }),
      update: async ({ data }) => { updated = data; return { documentId: 's1', ...data }; },
    }),
  };
  const svc = require('../server/src/services/plugin-settings')({ strapi });

  await svc.updateSettings({ enableOpenTracking: false });

  assert.equal(updated.enableOpenTracking, false);
  assert.equal('trackingBaseUrl' in updated, false, 'omitted field must not be written (and thus not nulled)');
});

test('template rendering does not HTML-escape subject or plain text', async () => {
  const svc = require('../server/src/services/email-designer')({ strapi: { log: quietLog } });
  svc.findByReferenceId = async () => ({
    isActive: true, name: 'T', category: 'marketing',
    bodyHtml: '<p>{{name}}</p>', bodyText: 'Hi {{name}} & friends', subject: 'Hello {{name}} & co',
  });

  const rendered = await svc.renderTemplate(1, { name: 'Tom & Jerry' });

  assert.equal(rendered.subject, 'Hello Tom & Jerry & co', 'subject must not be HTML-escaped');
  assert.equal(rendered.text, 'Hi Tom & Jerry & friends', 'plain text must not be HTML-escaped');
  assert.match(rendered.html, /Tom &amp; Jerry/, 'HTML body remains escaped');
});

test('import normalization leaves a missing reference id for safe generation', () => {
  const svc = require('../server/src/services/email-designer')({ strapi: { log: quietLog } });
  assert.equal(svc.normalizeImportData({ name: 'x' }).templateReferenceId, null);
  assert.equal(svc.normalizeImportData({ name: 'x', templateReferenceId: 5 }).templateReferenceId, 5);
});
