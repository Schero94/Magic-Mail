'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Mustache = require('mustache');

const {
  detectTemplateVariables,
  MAX_TEMPLATE_SOURCE_LENGTH,
} = require('../server/src/utils/template-variables');
const {
  mustacheToHandlebars,
  handlebarsToMustache,
  MAX_CONVERT_SOURCE_LENGTH,
} = require('../server/src/utils/template-syntax');
const { toPlainJson, PlainJsonError } = require('../server/src/utils/plain-json');

const byPath = (result) => Object.fromEntries(result.variables.map((v) => [v.path, v]));
const codes = (result) => result.warnings.map((w) => w.code);

// Best of three runs: a GC pause or a busy CI runner (the suite runs files in
// parallel) must not fail the test, while a super-linear scanner still takes
// seconds on every run.
const timeBudget = (fn, ms = 200) => {
  let best = Infinity;
  for (let run = 0; run < 3 && best >= ms; run += 1) {
    const start = process.hrtime.bigint();
    fn();
    best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
  }
  assert.ok(best < ms, `took ${best.toFixed(1)} ms`);
};

const ADVERSARIAL_LENGTH = 50_000;
const fill = (unit) => unit.repeat(Math.ceil(ADVERSARIAL_LENGTH / unit.length));
const half = (open, close) => fill(open).slice(0, 25_000) + fill(close).slice(0, 25_000);

// Each input is at least 50 000 characters of hostile tag fragments.
const ADVERSARIAL = [
  fill('{{#'),
  fill('{'),
  fill('{{'),
  fill('{{{'),
  fill('{{!--'),
  fill('{{a '),
  fill('{{x}'),
  fill('{{#each a}}'),
  fill('{{/x}}'),
  fill('{{a [b') + '}}',
  fill('{{a "b') + '}}',
  fill('{{{a}}}\n'),
  fill('{{~{a}~}}{{!-- x --~}}'),
  half('{{#a}}', '{{/b}}'),
  half('{{#if a}}', '{{/each}}'),
  half('{{#each a}}{{#with b}}', '{{/each}}'),
  fill('{{#h0 x}}{{#h1 x}}{{#h2 x}}{{#h3 x}}'),
];

// --- detectTemplateVariables -------------------------------------------------

test('detects plain, dotted and raw variables, sorted and deduplicated', () => {
  const result = detectTemplateVariables(
    '<p>{{name}} {{ user.email }} {{{html}}} {{name}} {{URL}}</p>'
  );
  assert.deepEqual(
    result.variables.map((v) => v.path),
    ['URL', 'html', 'name', 'user.email']
  );
  const vars = byPath(result);
  assert.equal(vars['user.email'].root, 'user');
  assert.equal(vars.html.raw, true);
  assert.equal(vars.name.raw, false);
  assert.equal(result.truncated, false);
});

test('raw flag is true when any use is raw', () => {
  const vars = byPath(detectTemplateVariables('{{body}} {{{body}}}'));
  assert.equal(vars.body.raw, true);
});

test('non-string input is treated as empty', () => {
  assert.deepEqual(detectTemplateVariables(null), { variables: [], truncated: false });
  assert.deepEqual(detectTemplateVariables(42), { variables: [], truncated: false });
});

test('rejects input over the length cap', () => {
  assert.throws(
    () => detectTemplateVariables('x'.repeat(MAX_TEMPLATE_SOURCE_LENGTH + 1)),
    (err) => err instanceof RangeError && err.message === 'Template is too large to analyse'
  );
  assert.doesNotThrow(() => detectTemplateVariables('x'.repeat(MAX_TEMPLATE_SOURCE_LENGTH)));
});

test('skips comments, including long comments containing }}', () => {
  const result = detectTemplateVariables(
    '{{! short }}{{!-- {{secret}} has }} inside --}}{{~!-- trimmed --~}}{{shown}}'
  );
  assert.deepEqual(
    result.variables.map((v) => v.path),
    ['shown']
  );
});

test('ignores literals, this, dot and data variables', () => {
  const result = detectTemplateVariables(
    '{{#each items}}{{this}}{{.}}{{@index}}{{@first}}{{@last}}{{@key}}{{/each}}' +
      '{{fmt "text" 12 true null undefined -3.5}}'
  );
  assert.deepEqual(
    result.variables.map((v) => v.path),
    ['items']
  );
});

test('block helpers contribute argument paths with the helper name', () => {
  const vars = byPath(
    detectTemplateVariables(
      '{{#if a}}{{/if}}{{#unless b}}{{/unless}}{{#each list}}{{/each}}{{#with obj}}{{/with}}' +
        '{{#equal plan "free"}}{{/equal}}{{#equals x y}}{{/equals}}'
    )
  );
  assert.deepEqual(vars.a.blocks, ['if']);
  assert.deepEqual(vars.b.blocks, ['unless']);
  assert.deepEqual(vars.list.blocks, ['each']);
  assert.deepEqual(vars.obj.blocks, ['with']);
  assert.deepEqual(vars.plan.blocks, ['equal']);
  assert.deepEqual(vars.x.blocks, ['equals']);
  assert.deepEqual(vars.y.blocks, ['equals']);
  assert.equal(vars.equal, undefined);
});

test('else if arguments count and else alone is skipped', () => {
  const vars = byPath(
    detectTemplateVariables('{{#if english}}a{{else if spanish}}b{{else}}c{{/if}}')
  );
  assert.deepEqual(Object.keys(vars), ['english', 'spanish']);
  assert.deepEqual(vars.spanish.blocks, ['if']);
});

test('each and with bodies are scoped, nested and closed correctly', () => {
  const vars = byPath(
    detectTemplateVariables(
      '{{#each orders}}{{id}}{{#with customer}}{{email}}{{/with}}{{this.total}}{{/each}}{{footer}}'
    )
  );
  assert.equal(vars.orders.scoped, false);
  assert.equal(vars.id.scoped, true);
  assert.equal(vars.customer.scoped, true);
  assert.equal(vars.email.scoped, true);
  assert.equal(vars.total.scoped, true);
  assert.equal(vars.footer.scoped, false);
});

test('scoped stays false when a path is also used at top level', () => {
  const vars = byPath(detectTemplateVariables('{{#each items}}{{name}}{{/each}}{{name}}'));
  assert.equal(vars.name.scoped, false);
});

test('@root and ../ resolve to unscoped paths', () => {
  const vars = byPath(
    detectTemplateVariables('{{#each items}}{{@root.company.name}}{{../title}}{{/each}}')
  );
  assert.equal(vars['company.name'].scoped, false);
  assert.equal(vars['company.name'].root, 'company');
  assert.equal(vars.title.scoped, false);
});

test('the else block of each renders with the outer context', () => {
  const vars = byPath(detectTemplateVariables('{{#each items}}{{a}}{{else}}{{empty}}{{/each}}'));
  assert.equal(vars.a.scoped, true);
  assert.equal(vars.empty.scoped, false);
});

test('helper calls count their argument paths, not the helper name', () => {
  const vars = byPath(
    detectTemplateVariables(
      '{{formatDate created "MM/DD"}} {{insert name "default=Customer"}} {{fmt x size=opts.size}}' +
        '{{#greaterThan (length cart) 0}}{{/greaterThan}}'
    )
  );
  assert.deepEqual(Object.keys(vars).sort(), ['cart', 'created', 'name', 'opts.size', 'x']);
  assert.equal(vars.formatDate, undefined);
  assert.equal(vars.length, undefined);
});

test('whitespace control markers and literal segments', () => {
  const vars = byPath(detectTemplateVariables('{{~ first ~}} {{~{raw}~}} {{[foo bar].baz}}'));
  assert.ok(vars.first);
  assert.equal(vars.raw.raw, true);
  assert.equal(vars['[foo bar].baz'].root, '[foo bar]');
});

test('skips paths longer than 128 characters and malformed paths', () => {
  const long = 'a'.repeat(129);
  const result = detectTemplateVariables(`{{${long}}} {{a..b}} {{a.}} {{ok}}`);
  assert.deepEqual(
    result.variables.map((v) => v.path),
    ['ok']
  );
  assert.equal(detectTemplateVariables(`{{${'a'.repeat(128)}}}`).variables.length, 1);
});

test('Mustache sections, inverted sections and ampersand raw', () => {
  const vars = byPath(
    detectTemplateVariables(
      '{{#items}}{{name}}{{/items}}{{^items}}none{{/items}}{{& html}}{{.}}{{> footer}}'
    )
  );
  assert.deepEqual(vars.items.blocks, ['section', 'inverted']);
  assert.equal(vars.name.scoped, false);
  assert.equal(vars.html.raw, true);
  assert.equal(vars.footer, undefined);
});

test('Mustache set delimiter stops the analysis', () => {
  const vars = byPath(detectTemplateVariables('{{a}}{{=<% %>=}}<% b %>{{c}}'));
  assert.deepEqual(Object.keys(vars), ['a']);
});

test('caps the variable list and reports truncation', () => {
  const source = Array.from({ length: 10 }, (_, i) => `{{v${i}}}`).join('');
  const result = detectTemplateVariables(source, { maxVariables: 3 });
  assert.equal(result.truncated, true);
  assert.deepEqual(
    result.variables.map((v) => v.path),
    ['v0', 'v1', 'v2']
  );
  assert.equal(detectTemplateVariables(source).truncated, false);
});

test('unclosed tags are ignored', () => {
  const vars = byPath(detectTemplateVariables('{{a}} {{b'));
  assert.deepEqual(Object.keys(vars), ['a']);
});

test('variable detection stays within the time budget on adversarial input', () => {
  for (const input of ADVERSARIAL) timeBudget(() => detectTemplateVariables(input));
});

// --- mustacheToHandlebars ----------------------------------------------------

test('mustacheToHandlebars converts sections with a review comment and warning', () => {
  const result = mustacheToHandlebars('Hi\n{{#items}}{{name}}{{/items}}');
  assert.equal(
    result.output,
    'Hi\n{{#if items}}{{!-- magic-mail: check this block: use #each if "items" is a list --}}' +
      '{{name}}{{/if}}'
  );
  assert.deepEqual(result.warnings, [{ code: 'SECTION_AMBIGUOUS', line: 2, tag: '{{#items}}' }]);
  assert.equal(result.changed, true);
});

test('mustacheToHandlebars converts inverted sections, ampersand and dot', () => {
  const result = mustacheToHandlebars('{{^x}}none{{/x}}{{& html}}{{.}}{{{.}}}{{{raw}}}{{y}}');
  assert.equal(
    result.output,
    '{{#unless x}}none{{/unless}}{{{html}}}{{this}}{{{this}}}{{{raw}}}{{y}}'
  );
  assert.deepEqual(result.warnings, []);
});

test('mustacheToHandlebars pairs nested sections by name', () => {
  const result = mustacheToHandlebars('{{#a}}{{^b}}x{{/b}}{{/a}}');
  assert.equal(
    result.output,
    '{{#if a}}{{!-- magic-mail: check this block: use #each if "a" is a list --}}' +
      '{{#unless b}}x{{/unless}}{{/if}}'
  );
});

test('mustacheToHandlebars keeps comments and plain text unchanged', () => {
  const source = 'Hello {{! note }}{{name}}';
  const result = mustacheToHandlebars(source);
  assert.equal(result.output, source);
  assert.equal(result.changed, false);
});

test('mustacheToHandlebars reports unbalanced sections and leaves them unchanged', () => {
  const unclosed = mustacheToHandlebars('{{#a}}text');
  assert.equal(unclosed.output, '{{#a}}text');
  assert.deepEqual(codes(unclosed), ['UNBALANCED_SECTION']);

  const stray = mustacheToHandlebars('text{{/a}}');
  assert.equal(stray.output, 'text{{/a}}');
  assert.deepEqual(codes(stray), ['UNBALANCED_SECTION']);

  const crossed = mustacheToHandlebars('{{#a}}{{#b}}{{/a}}');
  assert.deepEqual(codes(crossed).sort(), ['SECTION_AMBIGUOUS', 'UNBALANCED_SECTION']);
  assert.ok(crossed.output.includes('{{#b}}'));
});

test('mustacheToHandlebars warns about partials and stops at set delimiters', () => {
  const partial = mustacheToHandlebars('{{> footer}}');
  assert.equal(partial.output, '{{> footer}}');
  assert.deepEqual(codes(partial), ['PARTIAL_UNSUPPORTED']);

  const source = '{{&a}}\n{{=<% %>=}}\n<%#b%>{{&c}}<%/b%>';
  const delimiter = mustacheToHandlebars(source);
  assert.equal(delimiter.output, '{{{a}}}\n{{=<% %>=}}\n<%#b%>{{&c}}<%/b%>');
  assert.deepEqual(delimiter.warnings, [
    { code: 'DELIMITER_UNSUPPORTED', line: 2, tag: '{{=<% %>=}}' },
  ]);
});

test('warning tag text is truncated to 80 characters', () => {
  const result = mustacheToHandlebars(`{{> ${'p'.repeat(200)}}}`);
  assert.equal(result.warnings[0].tag.length, 80);
});

test('converters reject input over the length cap', () => {
  const big = 'x'.repeat(MAX_CONVERT_SOURCE_LENGTH + 1);
  assert.throws(() => mustacheToHandlebars(big), RangeError);
  assert.throws(() => handlebarsToMustache(big), RangeError);
});

// --- handlebarsToMustache ----------------------------------------------------

test('handlebarsToMustache converts if/else, unless/else, each and with', () => {
  const result = handlebarsToMustache(
    '{{#if a}}A{{else}}B{{/if}}{{#unless b}}C{{else}}D{{/unless}}' +
      '{{#each items}}{{this}}{{this.name}}{{{this}}}{{/each}}{{#with user}}{{email}}{{/with}}'
  );
  assert.equal(
    result.output,
    '{{#a}}A{{/a}}{{^a}}B{{/a}}{{^b}}C{{/b}}{{#b}}D{{/b}}' +
      '{{#items}}{{.}}{{name}}{{{.}}}{{/items}}{{#user}}{{email}}{{/user}}'
  );
  assert.deepEqual(result.warnings, []);
});

test('handlebarsToMustache converts long comments and removes braces', () => {
  const result = handlebarsToMustache('{{!-- note }} here --}}{{! short }}');
  assert.equal(result.output, '{{! note  here }}{{! short }}');
});

test('handlebarsToMustache removes whitespace control without warnings', () => {
  const result = handlebarsToMustache('{{~#if a~}} {{~ name ~}} {{~/if~}}');
  assert.equal(result.output, '{{#a}} {{name}} {{/a}}');
  assert.deepEqual(result.warnings, []);
});

test('handlebarsToMustache keeps plain variables unchanged', () => {
  const source = '{{x}} {{{y}}} {{user.email}}';
  const result = handlebarsToMustache(source);
  assert.equal(result.output, source);
  assert.equal(result.changed, false);
});

test('handlebarsToMustache leaves else if blocks unchanged', () => {
  const source = '{{#if a}}A{{else if b}}B{{else}}C{{/if}}';
  const result = handlebarsToMustache(source);
  assert.equal(result.output, source);
  assert.deepEqual(codes(result), ['ELSE_IF_UNSUPPORTED']);
});

test('handlebarsToMustache flags helpers, data variables and each else', () => {
  const equal = handlebarsToMustache('{{#equal plan "free"}}F{{/equal}}');
  assert.equal(equal.output, '{{#equal plan "free"}}F{{/equal}}');
  assert.deepEqual(codes(equal), ['HELPER_UNSUPPORTED']);

  const inline = handlebarsToMustache('{{fmt x "y"}}');
  assert.deepEqual(codes(inline), ['HELPER_UNSUPPORTED']);

  const data = handlebarsToMustache('{{#each a}}{{@index}}{{../t}}{{@root.x}}{{/each}}');
  assert.equal(data.output, '{{#a}}{{@index}}{{../t}}{{@root.x}}{{/a}}');
  assert.deepEqual(codes(data), [
    'DATA_VARIABLE_UNSUPPORTED',
    'DATA_VARIABLE_UNSUPPORTED',
    'DATA_VARIABLE_UNSUPPORTED',
  ]);

  const eachElse = handlebarsToMustache('{{#each a}}x{{else}}none{{/each}}');
  assert.deepEqual(codes(eachElse), ['EACH_ELSE_UNSUPPORTED']);
  assert.ok(eachElse.output.includes('{{else}}'));
});

test('handlebarsToMustache reports unbalanced blocks and reverts them', () => {
  const unclosed = handlebarsToMustache('{{#if a}}x');
  assert.equal(unclosed.output, '{{#if a}}x');
  assert.deepEqual(codes(unclosed), ['UNBALANCED_BLOCK']);

  const stray = handlebarsToMustache('x{{/if}}{{else}}');
  assert.equal(stray.output, 'x{{/if}}{{else}}');
  assert.deepEqual(codes(stray), ['UNBALANCED_BLOCK', 'UNBALANCED_BLOCK']);
});

test('round trip: converted Handlebars renders the expected output with Mustache', () => {
  const template =
    '<h1>{{title}}</h1>{{#if vip}}VIP{{else}}Regular{{/if}}|' +
    '{{#unless paid}}unpaid{{/unless}}|{{#each items}}[{{this.name}}:{{qty}}]{{/each}}|' +
    '{{#each tags}}{{this}},{{/each}}|{{{html}}}';
  const { output, warnings } = handlebarsToMustache(template);
  assert.deepEqual(warnings, []);
  const data = {
    title: 'A & B',
    vip: false,
    paid: false,
    items: [
      { name: 'pen', qty: 2 },
      { name: 'ink', qty: 1 },
    ],
    tags: ['x', 'y'],
    html: '<b>ok</b>',
  };
  assert.equal(
    Mustache.render(output, data),
    '<h1>A &amp; B</h1>Regular|unpaid|[pen:2][ink:1]|x,y,|<b>ok</b>'
  );
  assert.equal(
    Mustache.render(output, { ...data, vip: true, paid: true, items: [], tags: [] }),
    '<h1>A &amp; B</h1>VIP||||<b>ok</b>'
  );
});

test('round trip: Mustache to Handlebars and back renders the same', () => {
  const source = '{{^empty}}has{{/empty}}{{&raw}}{{name}}';
  const there = mustacheToHandlebars(source).output;
  assert.equal(there, '{{#unless empty}}has{{/unless}}{{{raw}}}{{name}}');
  const back = handlebarsToMustache(there).output;
  const data = { empty: false, raw: '<i>', name: '<n>' };
  assert.equal(Mustache.render(back, data), Mustache.render(source, data));
});

test('converters stay within the time budget on adversarial input', () => {
  for (const input of ADVERSARIAL) {
    timeBudget(() => mustacheToHandlebars(input));
    timeBudget(() => handlebarsToMustache(input));
  }
});

// --- toPlainJson -------------------------------------------------------------

test('toPlainJson copies plain data and reports its byte size', () => {
  const input = { name: 'Zoë', nested: { list: [1, 'a', true, null] } };
  const { data, bytes } = toPlainJson(input);
  assert.deepEqual(data, input);
  assert.notEqual(data, input);
  assert.equal(bytes, Buffer.byteLength(JSON.stringify(input)));
});

test('toPlainJson handles null and undefined top levels and rejects non-objects', () => {
  assert.deepEqual(toPlainJson(null).data, {});
  assert.deepEqual(toPlainJson(undefined).data, {});
  for (const bad of ['x', 1, [], new Map(), new Date()]) {
    assert.throws(
      () => toPlainJson(bad),
      (err) => err instanceof PlainJsonError && err.code === 'NOT_AN_OBJECT'
    );
  }
});

test('toPlainJson drops functions, symbols and undefined like JSON.stringify', () => {
  const sym = Symbol('s');
  const { data } = toPlainJson({
    fn() {},
    s: sym,
    u: undefined,
    list: [undefined, () => 1, sym, 2],
    [sym]: 'hidden',
  });
  assert.deepEqual(data, { list: [null, null, null, 2] });
});

test('toPlainJson converts dates and non-finite numbers', () => {
  const { data } = toPlainJson({
    when: new Date('2026-01-02T03:04:05.000Z'),
    bad: new Date('nope'),
    nan: NaN,
    inf: -Infinity,
  });
  assert.deepEqual(data, { when: '2026-01-02T03:04:05.000Z', bad: null, nan: null, inf: null });
});

test('toPlainJson rejects BigInt, Map, Set, Buffer, RegExp and class instances by path', () => {
  class Money {
    toJSON() {
      return 'secret-value';
    }
  }
  const cases = [
    [{ n: 10n }, 'templateData.n'],
    [{ m: new Map() }, 'templateData.m'],
    [{ s: new Set([1]) }, 'templateData.s'],
    [{ b: Buffer.from('secret-value') }, 'templateData.b'],
    [{ r: /secret-value/ }, 'templateData.r'],
    [{ u: new Uint8Array(2) }, 'templateData.u'],
    [{ items: [1, 2, { when: new Money() }] }, 'templateData.items[2].when'],
    [{ 'odd key': new Money() }, 'templateData["odd key"]'],
  ];
  for (const [input, path] of cases) {
    assert.throws(
      () => toPlainJson(input),
      (err) =>
        err instanceof PlainJsonError &&
        err.code === 'UNSUPPORTED_VALUE' &&
        err.message.includes(path) &&
        !err.message.includes('secret-value')
    );
  }
});

test('toPlainJson does not call getters', () => {
  let called = false;
  const input = {
    get secret() {
      called = true;
      return 'x';
    },
  };
  assert.throws(() => toPlainJson(input), { code: 'UNSUPPORTED_VALUE' });
  assert.equal(called, false);
});

test('toPlainJson drops prototype keys and never pollutes prototypes', () => {
  const input = JSON.parse('{"__proto__":{"x":1},"constructor":{"y":2},"prototype":3,"ok":1}');
  const { data } = toPlainJson(input);
  assert.deepEqual(Object.keys(data), ['ok']);
  assert.equal(Object.getPrototypeOf(data), Object.prototype);
  assert.equal({}.x, undefined);
  assert.equal(data.x, undefined);
});

test('toPlainJson accepts null-prototype objects and allows shared references', () => {
  const shared = { a: 1 };
  const bare = Object.create(null);
  bare.k = 'v';
  const { data } = toPlainJson({ one: shared, two: shared, bare });
  assert.deepEqual(data, { one: { a: 1 }, two: { a: 1 }, bare: { k: 'v' } });
});

test('toPlainJson detects cycles', () => {
  const input = { a: { list: [] } };
  input.a.list.push(input);
  assert.throws(
    () => toPlainJson(input),
    (err) => err.code === 'CIRCULAR' && err.message.includes('templateData.a.list[0]')
  );
});

test('toPlainJson enforces depth and key limits', () => {
  let deep = {};
  const root = deep;
  for (let i = 0; i < 40; i += 1) {
    deep.next = {};
    deep = deep.next;
  }
  assert.throws(() => toPlainJson(root), { code: 'TOO_DEEP' });
  assert.doesNotThrow(() => toPlainJson(root, { maxDepth: 41 }));

  assert.throws(() => toPlainJson({ list: new Array(6000).fill(1) }), { code: 'TOO_MANY_KEYS' });
  assert.throws(() => toPlainJson({ a: 1, b: 2, c: 3 }, { maxKeys: 2 }), {
    code: 'TOO_MANY_KEYS',
  });
  assert.doesNotThrow(() => toPlainJson({ a: 1, b: 2 }, { maxKeys: 2 }));
  assert.throws(() => toPlainJson({ list: [] }, { maxKeys: 0 }), TypeError);
});

test('toPlainJson maxBytes boundary is inclusive', () => {
  const input = { k: 'é' };
  const exact = Buffer.byteLength(JSON.stringify(input));
  assert.equal(toPlainJson(input, { maxBytes: exact }).bytes, exact);
  assert.throws(
    () => toPlainJson(input, { maxBytes: exact - 1 }),
    (err) =>
      err instanceof PlainJsonError &&
      err.code === 'TOO_LARGE' &&
      err.message === `Template data is larger than ${exact - 1} bytes`
  );
});

test('toPlainJson does not mutate its input', () => {
  const input = { when: new Date(0), list: [undefined, NaN], fn: () => 1 };
  const before = { ...input, list: [...input.list] };
  toPlainJson(input);
  assert.deepEqual(input, before);
  assert.ok(input.when instanceof Date);
});

test('toPlainJson stays within the time budget on large flat input', () => {
  const input = { list: new Array(4999).fill('x'.repeat(10)) };
  timeBudget(() => toPlainJson(input));
});
