'use strict';

/**
 * Outbox admin view: status mapping, allowed actions, URL building and the
 * source contract (shared table layer, ConfirmDialog, RBAC gating, i18n,
 * no colour literals, no window.confirm). Settings: queue validation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAdminModule } = require('./helpers/load-admin-module');

const utils = loadAdminModule('admin/src/pages/Outbox/outboxUtils.js');
const settingsLib = loadAdminModule('admin/src/utils/settingsValidation.js');
const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('one status mapping: retrying is a pending row after a failed try', () => {
  const cases = [
    [{ status: 'pending', attempts: 0 }, 'pending', 'neutral'],
    [{ status: 'pending', attempts: 1 }, 'retrying', 'warning'],
    [{ status: 'pending', attempts: 0, createdVia: 'capture-on-failure' }, 'retrying', 'warning'],
    [{ status: 'sending' }, 'sending', 'secondary'],
    [{ status: 'sent' }, 'sent', 'success'],
    [{ status: 'failed' }, 'failed', 'danger'],
    [{ status: 'uncertain' }, 'uncertain', 'warning'],
    [{ status: 'discarded' }, 'discarded', 'neutral'],
    [{ status: 'weird' }, 'unknown', 'neutral'],
  ];
  for (const [row, key, tone] of cases) {
    const presentation = utils.outboxStatusPresentation(row);
    assert.equal(presentation.key, key);
    assert.equal(presentation.tone, tone);
    assert.equal(presentation.labelKey, `queue.status.${key}`);
  }
});

test('actions per status mirror the server rules', () => {
  assert.deepEqual(utils.outboxActions({ status: 'failed', hasPayload: true }), {
    retry: true,
    discard: true,
    markSent: false,
  });
  assert.deepEqual(utils.outboxActions({ status: 'uncertain' }), {
    retry: true,
    discard: true,
    markSent: true,
  });
  assert.deepEqual(utils.outboxActions({ status: 'failed', hasPayload: false }).retry, false);
  for (const status of ['sending', 'sent', 'discarded']) {
    assert.deepEqual(utils.outboxActions({ status }), {
      retry: false,
      discard: false,
      markSent: false,
    });
  }
});

test('list URL only carries known filters', () => {
  assert.equal(
    utils.buildOutboxUrl({ page: 2, status: 'uncertain' }),
    '/magic-mail/outbox?page=2&pageSize=25&status=uncertain'
  );
  assert.equal(
    utils.buildOutboxUrl({ page: -1, status: 'bogus' }),
    '/magic-mail/outbox?page=1&pageSize=25'
  );
  assert.equal(
    utils.apiErrorCode({ response: { data: { error: { details: { code: 'STATE_CHANGED' } } } } }),
    'STATE_CHANGED'
  );
});

test('settings validation uses the server range for queueMaxAttempts', () => {
  const base = settingsLib.normalizeSettings({});
  assert.equal(base.queueFailedSends, false);
  assert.equal(base.queueMaxAttempts, 3);
  assert.deepEqual(settingsLib.validateSettings(base), {});
  for (const bad of [0, 11, 2.5, undefined, Number.NaN]) {
    assert.equal(
      settingsLib.validateSettings({ ...base, queueMaxAttempts: bad }).queueMaxAttempts,
      'invalidRange',
      String(bad)
    );
  }
  assert.deepEqual(
    settingsLib.diffSettings(base, { ...base, queueFailedSends: true, queueMaxAttempts: 5 }),
    { queueFailedSends: true, queueMaxAttempts: 5 }
  );
});

test('Outbox view follows the shared table layer and gates write actions', () => {
  const view = read('admin/src/pages/Outbox/index.jsx');
  const drawer = read('admin/src/pages/Outbox/OutboxDetailDrawer.jsx');
  for (const name of [
    'DataTable',
    'StyledTable',
    'FilterBar',
    'TablePagination',
    'EmptyState',
    'LoadErrorState',
  ]) {
    assert.match(view, new RegExp(`\\b${name}\\b`), `uses ${name}`);
  }
  assert.match(view, /from '\.\.\/\.\.\/components\/shared\/table'/);
  assert.match(view, /<ConfirmDialog/);
  assert.match(view, /isOpen=\{canManageQueue && Boolean\(pending\)\}/);
  for (const action of ['allowed.retry', 'allowed.markSent', 'allowed.discard']) {
    assert.match(view, new RegExp(`canManageQueue && ${action.replace('.', '\\.')}`));
  }
  assert.match(view, /confirmDuplicateRisk: true/, 'uncertain retry sends the confirmation');
  assert.equal((view.match(/data-label=/g) || []).length, 7, 'phone card labels on every cell');
  for (const source of [view, drawer]) {
    assert.doesNotMatch(source, /window\.confirm/);
    assert.doesNotMatch(source, /#[0-9a-f]{3,6}\b|rgba?\(/i, 'no colour literals');
    assert.doesNotMatch(source, /var\(--colors/);
    assert.doesNotMatch(source, /font-size:\s*\d+px/);
  }
  assert.match(drawer, /<Modal\.Root/);
  assert.match(drawer, /<Modal\.Title>/);
  assert.doesNotMatch(drawer, /payload/i, 'the drawer never shows the message content');
});

test('App shows the Outbox tab only with queue.read (direct links show the no-permission state)', () => {
  const app = read('admin/src/pages/App.jsx');
  assert.match(app, /canReadQueue \|\| location\.pathname\.includes\('\/outbox'\)/);
  assert.match(app, /<Tabs\.Content value="outbox">/);
  const view = read('admin/src/pages/Outbox/index.jsx');
  assert.match(view, /if \(!canReadQueue\) \{/);
});

test('the Outbox tab uses the same page container as the other tabs', () => {
  const src = read('admin/src/pages/Outbox/index.jsx');
  assert.match(src, /import \{ Container \} from '\.\.\/Accounts\/styles';/);
  assert.match(src, /<Container>\s*<OutboxView \/>\s*<\/Container>/);
});
