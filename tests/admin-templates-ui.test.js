'use strict';

/**
 * Templates view (TemplateList) and template editor (EditorPage).
 * Behavioural tests for the pure helpers plus source guards for the views.
 * Nothing here contacts Unlayer, a provider or the network.
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

const DIR = 'admin/src/pages/EmailDesigner';
const read = (file) => fs.readFileSync(path.join(ROOT, DIR, file), 'utf8');
const VIEW_FILES = fs
  .readdirSync(path.join(ROOT, DIR))
  .filter((file) => /\.(jsx?|mjs)$/.test(file));
const COMPONENT_FILES = VIEW_FILES.filter((file) => file.endsWith('.jsx'));

const listUtils = loadAdminModule(`${DIR}/templateListUtils.js`);
const snippets = loadAdminModule(`${DIR}/codeSnippets.js`);
const unlayer = loadAdminModule(`${DIR}/unlayerOptions.js`);
const editorUtils = loadAdminModule(`${DIR}/editorUtils.js`);

/* -------------------------------------------------------------- list utils */

test('template search tolerates missing fields and matches name, subject and id', () => {
  const templates = [
    { name: 'Welcome', subject: 'Hi {{user.firstName}}', templateReferenceId: 100 },
    { name: 'Invoice', subject: null, templateReferenceId: 205 },
    { name: null, subject: 'Reset', templateReferenceId: undefined },
  ];
  assert.equal(listUtils.filterTemplates(templates, '').length, 3);
  assert.deepEqual(
    listUtils.filterTemplates(templates, 'welc').map((t) => t.templateReferenceId),
    [100]
  );
  assert.deepEqual(
    listUtils.filterTemplates(templates, '205').map((t) => t.name),
    ['Invoice']
  );
  assert.deepEqual(
    listUtils.filterTemplates(templates, 'RESET').map((t) => t.subject),
    ['Reset']
  );
  assert.deepEqual(listUtils.filterTemplates(null, 'x'), []);
});

test('pagination is clamped after deletes and exposes a centred page window (UI-22)', () => {
  assert.equal(listUtils.countPages(0, 10), 1);
  assert.equal(listUtils.countPages(21, 10), 3);
  // Last item of page 3 deleted -> 2 pages left, page 3 must clamp to 2.
  assert.equal(listUtils.clampPage(3, listUtils.countPages(20, 10)), 2);
  assert.equal(listUtils.clampPage(0, 4), 1);
  assert.equal(listUtils.clampPage(Number.NaN, 4), 1);
  assert.deepEqual(listUtils.getPageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(listUtils.getPageWindow(5, 10), [3, 4, 5, 6, 7]);
  assert.deepEqual(listUtils.getPageWindow(10, 10), [6, 7, 8, 9, 10]);
  assert.deepEqual(listUtils.getPageWindow(1, 10), [1, 2, 3, 4, 5]);
});

test('test-send input validates To and every CC address before sending (UI-12)', () => {
  assert.deepEqual(listUtils.validateTestSendInput({ to: '', cc: '' }).errors, { to: 'required' });
  assert.deepEqual(listUtils.validateTestSendInput({ to: 'nope@', cc: '' }).errors, {
    to: 'invalid',
  });
  assert.deepEqual(
    listUtils.validateTestSendInput({ to: 'qa@example.com', cc: 'a@example.com, broken' }).errors,
    { cc: 'invalid' }
  );
  const ok = listUtils.validateTestSendInput({
    to: ' qa@example.com ',
    cc: 'a@example.com; b@example.org,',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.to, 'qa@example.com');
  assert.deepEqual(ok.cc, ['a@example.com', 'b@example.org']);
});

test('row action keys stay with the buttons inside the DS table cell', () => {
  const stopped = [];
  for (const key of ['Enter', ' ', 'Tab', 'ArrowRight']) {
    let isStopped = false;
    listUtils.keepNativeButtonKeys({ key, stopPropagation: () => (isStopped = true) });
    if (isStopped) stopped.push(key);
  }
  assert.deepEqual(stopped, ['Enter', ' ', 'Tab'], 'arrow keys still reach the grid');
  assert.match(read('TemplateList.jsx'), /onKeyDown=\{keepNativeButtonKeys\}/);
});

test('reference ids and categories are normalised', () => {
  assert.equal(listUtils.toPositiveTemplateId(12), 12);
  assert.equal(listUtils.toPositiveTemplateId('42'), 42);
  for (const bad of [0, -1, 1.5, '1e3', '12abc', '<b>1</b>', null, undefined, {}]) {
    assert.equal(listUtils.toPositiveTemplateId(bad), null, String(bad));
  }
  assert.equal(listUtils.getCategoryVariant('marketing'), 'success');
  assert.equal(listUtils.getCategoryVariant('unknown'), 'neutral');
  assert.deepEqual(listUtils.getCategoryBadgeProps('marketing'), { variant: 'success' });
  assert.deepEqual(
    listUtils.getCategoryBadgeProps('transactional'),
    { backgroundColor: 'primary100', textColor: 'primary600' },
    'the DS primary badge is too low in contrast in dark mode'
  );
  for (const variant of Object.values(listUtils.CATEGORY_BADGE_VARIANTS)) {
    assert.match(
      variant,
      /^(primary|success|secondary|neutral)$/,
      'DS 2 Badge variants only (STR-11)'
    );
  }
});

test('backend base URL comes from the admin config, never a hard-coded localhost', () => {
  assert.equal(
    listUtils.getBackendBaseUrl({
      strapi: { backendURL: 'https://cms.example.com/' },
      location: { origin: 'https://admin.example.com' },
    }),
    'https://cms.example.com'
  );
  assert.equal(
    listUtils.getBackendBaseUrl({ location: { origin: 'https://admin.example.com' } }),
    'https://admin.example.com'
  );
  assert.equal(
    listUtils.getBackendBaseUrl({ strapi: { backendURL: 'javascript:alert(1)' } }),
    'https://your-strapi.example.com'
  );
});

/* ----------------------------------------------------------- code snippets */

test('code snippets are plain tokens, use the Strapi 5 accessor and the real backend URL (UI-21, SUP-12)', () => {
  const list = snippets.buildCodeSnippets({ templateId: 7, baseUrl: 'https://cms.example.com' });
  assert.deepEqual(
    list.map((s) => s.key),
    ['native', 'plugin', 'curl']
  );
  const text = Object.fromEntries(list.map((s) => [s.key, snippets.snippetText(s.tokens)]));

  assert.match(text.native, /strapi\.plugin\('email'\)\.service\('email'\)\.send\(/);
  assert.doesNotMatch(text.native, /strapi\.plugins\.email/);
  assert.match(text.native, /templateId: 7,/);
  assert.match(text.plugin, /service\('email-router'\)/);
  assert.match(text.curl, /^curl -X POST https:\/\/cms\.example\.com\/api\/magic-mail\/send/);
  assert.doesNotMatch(text.curl, /localhost/);

  for (const snippet of list) {
    for (const token of snippet.tokens) {
      assert.equal(token.length, 2);
      assert.match(token[0], /^(plain|comment|keyword|string|function|number)$/);
    }
  }
});

test('a non-numeric template id never reaches the snippets', () => {
  const list = snippets.buildCodeSnippets({
    templateId: '1</span><img src=x onerror=alert(1)>',
    baseUrl: 'https://cms.example.com',
  });
  for (const snippet of list) {
    const text = snippets.snippetText(snippet.tokens);
    assert.doesNotMatch(text, /<img|onerror/);
    assert.match(text, /YOUR_TEMPLATE_ID/);
  }
});

/* ---------------------------------------------------------------- unlayer */

test('Unlayer defaults: pinned version, explicit script, no foreign project or third-party assets (SUP-01, SUP-02, UI-26)', () => {
  const options = unlayer.buildUnlayerOptions({
    config: unlayer.DEFAULT_EDITOR_CONFIG,
    isDark: false,
    locale: 'en',
  });
  assert.equal(unlayer.UNLAYER_SCRIPT_URL, 'https://editor.unlayer.com/embed.js?2');
  assert.match(unlayer.UNLAYER_EDITOR_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(options.version, unlayer.UNLAYER_EDITOR_VERSION);
  assert.equal('projectId' in options, false, 'no projectId unless configured');
  assert.equal(options.features.stockImages, false);
  assert.equal(options.features.imageEditor, false);
  assert.equal(options.features.ai, false);
  assert.equal(options.features.previewInBrowser, false);
  assert.equal(options.safeHtml, true);

  const serialized = JSON.stringify(options);
  assert.doesNotMatch(serialized, /picsum|googleapis|gstatic/);
  assert.match(options.tools.image.properties.src.value.url, /^data:image\/svg\+xml/);
  assert.equal(
    'specialLinks' in options,
    false,
    'no links to {{system.*}} values the server never fills'
  );
  assert.equal('system' in options.mergeTags, false);
  assert.equal(options.appearance.theme, 'modern_light');
});

test('Unlayer follows the admin theme and locale and accepts only sane operator settings', () => {
  const dark = unlayer.buildUnlayerOptions({
    config: unlayer.sanitizeEditorConfig({
      projectId: 4711,
      version: '1.2.3',
      systemMergeTags: true,
    }),
    isDark: true,
    locale: 'de',
    t: (key, fallback) => `${fallback}!`,
  });
  assert.equal(dark.appearance.theme, 'modern_dark');
  assert.equal(dark.locale, 'de-DE');
  assert.equal(dark.projectId, 4711);
  assert.equal(dark.version, '1.2.3');
  assert.equal(dark.mergeTags.user.name, 'User!', 'merge tag labels are translated');
  assert.equal(dark.mergeTags.system.mergeTags.unsubscribe.value, '{{system.unsubscribe}}');

  assert.deepEqual(
    unlayer.sanitizeEditorConfig({
      projectId: 1.5,
      scriptUrl: 'http://evil.example/embed.js',
      version: 'latest',
    }),
    {
      projectId: null,
      scriptUrl: unlayer.UNLAYER_SCRIPT_URL,
      version: unlayer.UNLAYER_EDITOR_VERSION,
      systemMergeTags: false,
    }
  );
  assert.equal(
    unlayer.sanitizeEditorConfig({ scriptUrl: 'https://cdn.example.com/unlayer/embed.js' })
      .scriptUrl,
    'https://cdn.example.com/unlayer/embed.js'
  );
  assert.equal(unlayer.sanitizeEditorConfig(null).projectId, null);
  assert.equal(unlayer.toUnlayerLocale('pt'), 'pt-BR');
  assert.equal(unlayer.toUnlayerLocale('xx'), 'en-US');
});

test('editor image uploads go to the Strapi Media Library, not Unlayer hosting', async () => {
  const calls = [];
  const results = [];
  const upload = unlayer.createMediaLibraryUploader({
    post: async (url, body) => {
      calls.push({ url, isForm: body instanceof FormData, file: body.get('files') });
      return { data: [{ url: '/uploads/pic_123.png' }] };
    },
    baseUrl: 'https://cms.example.com',
    failureMessage: 'Upload failed',
  });
  const file = new Blob(['x'], { type: 'image/png' });
  await upload({ attachments: [file] }, (result) => results.push(result));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/upload');
  assert.equal(calls[0].isForm, true);
  assert.ok(calls[0].file, 'the attachment is sent as "files"');
  assert.deepEqual(results.at(-1), {
    progress: 100,
    url: 'https://cms.example.com/uploads/pic_123.png',
  });

  const failures = [];
  await unlayer.createMediaLibraryUploader({
    post: async () => {
      throw new Error('403');
    },
    baseUrl: 'https://cms.example.com',
    failureMessage: 'Upload failed',
  })({ attachments: [file] }, (result) => failures.push(result));
  assert.deepEqual(failures.at(-1), { error: 'Upload failed' });

  const aborted = [];
  await upload({ attachments: [] }, (result) => aborted.push(result));
  assert.deepEqual(aborted, [{ abort: true }]);

  assert.equal(unlayer.toAbsoluteMediaUrl('javascript:alert(1)', 'https://cms.example.com'), null);
});

/* ------------------------------------------------------------ editor utils */

test('the reference id is sent only when a template is created (UI-04, FUN-14)', () => {
  const data = {
    templateReferenceId: '55',
    name: 'Welcome',
    subject: 'Hi',
    bodyText: 'Hi',
    category: 'custom',
    isActive: true,
    tags: [],
    id: 9,
    documentId: 'abc',
    createdAt: 'x',
  };
  const exported = { design: { body: {} }, bodyHtml: '<p>Hi</p>' };
  const created = editorUtils.buildTemplatePayload(data, { ...exported, isNewTemplate: true });
  assert.equal(created.templateReferenceId, 55);
  assert.equal(created.bodyHtml, '<p>Hi</p>');
  assert.equal('documentId' in created, false, 'whitelisted payload');

  const updated = editorUtils.buildTemplatePayload(data, { ...exported, isNewTemplate: false });
  assert.equal('templateReferenceId' in updated, false, 'existing templates keep their id');
});

test('editor field validation reports missing and invalid values', () => {
  const mode = { isCoreEmail: false, isNewTemplate: true };
  assert.deepEqual(
    editorUtils.validateTemplateFields({ templateReferenceId: '', name: '', subject: '' }, mode),
    {
      templateReferenceId: 'required',
      name: 'required',
      subject: 'required',
    }
  );
  assert.deepEqual(
    editorUtils.validateTemplateFields(
      { templateReferenceId: '-3', name: 'a', subject: 'b' },
      mode
    ),
    {
      templateReferenceId: 'invalid',
    }
  );
  assert.deepEqual(
    editorUtils.validateTemplateFields(
      { templateReferenceId: 'x', name: 'a', subject: 'b' },
      { isCoreEmail: false, isNewTemplate: false }
    ),
    {},
    'the locked reference id of an existing template is not re-validated'
  );
  assert.deepEqual(
    editorUtils.validateTemplateFields(
      { subject: '' },
      { isCoreEmail: true, isNewTemplate: false }
    ),
    {
      subject: 'required',
    }
  );
});

test('core email messages become a design without breaking on quotes or backslashes', () => {
  const design = editorUtils.buildCoreDesign(
    'Hello "user"\\path\n<script>x</script><a href="<%= URL %>">Reset</a>'
  );
  const text = design.body.rows[0].columns[0].contents[0].values.text;
  assert.match(text, /Hello 'user'\\path<br \/>/);
  assert.doesNotMatch(text, /<script/);
  assert.match(text, /<a href='<%= URL %>'>Reset<\/a>/);
  assert.equal(editorUtils.buildCoreDesign(''), null);
  assert.equal(
    editorUtils.buildCoreDesign('<html><body><p>Hi</p></body></html>', () => 'Hi').body.rows.length,
    1
  );
});

test('design import accepts only Unlayer design objects', () => {
  assert.deepEqual(editorUtils.parseDesignFile('{"body":{"rows":[]}}'), { body: { rows: [] } });
  assert.equal(editorUtils.parseDesignFile('[]'), null);
  assert.equal(editorUtils.parseDesignFile('{"templates":[]}'), null);
  assert.equal(editorUtils.parseDesignFile('not json'), null);
  assert.equal(editorUtils.toFileName('Welcome / Mail <1>'), 'Welcome-Mail-1');
  assert.equal(editorUtils.toFileName(''), 'template');
});

/* ---------------------------------------------------------- source guards */

test('template views use DS tokens, readable sizes and no emoji', () => {
  for (const file of VIEW_FILES) {
    const source = read(file);
    assert.deepEqual(findCssVarTokens(source), [], `${file}: var(--colors-*) tokens`);
    assert.deepEqual(findTinyRemFontSizes(source), [], `${file}: font sizes below 12px`);
    assert.deepEqual(findEmoji(source), [], `${file}: emoji`);
    assert.doesNotMatch(source, /useAuthRefresh/, `${file}: keep-alive polling`);
    assert.doesNotMatch(source, /\bconfirm\(/, `${file}: native confirm`);
    assert.doesNotMatch(source, /navigator\.clipboard/, `${file}: raw clipboard API`);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, `${file}: HTML injection sink`);
    assert.doesNotMatch(source, /localhost:1337/, `${file}: hard-coded localhost`);
    assert.doesNotMatch(source, /picsum\.photos|fonts\.googleapis/, `${file}: third-party assets`);
  }
  for (const file of COMPONENT_FILES) {
    const source = read(file);
    assert.match(source, /useMagicMailIntl/, `${file}: translated`);
    assert.doesNotMatch(
      source,
      /'de-DE'|'en-US'|toLocale(Date)?String\(/,
      `${file}: hard-coded locale`
    );
    assert.doesNotMatch(source, /backgroundColor=["{]/, `${file}: DS 2 Badge variants`);
    assert.doesNotMatch(source, /\bas="span"/, `${file}: DS 2 tag prop`);
  }
});

test('template list: labelled search, error state with retry, confirm dialog and RBAC-aware actions', () => {
  const list = read('TemplateList.jsx');
  assert.match(list, /<SearchField\s+label=\{t\('templates\.search\.label'/);
  assert.match(list, /Promise\.allSettled/, 'one failing request does not hide the other');
  assert.match(list, /setLoadError\(true\)/);
  assert.match(list, /templates\.retry/);
  assert.match(list, /<ConfirmDialog\s+isOpen=\{canManage && pendingDelete !== null\}/);
  assert.match(
    list,
    /const handleDelete = async \(template\) => \{\s*if \(!canManage \|\| !template\) return;/
  );
  assert.match(list, /templates\.actions\.view/, 'read-only users can open a template');
  assert.match(list, /aria-current=\{page === pageNum \? 'page' : undefined\}/);
  assert.match(list, /input\.value = ''/, 'the import input is reset');
  assert.match(list, /<Title variant="alpha" tag="h1">/);
  assert.match(list, /<Badge \{\.\.\.getCategoryBadgeProps\(template\.category\)\}>/);
  assert.doesNotMatch(list, /margin: '0 -32px/, 'no negative-margin divider overflow');
});

test('editor: tabs keep Unlayer mounted, saves export from any tab, guard and dialogs in place', () => {
  const editor = read('EditorPage.jsx');
  assert.match(
    editor,
    /<StyledTabsContent value="html" forceMount>/,
    'visual edits survive tab switches (UI-M01)'
  );
  assert.match(read('editorStyles.js'), /&\[data-state='inactive'\] \{\s*display: none;/);
  assert.doesNotMatch(
    editor,
    /activeTab === 'html' && emailEditorRef/,
    'save no longer depends on the active tab (FUN-14)'
  );
  assert.match(
    editor,
    /disabled=\{!canManage \|\| !isNewTemplate\}/,
    'reference id is locked after creation (UI-04)'
  );
  assert.match(editor, /useUnsavedChangesGuard\(canManage && isDirty\)/);
  assert.match(editor, /<UnsavedChangesDialog guard=\{guard\} \/>/);
  assert.match(editor, /guard\.bypass\(\(\) => navigate\(/);
  assert.match(editor, /addEventListener\?\.\('design:updated'/);
  assert.match(editor, /registerCallback\?\.\(\s*'image'/);
  assert.match(editor, /scriptUrl=\{editorConfig\?\.scriptUrl \|\| UNLAYER_SCRIPT_URL\}/);
  assert.match(
    editor,
    /import \{ EmailEditor \} from 'react-email-editor'/,
    'no namespace fallback (SUP-M04)'
  );
  assert.match(editor, /sandbox=""/, 'read-only preview is sandboxed');
  assert.match(editor, /<PluginPageTitle>/);
  assert.match(editor, /input\.value = ''/, 'the design input is reset (UI-M06)');
  assert.match(
    editor,
    /editor\.design\.importPending/,
    'import before the editor is ready is not silent'
  );

  const drawer = read('VersionHistoryDrawer.jsx');
  assert.match(drawer, /<Modal\.Root open=\{isOpen\}/, 'version history is a real dialog (UI-13)');
  assert.match(drawer, /closeLabel=\{t\('editor\.versions\.close'/);
  assert.match(drawer, /<Modal\.Title>/);
  assert.match(read('editorStyles.js'), /width: min\(450px, 100vw\)/);
  assert.doesNotMatch(drawer, /en-US/);
});
