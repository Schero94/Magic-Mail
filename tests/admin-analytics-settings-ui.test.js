'use strict';

/**
 * Analytics and Plugin Settings views: behaviour of the pure helpers
 * (server-side paging/search, batched purge, settings diff and validation)
 * plus source guards for dark mode, sizes, i18n, RBAC and a11y.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadAdminModule, ROOT } = require('./helpers/load-admin-module');
const {
  findCssVarTokens,
  findTinyRemFontSizes,
  findEmoji,
} = require('./helpers/admin-style-guards');

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const ANALYTICS = 'admin/src/pages/Analytics.jsx';
const SETTINGS = 'admin/src/pages/PluginSettings.jsx';

const logs = loadAdminModule('admin/src/utils/analyticsLogs.js');
const settingsLib = loadAdminModule('admin/src/utils/settingsValidation.js');

/* ------------------------------------------------------- analytics helpers */

test('UI-10: email log requests carry the page and the trimmed search term to the server', () => {
  const parse = (url) => new URL(url, 'http://admin.test');

  const first = parse(logs.buildEmailLogsUrl());
  assert.equal(first.pathname, '/magic-mail/analytics/emails');
  assert.equal(first.searchParams.get('page'), '1');
  assert.equal(first.searchParams.get('pageSize'), String(logs.LOGS_PAGE_SIZE));
  assert.equal(first.searchParams.has('search'), false, 'no search parameter without a term');

  const searched = parse(
    logs.buildEmailLogsUrl({ page: 3, pageSize: 25, search: '  jane&co@example.com ' })
  );
  assert.equal(searched.searchParams.get('page'), '3');
  assert.equal(
    searched.searchParams.get('search'),
    'jane&co@example.com',
    'term is trimmed and URL-encoded'
  );

  const clamped = parse(
    logs.buildEmailLogsUrl({ page: -2, pageSize: 5000, search: 'x'.repeat(900) })
  );
  assert.equal(clamped.searchParams.get('page'), '1');
  assert.equal(clamped.searchParams.get('pageSize'), '100', 'never above the server maximum');
  assert.equal(
    clamped.searchParams.get('search').length,
    logs.MAX_SEARCH_LENGTH,
    'stays within the API limit'
  );

  assert.equal(parse(logs.buildEmailLogsUrl({ search: '   ' })).searchParams.has('search'), false);
});

test('UI-10: the current page is clamped after a purge or a narrower search', () => {
  assert.equal(logs.clampPage(5, 2), 2);
  assert.equal(logs.clampPage(2, 0), 1, 'an empty result keeps page 1');
  assert.equal(logs.clampPage(0, 4), 1);
  assert.equal(logs.clampPage(3, 4), 3);
  assert.equal(logs.clampPage(3, undefined), 1);
});

test('FUN-18: Clear All keeps calling the API while it reports hasMore', async () => {
  const responses = [
    { data: { deletedCount: 10000, hasMore: true } },
    { data: { deletedCount: 10000, hasMore: true } },
    { data: { deletedCount: 42, hasMore: false } },
  ];
  const calls = [];
  const result = await logs.clearAllEmailLogsInBatches(async (url) => {
    calls.push(url);
    return responses.shift();
  });
  assert.deepEqual(result, { deletedCount: 20042, complete: true });
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every((url) => url === '/magic-mail/analytics/emails'),
    'never sends olderThan or other filters'
  );
});

test('FUN-18: Clear All stops and reports an incomplete purge instead of looping forever', async () => {
  const stuck = await logs.clearAllEmailLogsInBatches(async () => ({
    data: { deletedCount: 0, hasMore: true },
  }));
  assert.deepEqual(stuck, { deletedCount: 0, complete: false });

  let rounds = 0;
  const capped = await logs.clearAllEmailLogsInBatches(
    async () => {
      rounds += 1;
      return { data: { deletedCount: 1, hasMore: true } };
    },
    { maxRounds: 3 }
  );
  assert.deepEqual(capped, { deletedCount: 3, complete: false });
  assert.equal(rounds, 3);

  const empty = await logs.clearAllEmailLogsInBatches(async () => ({
    data: { deletedCount: 0, hasMore: false },
  }));
  assert.deepEqual(empty, { deletedCount: 0, complete: true });

  await assert.rejects(
    logs.clearAllEmailLogsInBatches(async () => {
      throw new Error('network');
    }),
    /network/,
    'API errors reach the caller so the view can notify'
  );
});

test('server error messages are surfaced, generic ones fall back', () => {
  assert.equal(
    logs.apiErrorMessage({ response: { data: { error: { message: 'Invalid URL' } } } }),
    'Invalid URL'
  );
  assert.equal(logs.apiErrorMessage({ response: { data: { message: ' Nope ' } } }), 'Nope');
  assert.equal(logs.apiErrorMessage(new Error('x')), null);
  assert.equal(logs.apiErrorMessage(undefined), null);
});

/* -------------------------------------------------------- settings helpers */

test('UI-M03: settings are normalised from the API and only changed keys are saved', () => {
  const loaded = settingsLib.normalizeSettings({
    id: 1,
    enableLinkTracking: false,
    enableOpenTracking: null,
    trackingBaseUrl: 'https://api.example.com',
    defaultFromName: null,
    trackingFallbackUrl: 'https://example.com/fallback',
  });
  assert.deepEqual(loaded, {
    enableLinkTracking: false,
    enableOpenTracking: true,
    trackingBaseUrl: 'https://api.example.com',
    defaultFromName: '',
    defaultFromEmail: '',
    unsubscribeUrl: '',
    enableUnsubscribeHeader: true,
    queueFailedSends: false,
    queueMaxAttempts: 3,
  });
  assert.equal(
    'trackingFallbackUrl' in loaded,
    false,
    'settings the form does not edit are never echoed back'
  );

  assert.deepEqual(
    settingsLib.diffSettings(loaded, { ...loaded }),
    {},
    'no changes means nothing to save'
  );
  assert.deepEqual(
    settingsLib.diffSettings(loaded, {
      ...loaded,
      enableOpenTracking: false,
      defaultFromEmail: ' team@example.com ',
    }),
    { enableOpenTracking: false, defaultFromEmail: 'team@example.com' }
  );
});

test('UI-16: settings validation flags bad URLs and email addresses per field', () => {
  const base = settingsLib.normalizeSettings({});
  assert.deepEqual(settingsLib.validateSettings(base), {}, 'empty optional fields are valid');

  assert.deepEqual(
    settingsLib.validateSettings({
      ...base,
      trackingBaseUrl: 'api.example.com',
      unsubscribeUrl: 'javascript:alert(1)',
      defaultFromEmail: 'not-an-email',
      defaultFromName: 'Line\nBreak',
    }),
    {
      trackingBaseUrl: 'invalidUrl',
      unsubscribeUrl: 'invalidProtocol',
      defaultFromEmail: 'invalidEmail',
      defaultFromName: 'invalidText',
    }
  );

  assert.deepEqual(
    settingsLib.validateSettings({
      ...base,
      trackingBaseUrl: 'https://api.example.com',
      unsubscribeUrl: 'https://example.com/unsubscribe?email={{email}}',
      defaultFromEmail: 'noreply@example.com',
    }),
    {},
    'the {{email}} placeholder is accepted'
  );
  assert.deepEqual(
    settingsLib.validateSettings({ ...base, unsubscribeUrl: 'mailto:unsubscribe@example.com' }),
    {}
  );
  assert.equal(
    settingsLib.validateSettings({ ...base, trackingBaseUrl: 'mailto:x@example.com' })
      .trackingBaseUrl,
    'invalidProtocol'
  );
  assert.equal(
    settingsLib.validateSettings({ ...base, trackingBaseUrl: 'https://exa mple.com' })
      .trackingBaseUrl,
    'invalidUrl'
  );
});

test('UI-16: plain-http tracking URLs outside localhost are flagged as insecure', () => {
  assert.equal(settingsLib.isInsecureRemoteUrl('http://api.example.com'), true);
  assert.equal(settingsLib.isInsecureRemoteUrl('https://api.example.com'), false);
  assert.equal(settingsLib.isInsecureRemoteUrl('http://localhost:1337'), false);
  assert.equal(settingsLib.isInsecureRemoteUrl('http://127.0.0.1:1337'), false);
  assert.equal(settingsLib.isInsecureRemoteUrl(''), false);
});

/* ----------------------------------------------------------- source guards */

for (const file of [ANALYTICS, SETTINGS]) {
  test(`${file} uses DS tokens, readable sizes, no emoji, no keep-alive and no native dialogs`, () => {
    const src = read(file);
    assert.deepEqual(findCssVarTokens(src), []);
    assert.deepEqual(findTinyRemFontSizes(src), []);
    assert.deepEqual(findEmoji(src), []);
    assert.doesNotMatch(src, /useAuthRefresh/);
    assert.doesNotMatch(src, /window\.confirm|\bconfirm\(/);
    assert.doesNotMatch(src, /'de-DE'|'en-US'|toLocale(?:Date)?String\(/);
    assert.doesNotMatch(src, /navigator\.clipboard/);
    assert.match(src, /useMagicMailIntl/);
    assert.match(src, /useMagicMailRBAC/);
    assert.match(src, /tag="h1"/, 'the page has a level-1 heading');
  });
}

test('UI-10/UI-M05/FUN-18: Analytics pages and searches on the server and shows stats errors with retry', () => {
  const src = read(ANALYTICS);
  assert.match(
    src,
    /buildEmailLogsUrl\(\{ page, pageSize: LOGS_PAGE_SIZE, search: searchTerm \}\)/
  );
  assert.doesNotMatch(
    src,
    /pageSize=50|emailLogs\.filter\(/,
    'no client-side filtering of a single page'
  );
  assert.match(src, /clearAllEmailLogsInBatches\(del\)/, 'Clear All drains every batch');
  assert.match(src, /setStatsError\(true\)/, 'a failed stats request is tracked');
  assert.match(src, /statsError \? '-'/, 'unknown counters are not shown as zero');
  assert.match(
    src,
    /<SearchField\s+label=\{t\('analytics\.search\.label'/,
    'the search field has an accessible name'
  );
  assert.match(
    src,
    /<TablePagination[\s\S]*?pageSize=\{LOGS_PAGE_SIZE\}[\s\S]*?label=\{t\('analytics\.pagination\.label'/,
    'server pages use the shared table pagination'
  );
  assert.match(src, /count: totalLogs/, 'the confirmation counts all logs, not one page');
  assert.match(src, /useFormatters/);
});

test('UI-M03/UI-16/UI-09: Settings only renders the form after a successful load and guards edits', () => {
  const src = read(SETTINGS);
  assert.match(
    src,
    /if \(loadError \|\| !initialSettings\)/,
    'a failed load renders the error state, not defaults'
  );
  assert.match(src, /onClick=\{fetchSettings\}/, 'the error state offers a retry');
  assert.match(src, /put\('\/magic-mail\/settings', changes\)/, 'only changed keys are sent');
  assert.match(src, /apiErrorMessage\(err\)/, 'server validation messages reach the user');
  assert.match(src, /useUnsavedChangesGuard\(hasChanges\)/);
  assert.match(src, /guard\.runGuarded\(fetchSettings\)/, 'Refresh asks before discarding edits');
  assert.match(src, /<UnsavedChangesDialog guard=\{guard\} \/>/);
  assert.match(src, /<PluginPageTitle>/);
  assert.match(src, /disabled=\{!hasChanges \|\| !canManage \|\| !isValid\}/);
  assert.match(
    src,
    /color: #e2e8f0;/i,
    'code snippet text is readable on the dark snippet background'
  );
  assert.equal(
    (src.match(/<Field\.Error \/>/g) ?? []).length,
    5,
    'every text and number input shows its validation error'
  );
});

test('browser acceptance: Analytics layout fits every width and keeps focus after Clear All', () => {
  const src = read(ANALYTICS);
  assert.doesNotMatch(src, /max-width: 1200px/, 'stat cards align with the page edges');
  assert.match(
    src,
    /<Td className="cell-wrap" data-label=\{columnLabels\.recipient\}>/,
    'long recipients wrap (shared td.cell-wrap) and get a label in the phone card'
  );
  assert.match(src, /<Td className="cell-wrap" data-label=\{columnLabels\.subject\}>/);
  assert.match(src, /<DataTable[\s\S]*?<StyledTable colCount=\{7\}/, 'shared table layer');
  assert.doesNotMatch(src, /LogList|StatusSlot|TableScroller/, 'no second mobile-only list');
  assert.match(src, /<StatusBadge \$tone=\{delivery\.tone \?\? 'neutral'\}>/);
  assert.match(src, /label: 'Pending', tone: 'warning'/, 'pending uses the AA warning accent');
  assert.match(
    src,
    /logsError\s*\?\s*t\('analytics\.logs\.headingUnknown'/,
    'a failed load does not claim zero emails'
  );
  assert.match(src, /refocusAfterClear\.current = true/, 'Clear All hands focus to the search');
  assert.match(src, /ref=\{searchRef\}/);
  assert.match(src, /background-color: \$\{brand\.primary\}/, 'hero text has a solid backdrop');
});

test('browser acceptance: Settings has a main landmark and touch-sized switches', () => {
  const src = read(SETTINGS);
  assert.match(src, /<Page\.Main>\s*<PluginSettingsContent \/>/, 'skip link target and landmark');
  assert.match(
    src,
    /@media \(max-width: 767px\)[\s\S]*?button\[role='switch'\][\s\S]*?height: 32px/
  );
  assert.match(src, /& > svg \{/, 'the error icon style does not recolour the Retry icon');
  assert.doesNotMatch(src, /font-size: 1[3-9]px|font-size: 2\dpx/, 'DS font steps only');
  assert.doesNotMatch(src, /gap: 6px/, 'gaps stay on the 4px scale');
});

test('narrow screens: the section tabs scroll with visible edge buttons, wide screens keep DS tabs', () => {
  const tabs = read('admin/src/components/shared/SectionTabsList.jsx');
  // Same breakpoint as the Strapi admin's own mobile layout.
  assert.match(tabs, /useMediaQuery\(theme\.breakpoints\.medium\)/);
  assert.match(tabs, /useSyncExternalStore/);
  // Edge buttons appear only while sections are out of view, with labels.
  assert.match(tabs, /edges\.start \?/);
  assert.match(tabs, /edges\.end \?/);
  assert.match(tabs, /label=\{previousLabel\}/);
  assert.match(tabs, /label=\{nextLabel\}/);
  assert.match(tabs, /tabIndex=\{-1\}/, 'arrow keys stay the keyboard path');
  // Own scroll region, focused tab kept clear of the edge buttons.
  assert.match(tabs, /overflowX: 'auto'/);
  assert.match(tabs, /scroll-padding-inline/);
  assert.match(tabs, /scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/);
  assert.match(tabs, /prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
  assert.doesNotMatch(tabs, /#[0-9a-f]{3,6}\b/i, 'theme tokens only');
  const app = read('admin/src/pages/App.jsx');
  assert.match(app, /previousLabel=\{t\('app\.tabs\.scrollPrevious'/);
  assert.match(app, /nextLabel=\{t\('app\.tabs\.scrollNext'/);
});

test('browser acceptance: the active plugin tab scrolls into view and dialog titles stay centred', () => {
  const tabs = read('admin/src/components/shared/SectionTabsList.jsx');
  assert.match(tabs, /\[role="tab"\]\[aria-selected="true"\]/);
  assert.match(tabs, /list\.scrollLeft \+=/);
  const dialog = read('admin/src/components/shared/ConfirmDialog.jsx');
  assert.match(dialog, /<Dialog\.Header textAlign="center">/);
});
