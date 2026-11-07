'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const styledComponents = require('styled-components');
const { createIntl, IntlProvider } = require('react-intl');

const {
  loadAdminModule,
  loadAdminModuleAsync,
  contrastRatio,
  ROOT,
} = require('./helpers/load-admin-module');
const {
  findCssVarTokens,
  findTinyRemFontSizes,
  findEmoji,
} = require('./helpers/admin-style-guards');

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

// DS 2.2.4 dark theme values relevant to the assertions below.
const DARK_THEME = {
  colorScheme: 'dark',
  colors: {
    neutral0: '#212134',
    neutral100: '#181826',
    neutral150: '#32324d',
    neutral200: '#4a4a6a',
    neutral300: '#666687',
    neutral600: '#a5a5ba',
    neutral700: '#eaeaef',
    neutral800: '#ffffff',
  },
  fontSizes: ['1.1rem', '1.2rem', '1.4rem', '1.6rem', '1.8rem', '2rem', '2.8rem', '3.2rem'],
};

const DS_STUB = {
  Button: React.forwardRef(
    ({ startIcon, endIcon, loading, fullWidth, variant, size, ...props }, ref) =>
      React.createElement('button', { ref, ...props })
  ),
  Tooltip: ({ label, children }) =>
    React.createElement('span', { 'data-tooltip': label }, children),
};

const FOUNDATION_FILES = [
  'admin/src/utils/theme.js',
  'admin/src/utils/getTranslation.js',
  'admin/src/components/StyledButtons.jsx',
  'admin/src/components/Initializer.jsx',
  'admin/src/components/PluginIcon.jsx',
  'admin/src/index.js',
  'admin/src/pages/App.jsx',
  'admin/src/permissions.js',
  ...fs.readdirSync(path.join(ROOT, 'admin/src/hooks')).map((file) => `admin/src/hooks/${file}`),
  ...fs
    .readdirSync(path.join(ROOT, 'admin/src/components/shared'), {
      recursive: true,
      withFileTypes: true,
    })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(ROOT, path.join(entry.parentPath ?? entry.path, entry.name))
        .split(path.sep)
        .join('/')
    ),
];

const LOCALES = ['en', 'de', 'fr', 'es', 'pt'];
const readLocale = (locale) => JSON.parse(read(`admin/src/translations/${locale}.json`));

/* ------------------------------------------------------------------ theme */

test('theme helpers resolve DS tokens from the active theme and fall back to DS light values', () => {
  const { color, fontSize, byScheme, resolveColor, isDarkTheme, LIGHT_FALLBACK_COLORS } =
    loadAdminModule('admin/src/utils/theme.js');

  assert.equal(
    color('neutral0')({ theme: DARK_THEME }),
    '#212134',
    'dark mode uses the dark token'
  );
  assert.equal(color('neutral0')({ theme: { colors: { neutral0: '#ffffff' } } }), '#ffffff');
  assert.equal(
    color('neutral100')({}),
    LIGHT_FALLBACK_COLORS.neutral100,
    'no provider: light fallback'
  );
  assert.equal(resolveColor(DARK_THEME, 'neutral800'), '#ffffff');
  assert.equal(fontSize(2)({ theme: DARK_THEME }), '1.4rem');
  assert.equal(fontSize(1)({}), '1.2rem');
  assert.equal(byScheme('light', 'dark')({ theme: DARK_THEME }), 'dark');
  assert.equal(byScheme('light', 'dark')({ theme: { colorScheme: 'light' } }), 'light');
  assert.equal(isDarkTheme(DARK_THEME), true);
});

test('brand fills keep white text at WCAG AA and accents stay readable in both schemes', () => {
  const { brand, ACCENT_VALUES } = loadAdminModule('admin/src/utils/theme.js');

  for (const key of [
    'primary',
    'primaryHover',
    'secondary',
    'secondaryHover',
    'success',
    'successHover',
    'warning',
    'warningHover',
    'danger',
    'dangerHover',
  ]) {
    const ratio = contrastRatio(brand[key], '#ffffff');
    assert.ok(ratio >= 4.5, `white on brand.${key} (${brand[key]}) is ${ratio.toFixed(2)}:1`);
  }

  for (const [name, [light, dark]] of Object.entries(ACCENT_VALUES)) {
    assert.ok(contrastRatio(light, '#ffffff') >= 4.5, `accent.${name} on light neutral0`);
    assert.ok(
      contrastRatio(dark, DARK_THEME.colors.neutral0) >= 4.5,
      `accent.${name} on dark neutral0`
    );
  }
});

/* --------------------------------------------------------------- buttons */

const renderWithTheme = (themeObject, ...elements) => {
  const buttons = loadAdminModule('admin/src/components/StyledButtons.jsx', {
    stubs: { '@strapi/design-system': DS_STUB },
  });
  const sheet = new styledComponents.ServerStyleSheet();
  try {
    const html = renderToStaticMarkup(
      sheet.collectStyles(
        React.createElement(
          styledComponents.ThemeProvider,
          { theme: themeObject },
          ...elements.map((build, index) =>
            React.createElement(React.Fragment, { key: index }, build(buttons))
          )
        )
      )
    );
    return { html, css: sheet.getStyleTags(), buttons };
  } finally {
    sheet.seal();
  }
};

test('styled buttons follow the dark theme, use contrast-safe fills and honour reduced motion', () => {
  const { css } = renderWithTheme(
    DARK_THEME,
    (b) => React.createElement(b.GradientButton, null, 'Save'),
    (b) => React.createElement(b.SecondaryButton, null, 'Export'),
    (b) => React.createElement(b.TertiaryButton, null, 'Cancel')
  );

  assert.ok(!css.includes('var(--colors-'), 'no undefined DS custom properties');
  assert.ok(
    css.includes('#0369A1') && css.includes('#9333EA'),
    'primary gradient uses the AA brand stops'
  );
  assert.ok(!/#0EA5E9|#A855F7/i.test(css), 'the low-contrast gradient stops are gone');
  assert.ok(css.includes('#212134'), 'secondary button background follows the dark neutral0');
  assert.ok(css.includes('#D8B4FE'), 'secondary button text switches to the dark-mode accent');
  assert.ok(css.includes('#eaeaef'), 'tertiary text uses the dark neutral700 token');
  assert.ok(css.includes('prefers-reduced-motion'), 'hover lifts are disabled for reduced motion');
  assert.match(css, /min-height:36px/, 'text buttons use the shared 36px control height');
});

test('unused button variants are removed and the remaining exports are stable', () => {
  const buttons = loadAdminModule('admin/src/components/StyledButtons.jsx', {
    stubs: { '@strapi/design-system': DS_STUB },
  });
  // Row actions moved to the DS IconButton of the shared table layer (the
  // Magic Link table design), so the tinted icon buttons are gone too.
  for (const removed of [
    'SuccessButton',
    'LinkButton',
    'WhiteOutlineButton',
    'IconButton',
    'IconButtonDanger',
    'IconButtonPrimary',
    'IconButtonSuccess',
    'IconButtonWarning',
    'IconButtonPurple',
  ]) {
    assert.equal(buttons[removed], undefined, `${removed} is no longer exported`);
  }
  for (const kept of [
    'GradientButton',
    'SecondaryButton',
    'TertiaryButton',
    'DangerButton',
    'CTAButton',
  ]) {
    assert.ok(buttons[kept], `${kept} is exported`);
  }
});

/* ------------------------------------------------------------- clipboard */

const loadClipboard = () =>
  loadAdminModule('admin/src/components/shared/clipboard.js').copyToClipboard;

const fakeDocument = (execResult) => {
  const appended = [];
  const doc = {
    activeElement: {
      focus() {
        doc.refocused = true;
      },
    },
    body: {
      appendChild: (node) => appended.push(node),
      removeChild: (node) => appended.splice(appended.indexOf(node), 1),
    },
    createElement: () => ({
      style: {},
      setAttribute() {},
      select() {
        doc.selected = true;
      },
    }),
    execCommand: (command) => {
      doc.command = command;
      if (execResult instanceof Error) throw execResult;
      return execResult;
    },
    appended,
  };
  return doc;
};

test('copyToClipboard awaits the Clipboard API and reports success only when the write resolves', async () => {
  const copyToClipboard = loadClipboard();
  const written = [];
  const ok = await copyToClipboard('snippet', {
    window: { isSecureContext: true },
    navigator: { clipboard: { writeText: async (text) => written.push(text) } },
    document: fakeDocument(false),
  });
  assert.equal(ok, true);
  assert.deepEqual(written, ['snippet']);
});

test('copyToClipboard falls back to execCommand when the Clipboard API rejects or is missing', async () => {
  const copyToClipboard = loadClipboard();

  const doc = fakeDocument(true);
  const rejected = await copyToClipboard('abc', {
    window: { isSecureContext: true },
    navigator: {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    },
    document: doc,
  });
  assert.equal(rejected, true, 'legacy copy succeeded');
  assert.equal(doc.command, 'copy');
  assert.equal(doc.appended.length, 0, 'the helper textarea is removed again');
  assert.equal(doc.refocused, true, 'focus returns to the previously focused element');

  const insecure = await copyToClipboard('abc', {
    window: { isSecureContext: false },
    navigator: {},
    document: fakeDocument(false),
  });
  assert.equal(insecure, false, 'plain-HTTP admin without a working fallback reports failure');

  const throwing = await copyToClipboard('abc', {
    window: { isSecureContext: false },
    navigator: {},
    document: fakeDocument(new Error('blocked')),
  });
  assert.equal(throwing, false, 'never throws');

  assert.equal(await copyToClipboard('', { navigator: {}, document: fakeDocument(true) }), false);
});

/* ------------------------------------------------------------ formatting */

test('date and number formatters use the admin locale and handle empty or invalid values', () => {
  const { createFormatters, EMPTY_VALUE } = loadAdminModule(
    'admin/src/components/shared/format.js'
  );
  const de = createFormatters(createIntl({ locale: 'de', timeZone: 'UTC', messages: {} }));
  const en = createFormatters(createIntl({ locale: 'en-US', timeZone: 'UTC', messages: {} }));
  const iso = '2026-11-06T13:05:00.000Z';

  assert.match(de.formatDateTime(iso), /06\.11\.2026/);
  assert.match(en.formatDateTime(iso), /Nov 6, 2026/);
  assert.equal(de.formatDateTime(null), EMPTY_VALUE);
  assert.equal(de.formatDateTime('not a date'), EMPTY_VALUE);
  assert.equal(de.formatNumber(1234567), '1.234.567');
  assert.equal(en.formatNumber(1234567), '1,234,567');
  assert.equal(en.formatNumber(undefined), EMPTY_VALUE);
  assert.equal(en.formatPercent(42.5), '42.5%');
  assert.equal(
    en.formatRelative(new Date('2026-11-06T13:00:00Z'), new Date('2026-11-06T13:05:00Z')),
    '5 minutes ago'
  );
});

/* ------------------------------------------------------------------ i18n */

test('every locale file has the same keys, matching ICU placeholders and no emoji', () => {
  const reference = readLocale('en');
  const referenceKeys = Object.keys(reference).sort();
  const placeholders = (text) => [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();

  for (const locale of LOCALES) {
    const data = readLocale(locale);
    assert.deepEqual(
      Object.keys(data).sort(),
      referenceKeys,
      `${locale}.json key parity with en.json`
    );
    for (const [key, value] of Object.entries(data)) {
      assert.equal(typeof value, 'string', `${locale}:${key} is a string`);
      assert.ok(value.trim().length > 0, `${locale}:${key} is not empty`);
      assert.deepEqual(
        placeholders(value),
        placeholders(reference[key]),
        `${locale}:${key} placeholders`
      );
      assert.deepEqual(findEmoji(value), [], `${locale}:${key} has no emoji`);
    }
  }
});

test('German strings use the formal Sie form', () => {
  const values = Object.values(readLocale('de')).join('\n');
  assert.doesNotMatch(values, /\b(du|dein|deine|deinen|dir|dich|Du|Dein|Deine)\b/);
});

test('registerTrads prefixes keys with the plugin id and tolerates missing locales', async () => {
  const plugin = (
    await loadAdminModuleAsync('admin/src/index.js', {
      externalPattern: /^\.\/pages\//,
      stubs: {
        '@heroicons/react/24/outline': { EnvelopeIcon: () => null },
      },
    })
  ).default;

  const trads = await plugin.registerTrads({ locales: ['de', 'xx'] });
  const de = trads.find((entry) => entry.locale === 'de');
  const missing = trads.find((entry) => entry.locale === 'xx');

  assert.equal(de.data['magic-mail.app.tabs.accounts'], 'E-Mail-Konten');
  assert.ok(Object.keys(de.data).every((key) => key.startsWith('magic-mail.')));
  assert.deepEqual(missing.data, {}, 'unknown locales fall back to defaultMessage');
});

test('menu and settings registration use translated ids that exist in every locale', async () => {
  const plugin = (
    await loadAdminModuleAsync('admin/src/index.js', {
      externalPattern: /^\.\/pages\//,
      stubs: { '@heroicons/react/24/outline': { EnvelopeIcon: () => null } },
    })
  ).default;

  const calls = { menu: [], settings: [], plugin: [] };
  plugin.register({
    addMenuLink: (link) => calls.menu.push(link),
    createSettingSection: (section, links) => calls.settings.push({ section, links }),
    registerPlugin: (config) => calls.plugin.push(config),
  });

  const ids = [
    calls.menu[0].intlLabel.id,
    calls.settings[0].section.intlLabel.id,
    ...calls.settings[0].links.map((link) => link.intlLabel.id),
  ];
  for (const locale of LOCALES) {
    const data = readLocale(locale);
    for (const id of ids) {
      assert.ok(id.startsWith('magic-mail.'), id);
      assert.ok(
        Object.hasOwn(data, id.slice('magic-mail.'.length)),
        `${locale}.json defines ${id}`
      );
    }
  }
  assert.deepEqual(calls.menu[0].permissions, [
    { action: 'plugin::magic-mail.access', subject: null },
  ]);
  assert.deepEqual(calls.settings[0].links[0].permissions, [
    { action: 'plugin::magic-mail.read', subject: null },
  ]);
});

test('useMagicMailIntl prefixes ids and falls back to the English default message', () => {
  const { useMagicMailIntl } = loadAdminModule('admin/src/hooks/useMagicMailIntl.js');
  const Probe = () => {
    const { t } = useMagicMailIntl();
    return React.createElement(
      'p',
      null,
      `${t('common.cancel', 'Cancel')}|${t('missing.key', 'Fallback {name}', { name: 'X' })}`
    );
  };
  const html = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'de', messages: { 'magic-mail.common.cancel': 'Abbrechen' }, onError: () => {} },
      React.createElement(Probe)
    )
  );
  assert.equal(html, '<p>Abbrechen|Fallback X</p>');
});

/* ------------------------------------------------------ unsaved changes */

test('the unsaved-changes guard blocks only real navigation while dirty', () => {
  const { shouldBlockNavigation } = loadAdminModule('admin/src/hooks/useUnsavedChangesGuard.js', {
    stubs: { 'react-router-dom': { useBlocker: () => ({ state: 'unblocked' }) } },
  });
  const at = (pathname, search = '') => ({ pathname, search });

  assert.equal(
    shouldBlockNavigation(false, { currentLocation: at('/a'), nextLocation: at('/b') }),
    false
  );
  assert.equal(
    shouldBlockNavigation(true, { currentLocation: at('/a'), nextLocation: at('/b') }),
    true
  );
  assert.equal(
    shouldBlockNavigation(true, { currentLocation: at('/a'), nextLocation: at('/a') }),
    false
  );
  assert.equal(
    shouldBlockNavigation(true, { currentLocation: at('/a'), nextLocation: at('/a', '?x=1') }),
    true
  );
  assert.equal(shouldBlockNavigation(true, {}), false);
});

test('beforeunload protection is attached only while dirty and removed on cleanup', () => {
  const { attachBeforeUnload } = loadAdminModule('admin/src/hooks/useUnsavedChangesGuard.js', {
    stubs: { 'react-router-dom': { useBlocker: () => ({ state: 'unblocked' }) } },
  });
  const listeners = new Map();
  const win = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => listeners.get(type) === fn && listeners.delete(type),
  };

  attachBeforeUnload(false, win)();
  assert.equal(listeners.size, 0, 'clean pages never prompt');

  const cleanup = attachBeforeUnload(true, win);
  const event = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  listeners.get('beforeunload')(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, '');
  cleanup();
  assert.equal(listeners.size, 0);
});

/* --------------------------------------------------------------- motion */

test('prefersReducedMotion reads the media query and never throws', () => {
  const { prefersReducedMotion, REDUCED_MOTION_QUERY } = loadAdminModule(
    'admin/src/components/shared/motion.js'
  );
  assert.equal(
    prefersReducedMotion({ matchMedia: (q) => ({ matches: q === REDUCED_MOTION_QUERY }) }),
    true
  );
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(
    prefersReducedMotion({
      matchMedia: () => {
        throw new Error('x');
      },
    }),
    false
  );
  assert.equal(prefersReducedMotion(undefined), false);
});

/* ------------------------------------------------- keep-alive removal */

test('the admin keep-alive poller and the dead fetch wrapper are gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'admin/src/hooks/useAuthRefresh.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'admin/src/utils/fetchWithRetry.js')), false);
  const app = read('admin/src/pages/App.jsx');
  assert.doesNotMatch(app, /useAuthRefresh|setInterval|\/admin\/users\/me/);
});

/* -------------------------------------------------- foundation hygiene */

test('foundation files use DS tokens, readable font sizes and no emoji', () => {
  for (const file of FOUNDATION_FILES) {
    const source = read(file);
    assert.deepEqual(findCssVarTokens(source), [], `${file}: var(--colors-*) is undefined in DS 2`);
    assert.deepEqual(findTinyRemFontSizes(source), [], `${file}: rem font sizes below 12px`);
    assert.deepEqual(findEmoji(source), [], `${file}: emoji`);
    assert.doesNotMatch(source, /\bas="/, `${file}: DS 2 uses tag=, not as=`);
  }
});

test('App sets a page title per tab and labels its tab list', () => {
  const app = read('admin/src/pages/App.jsx');
  assert.match(app, /<PluginPageTitle>\{activeLabel\}<\/PluginPageTitle>/);
  assert.match(app, /const TabsList = styled\(Tabs\.List\)`/);
  assert.match(app, /<TabsList aria-label=/);
  assert.match(app, /<Page\.Main aria-label=/, 'main landmark for the skip link');
  assert.match(app, /<Icon aria-hidden="true"/);
});
