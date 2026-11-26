/**
 * StrictMode checks of the email detail view (Analytics row click): opening by mouse and keyboard,
 * the Overview, Preview and Variables tabs, the "View email content" grant, "Load images" and the
 * tracking hint. Synthetic data only (example.test). See harness/index.jsx for the assertions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act } from 'react';
import { checkStrictEntry, network, permission } from './harness/index.jsx';
import App from '../../admin/src/pages/App';

const BASE = ['access', 'read', 'manage', 'test-send', 'queue.read', 'queue.manage'].map((action) =>
  permission(`plugin::magic-mail.${action}`)
);
const WITH_CONTENT = [...BASE, permission('plugin::magic-mail.content.read')];

const EMAIL_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const LOG = {
  id: 11,
  documentId: 'log11',
  emailId: EMAIL_ID,
  recipient: 'anna.beispiel@example.test',
  recipientName: 'Anna Beispiel',
  subject: 'Your order 2026-0042',
  templateName: 'Order confirmation with a very long template name for the table',
  deliveryStatus: 'sent',
  sentAt: '2026-11-20T10:00:00.000Z',
  deliveredAt: '2026-11-20T10:00:02.000Z',
  openCount: 0,
  clickCount: 0,
  accountName: 'Synthetic SMTP',
  accountId: 'acc1',
  metadata: { trackingApplied: { opens: false, clicks: false } },
};

const PREVIEW_HTML =
  '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:"></head><body><h1>Hello Anna</h1></body></html>';

const routes = () => {
  network.on('GET', '/magic-mail/accounts', { data: [] });
  network.on('GET', '/magic-mail/analytics/stats', {
    data: {
      totalSent: 1,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      tracking: { openTracking: false, linkTracking: false, publicUrl: true },
    },
  });
  network.on('GET', '/magic-mail/analytics/emails', {
    data: [LOG],
    pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 },
  });
  network.on('GET', `/magic-mail/analytics/emails/${EMAIL_ID}`, {
    data: { ...LOG, accountProvider: 'smtp', events: [] },
  });
  network.on(
    'GET',
    (pathname) => pathname.startsWith(`/magic-mail/analytics/emails/${EMAIL_ID}/content`),
    (call) => ({
      data: {
        state: 'rerendered',
        subject: LOG.subject,
        exactCopy: false,
        html: PREVIEW_HTML,
        text: 'Hello Anna',
        images: { allowed: /images=1/.test(call?.path || ''), blocked: 2 },
        template: { name: 'Order confirmation', versionNumber: 3, current: true },
        variables: {
          firstName: 'Anna',
          resetToken: '••••••',
          order: { total: 42, items: [{ sku: 'A-1' }] },
        },
        maskedPaths: ['resetToken'],
        variablesState: 'stored',
        variablesComplete: true,
      },
    })
  );
};

const wait = (ms = 40) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

const click = async (element) => {
  assert.ok(element, 'element to click exists');
  await act(async () => {
    element.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    element.click();
  });
  await wait();
};

const clickTab = async (name) => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (node) => node.textContent.trim() === name
  );
  assert.ok(tab, `tab ${name}`);
  await act(async () => {
    tab.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await click(tab);
};

const dialog = () => document.querySelector('[role="dialog"]');
const contentCalls = (calls) =>
  calls.filter((call) => call.pathname === `/magic-mail/analytics/emails/${EMAIL_ID}/content`);

test('email detail: row button opens Overview, Preview and Variables with the content grant', async () => {
  routes();
  const result = await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/analytics',
    permissions: WITH_CONTENT,
    async whileMounted() {
      await wait(80);
      assert.match(document.body.textContent, /Tracking is off/, 'tracking hint instead of zeros');
      assert.match(document.body.textContent, /Not tracked/, 'row shows not tracked');
      const subject = document.querySelector('button[aria-label^="Show details"]');
      await click(subject);
      assert.ok(dialog(), 'detail sheet open');
      assert.match(dialog().textContent, /Synthetic SMTP \(smtp\)/);
      assert.equal(contentCalls(network.calls).length, 0, 'content loads only on demand');

      await clickTab('Preview');
      await wait(80);
      const frame = dialog().querySelector('iframe');
      assert.ok(frame, 'preview iframe');
      assert.equal(frame.getAttribute('sandbox'), '', 'sandbox without any allowance');
      assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer');
      assert.match(frame.getAttribute('srcdoc'), /Hello Anna/);
      assert.match(dialog().textContent, /version 3/);

      const loadImages = [...dialog().querySelectorAll('button')].find(
        (node) => node.textContent.trim() === 'Load images'
      );
      await click(loadImages);
      await wait(80);
      assert.ok(
        network.calls.some((call) => /images=1/.test(call.path)),
        'images are loaded on request only'
      );

      const plain = [...dialog().querySelectorAll('button')].find(
        (node) => node.textContent.trim() === 'Plain text'
      );
      await click(plain);
      assert.match(dialog().querySelector('pre').textContent, /Hello Anna/);

      await clickTab('Variables');
      await wait(60);
      assert.match(dialog().textContent, /firstName/);
      assert.match(dialog().textContent, /Hidden/, 'masked values show a badge');
      assert.doesNotMatch(dialog().textContent, /resetToken.*abc/);
    },
  });
  assert.equal(result.calls.filter((call) => call.method !== 'GET').length, 0, 'no mutation');
});

test('email detail: without "View email content" Preview and Variables say no permission', async () => {
  routes();
  await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/analytics',
    permissions: BASE,
    async whileMounted() {
      await wait(80);
      await click(document.querySelector('button[aria-label^="Show details"]'));
      await clickTab('Preview');
      assert.match(dialog().textContent, /No permission/);
      await clickTab('Variables');
      assert.match(dialog().textContent, /No permission/);
      assert.equal(contentCalls(network.calls).length, 0, 'no content request without the grant');
      assert.match(dialog().textContent, /Overview/);
    },
  });
});

test('email detail: Enter on a focused table cell opens the details (keyboard)', async () => {
  routes();
  await checkStrictEntry(<App />, {
    path: '/plugins/magic-mail/analytics',
    permissions: WITH_CONTENT,
    async whileMounted() {
      await wait(80);
      const cell = document.querySelector('tbody td[role="gridcell"]');
      assert.ok(cell, 'grid cell');
      cell.focus();
      await act(async () => {
        cell.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      await wait();
      assert.ok(dialog(), 'Enter opens the detail sheet');
      await act(async () => {
        dialog().dispatchEvent(
          new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
      });
      await wait(60);
    },
  });
});
