'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const affectedFiles = [
  {
    relativePath: 'admin/src/pages/PluginSettings.jsx',
    expectedChecked: [
      'settings.enableLinkTracking',
      'settings.enableOpenTracking',
      'settings.enableUnsubscribeHeader',
    ],
  },
  {
    relativePath: 'admin/src/components/AddAccountModal.jsx',
    expectedChecked: [
      'formData.secure',
      'formData.isActive',
      'formData.isPrimary',
    ],
  },
  {
    relativePath: 'admin/src/pages/RoutingRules.jsx',
    expectedChecked: [
      'formData.whatsappFallback',
      'formData.isActive',
    ],
  },
  {
    relativePath: 'admin/src/pages/EmailDesigner/EditorPage.jsx',
    expectedChecked: ['templateData.isActive'],
  },
].map((file) => ({
  ...file,
  source: fs.readFileSync(path.join(__dirname, '..', file.relativePath), 'utf8'),
}));

function importsFromDesignSystem(source, componentName) {
  return scanStaticImportDeclarations(source).some(
    ({ moduleName, importedIdentifiers }) =>
      moduleName === '@strapi/design-system' &&
      importedIdentifiers.includes(componentName)
  );
}

function skipQuotedString(source, start) {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  throw new Error(`Unterminated quoted string at source offset ${start}`);
}

function skipLineComment(source, start) {
  const lineEnd = source.indexOf('\n', start + 2);
  return lineEnd === -1 ? source.length : lineEnd + 1;
}

function skipBlockComment(source, start) {
  const commentEnd = source.indexOf('*/', start + 2);
  if (commentEnd === -1) {
    throw new Error(`Unterminated block comment at source offset ${start}`);
  }
  return commentEnd + 2;
}

function skipWhitespaceAndComments(source, start) {
  let index = start;

  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (source.startsWith('//', index)) {
      index = skipLineComment(source, index);
    } else if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
    } else {
      break;
    }
  }

  return index;
}

function isIdentifierCharacter(character) {
  return /[A-Za-z0-9_$]/.test(character || '');
}

function readIdentifier(source, start) {
  let index = start;
  while (isIdentifierCharacter(source[index])) index += 1;
  return {
    name: source.slice(start, index),
    end: index,
  };
}

function isIdentifierAt(source, start, identifier) {
  return (
    source.startsWith(identifier, start) &&
    !isIdentifierCharacter(source[start - 1]) &&
    !isIdentifierCharacter(source[start + identifier.length])
  );
}

function readStaticImportDeclaration(source, start) {
  let index = skipWhitespaceAndComments(source, start + 'import'.length);

  if (source[index] === '(' || source[index] === '.') return null;

  if (source[index] === "'" || source[index] === '"') {
    const moduleStart = index;
    const end = skipQuotedString(source, index);
    return {
      end,
      moduleName: source.slice(moduleStart + 1, end - 1),
      importedIdentifiers: [],
    };
  }

  const importedIdentifiers = [];
  let namedImportDepth = 0;

  while (index < source.length) {
    index = skipWhitespaceAndComments(source, index);
    const character = source[index];

    if (character === '{') {
      namedImportDepth += 1;
      index += 1;
    } else if (character === '}') {
      namedImportDepth -= 1;
      index += 1;
    } else if (isIdentifierCharacter(character)) {
      const identifier = readIdentifier(source, index);
      index = identifier.end;

      if (identifier.name === 'from' && namedImportDepth === 0) {
        index = skipWhitespaceAndComments(source, index);
        if (source[index] !== "'" && source[index] !== '"') return null;

        const moduleStart = index;
        const end = skipQuotedString(source, index);
        return {
          end,
          moduleName: source.slice(moduleStart + 1, end - 1),
          importedIdentifiers,
        };
      }

      importedIdentifiers.push(identifier.name);
    } else if (
      character === ';' ||
      character === "'" ||
      character === '"' ||
      character === '`'
    ) {
      return null;
    } else {
      index += 1;
    }
  }

  return null;
}

function scanStaticImportDeclarations(source) {
  const declarations = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === "'" || character === '"') {
      index = skipQuotedString(source, index);
    } else if (character === '`') {
      index = scanTemplateLiteral(source, index, []);
    } else if (source.startsWith('//', index)) {
      index = skipLineComment(source, index);
    } else if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
    } else if (character === '/' && canStartRegexLiteral(source, index)) {
      index = skipRegexLiteral(source, index);
    } else if (character === '<' && canStartJsxFromJavaScript(source, index)) {
      index = scanJsxElement(source, index, []);
    } else if (
      isIdentifierAt(source, index, 'import') &&
      source[previousSignificantIndex(source, index)] !== '.'
    ) {
      const declaration = readStaticImportDeclaration(source, index);
      if (declaration) {
        declarations.push(declaration);
        index = declaration.end;
      } else {
        index += 'import'.length;
      }
    } else {
      index += 1;
    }
  }

  return declarations;
}

function previousSignificantIndex(source, start) {
  let index = start - 1;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  return index;
}

function previousWord(source, end) {
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_$]/.test(source[start])) start -= 1;
  return source.slice(start + 1, end + 1);
}

function canStartRegexLiteral(source, start) {
  const previousIndex = previousSignificantIndex(source, start);
  if (previousIndex === -1) return true;

  const previousCharacter = source[previousIndex];
  if ('([{:;,=!?&|+-*%^~<>'.includes(previousCharacter)) return true;

  return [
    'await',
    'case',
    'delete',
    'in',
    'instanceof',
    'new',
    'of',
    'return',
    'throw',
    'typeof',
    'void',
    'yield',
  ].includes(previousWord(source, previousIndex));
}

function skipRegexLiteral(source, start) {
  let index = start + 1;
  let inCharacterClass = false;

  while (index < source.length) {
    const character = source[index];

    if (character === '\\') {
      index += 2;
    } else if (character === '[') {
      inCharacterClass = true;
      index += 1;
    } else if (character === ']') {
      inCharacterClass = false;
      index += 1;
    } else if (character === '/' && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] || '')) index += 1;
      return index;
    } else if (character === '\n' || character === '\r') {
      return start + 1;
    } else {
      index += 1;
    }
  }

  return start + 1;
}

function isJsxTagStart(source, start) {
  const nextCharacter = source[start + 1];
  return nextCharacter === '>' || /[A-Za-z]/.test(nextCharacter || '');
}

function canStartJsxFromJavaScript(source, start) {
  if (!isJsxTagStart(source, start)) return false;

  const previousIndex = previousSignificantIndex(source, start);
  if (previousIndex === -1) return true;

  const previousCharacter = source[previousIndex];
  if ('([{:;,=!?&|+-*%^~>'.includes(previousCharacter)) return true;

  return ['case', 'return', 'yield'].includes(previousWord(source, previousIndex));
}

function readJsxName(source, start) {
  let index = start;
  while (/[A-Za-z0-9_$:.-]/.test(source[index] || '')) index += 1;
  return {
    name: source.slice(start, index),
    end: index,
  };
}

function scanTemplateLiteral(source, start, switches) {
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
    } else if (source[index] === '`') {
      return index + 1;
    } else if (source[index] === '$' && source[index + 1] === '{') {
      index = scanJavaScriptExpression(source, index + 1, switches);
    } else {
      index += 1;
    }
  }

  throw new Error(`Unterminated template literal at source offset ${start}`);
}

function scanJavaScriptExpression(source, start, switches) {
  let braceDepth = 1;
  let index = start + 1;

  while (index < source.length) {
    const character = source[index];

    if (character === "'" || character === '"') {
      index = skipQuotedString(source, index);
    } else if (character === '`') {
      index = scanTemplateLiteral(source, index, switches);
    } else if (source.startsWith('//', index)) {
      index = skipLineComment(source, index);
    } else if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
    } else if (character === '/' && canStartRegexLiteral(source, index)) {
      index = skipRegexLiteral(source, index);
    } else if (character === '{') {
      braceDepth += 1;
      index += 1;
    } else if (character === '}') {
      braceDepth -= 1;
      index += 1;
      if (braceDepth === 0) return index;
    } else if (character === '<' && canStartJsxFromJavaScript(source, index)) {
      index = scanJsxElement(source, index, switches);
    } else {
      index += 1;
    }
  }

  throw new Error(`Unterminated JSX expression at source offset ${start}`);
}

function parseDirectAttributes(source, start, end) {
  const attributes = new Map();
  let index = start;

  while (index < end) {
    while (index < end && /\s/.test(source[index])) index += 1;
    if (index >= end) break;

    if (source.startsWith('//', index)) {
      index = skipLineComment(source, index);
      continue;
    }

    if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
      continue;
    }

    if (source[index] === '{') {
      index = scanJavaScriptExpression(source, index, []);
      continue;
    }

    const attributeNameStart = index;
    while (/[A-Za-z0-9_$:.-]/.test(source[index] || '')) index += 1;
    if (attributeNameStart === index) {
      index += 1;
      continue;
    }

    const name = source.slice(attributeNameStart, index);
    while (index < end && /\s/.test(source[index])) index += 1;

    let attribute = { kind: 'boolean', value: true };
    if (source[index] === '=') {
      index += 1;
      while (index < end && /\s/.test(source[index])) index += 1;

      if (source[index] === "'" || source[index] === '"') {
        const valueStart = index;
        index = skipQuotedString(source, index);
        attribute = {
          kind: 'string',
          value: source.slice(valueStart + 1, index - 1),
        };
      } else if (source[index] === '{') {
        const valueStart = index;
        index = scanJavaScriptExpression(source, index, []);
        attribute = {
          kind: 'expression',
          value: source.slice(valueStart + 1, index - 1).trim(),
        };
      } else {
        const valueStart = index;
        while (index < end && !/\s/.test(source[index])) index += 1;
        attribute = {
          kind: 'bare',
          value: source.slice(valueStart, index),
        };
      }
    }

    const existing = attributes.get(name) || [];
    existing.push(attribute);
    attributes.set(name, existing);
  }

  return attributes;
}

function readJsxOpeningTag(source, start, switches) {
  if (source.startsWith('<>', start)) {
    return {
      name: '',
      attributesStart: start + 2,
      attributesEnd: start + 2,
      end: start + 2,
      selfClosing: false,
    };
  }

  const { name, end: nameEnd } = readJsxName(source, start + 1);
  if (!name) throw new Error(`Invalid JSX opening tag at source offset ${start}`);

  let index = nameEnd;
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      index = skipLineComment(source, index);
    } else if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
    } else if (source[index] === "'" || source[index] === '"') {
      index = skipQuotedString(source, index);
    } else if (source[index] === '{') {
      index = scanJavaScriptExpression(source, index, switches);
    } else if (source.startsWith('/>', index)) {
      return {
        name,
        attributesStart: nameEnd,
        attributesEnd: index,
        end: index + 2,
        selfClosing: true,
      };
    } else if (source[index] === '>') {
      return {
        name,
        attributesStart: nameEnd,
        attributesEnd: index,
        end: index + 1,
        selfClosing: false,
      };
    } else {
      index += 1;
    }
  }

  throw new Error(`Unterminated JSX opening tag at source offset ${start}`);
}

function readJsxClosingTag(source, start) {
  if (source.startsWith('</>', start)) {
    return { name: '', end: start + 3 };
  }

  const { name, end: nameEnd } = readJsxName(source, start + 2);
  let index = nameEnd;
  while (index < source.length && /\s/.test(source[index])) index += 1;

  if (!name || source[index] !== '>') {
    throw new Error(`Invalid JSX closing tag at source offset ${start}`);
  }

  return { name, end: index + 1 };
}

function scanJsxChildren(source, start, parentName, switches) {
  let index = start;

  while (index < source.length) {
    if (source.startsWith('</', index)) {
      const closingTag = readJsxClosingTag(source, index);
      if (closingTag.name !== parentName) {
        throw new Error(
          `Mismatched JSX closing tag "${closingTag.name}" for "${parentName}"`
        );
      }
      return closingTag.end;
    }

    if (source[index] === '{') {
      index = scanJavaScriptExpression(source, index, switches);
    } else if (source[index] === '<' && isJsxTagStart(source, index)) {
      index = scanJsxElement(source, index, switches);
    } else {
      index += 1;
    }
  }

  throw new Error(`Unterminated JSX element "${parentName}"`);
}

function scanJsxElement(source, start, switches) {
  const openingTag = readJsxOpeningTag(source, start, switches);

  if (openingTag.name === 'Switch') {
    if (!openingTag.selfClosing) {
      throw new Error(`Switch at source offset ${start} must be self-closing`);
    }

    switches.push({
      start,
      source: source.slice(start, openingTag.end),
      attributes: parseDirectAttributes(
        source,
        openingTag.attributesStart,
        openingTag.attributesEnd
      ),
    });
  }

  if (openingTag.selfClosing) return openingTag.end;
  return scanJsxChildren(source, openingTag.end, openingTag.name, switches);
}

function extractSwitchOpeningTags(source) {
  const switches = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === "'" || character === '"') {
      index = skipQuotedString(source, index);
    } else if (character === '`') {
      index = scanTemplateLiteral(source, index, switches);
    } else if (source.startsWith('//', index)) {
      index = skipLineComment(source, index);
    } else if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
    } else if (character === '/' && canStartRegexLiteral(source, index)) {
      index = skipRegexLiteral(source, index);
    } else if (character === '<' && canStartJsxFromJavaScript(source, index)) {
      index = scanJsxElement(source, index, switches);
    } else {
      index += 1;
    }
  }

  return switches;
}

function directAttributes(tag, attributeName) {
  return tag.attributes.get(attributeName) || [];
}

function checkedExpression(tag, relativePath, index) {
  const checkedAttributes = directAttributes(tag, 'checked');
  const control = `${relativePath} Switch #${index + 1}`;

  assert.equal(
    checkedAttributes.length,
    1,
    `${control} must have exactly one direct checked attribute`
  );
  assert.equal(
    checkedAttributes[0].kind,
    'expression',
    `${control} checked must be a JSX expression`
  );

  return checkedAttributes[0].value;
}

function assertNonEmptyStringAttribute(tag, attributeName, relativePath, control) {
  const attributes = directAttributes(tag, attributeName);

  assert.equal(
    attributes.length,
    1,
    `${relativePath} ${control} must have exactly one direct ${attributeName} attribute`
  );
  assert.equal(
    attributes[0].kind,
    'string',
    `${relativePath} ${control} ${attributeName} must be a non-empty string literal`
  );
  assert.notEqual(
    attributes[0].value.trim(),
    '',
    `${relativePath} ${control} ${attributeName} must not be empty`
  );
}

function assertHiddenLabels(tag, relativePath, control) {
  const visibleLabels = directAttributes(tag, 'visibleLabels');

  assert.equal(
    visibleLabels.length,
    1,
    `${relativePath} ${control} must have exactly one direct visibleLabels attribute`
  );
  assert.equal(
    visibleLabels[0].kind,
    'expression',
    `${relativePath} ${control} visibleLabels must be the expression {false}`
  );
  assert.equal(
    visibleLabels[0].value,
    'false',
    `${relativePath} ${control} must include visibleLabels={false}`
  );
}

test('Switch extractor ignores non-code tokens and isolates direct attributes', () => {
  const fixture = [
    "const singleQuoted = '<Switch checked={fake.singleQuoted} />';",
    'const doubleQuoted = "<Switch checked={fake.doubleQuoted} />";',
    'const templated = `<Switch checked={fake.templated} />`;',
    'const regex = /<Switch\\b[^>]*\\/>/g;',
    '// <Switch checked={fake.lineComment} />',
    '/* <Switch checked={fake.blockComment} /> */',
    'const view = (',
    '  <>',
    '    <Switch',
    '      checked={state.real}',
    '      decoration={<span aria-label="nested" onLabel="nested" offLabel="nested" />}',
    '      metadata={{ text: "quoted } />", nested: { enabled: true } }}',
    '      /* aria-label="commented block" offLabel="commented block" /> */',
    '      // onLabel="commented line" visibleLabels={true} />',
    '      aria-label="Real control"',
    '      onLabel="On"',
    '      offLabel="Off"',
    '      visibleLabels={false}',
    '    />',
    '  </>',
    ');',
  ].join('\n');

  const switches = extractSwitchOpeningTags(fixture);

  assert.equal(switches.length, 1);
  assert.equal(directAttributes(switches[0], 'checked')[0].value, 'state.real');
  assert.equal(directAttributes(switches[0], 'aria-label').length, 1);
  assert.equal(directAttributes(switches[0], 'aria-label')[0].value, 'Real control');
  assert.equal(directAttributes(switches[0], 'onLabel').length, 1);
  assert.equal(directAttributes(switches[0], 'onLabel')[0].value, 'On');
  assert.equal(directAttributes(switches[0], 'offLabel').length, 1);
  assert.equal(directAttributes(switches[0], 'offLabel')[0].value, 'Off');
  assert.equal(directAttributes(switches[0], 'visibleLabels').length, 1);
  assert.equal(directAttributes(switches[0], 'visibleLabels')[0].value, 'false');
});

test('design-system import scanner rejects import-looking non-code text', () => {
  const fakeImports = [
    {
      context: 'block comment',
      source: "/* import { Toggle } from '@strapi/design-system'; */",
    },
    {
      context: 'line comment',
      source: "// import { Toggle } from '@strapi/design-system';",
    },
    {
      context: 'ordinary string',
      source: "const example = \"import { Toggle } from '@strapi/design-system';\";",
    },
    {
      context: 'template literal',
      source: "const example = `import { Toggle } from '@strapi/design-system';`;",
    },
  ];

  for (const { context, source } of fakeImports) {
    assert.equal(
      importsFromDesignSystem(source, 'Toggle'),
      false,
      `${context} must not be treated as a design-system import`
    );
  }

  const realMultilineImport = [
    'import {',
    '  /* Toggle, */',
    '  // Toggle,',
    '  Box,',
    '  Switch,',
    "} from '@strapi/design-system';",
  ].join('\n');

  assert.equal(importsFromDesignSystem(realMultilineImport, 'Switch'), true);
  assert.equal(importsFromDesignSystem(realMultilineImport, 'Toggle'), false);
});

test('Switch extractor preserves the intended real-file control distribution', () => {
  for (const { relativePath, source, expectedChecked } of affectedFiles) {
    const simulatedMigration = source.replace(/<Toggle\b/g, '<Switch');
    const switches = extractSwitchOpeningTags(simulatedMigration);
    const actualChecked = switches.map((tag, index) =>
      checkedExpression(tag, relativePath, index)
    );

    assert.equal(
      switches.length,
      expectedChecked.length,
      `${relativePath} simulated migration must expose every intended Switch`
    );
    assert.deepEqual(
      [...actualChecked].sort(),
      [...expectedChecked].sort(),
      `${relativePath} simulated migration must preserve the expected checked controls`
    );
  }
});

test('affected admin files stop importing and rendering Toggle', () => {
  for (const { relativePath, source } of affectedFiles) {
    assert.equal(
      importsFromDesignSystem(source, 'Toggle'),
      false,
      `${relativePath} must not import Toggle from @strapi/design-system`
    );
    assert.doesNotMatch(
      source,
      /<Toggle\b/,
      `${relativePath} must not render a Toggle control`
    );
  }
});

test('each affected admin file imports Switch from the Strapi design system', () => {
  for (const { relativePath, source } of affectedFiles) {
    assert.equal(
      importsFromDesignSystem(source, 'Switch'),
      true,
      `${relativePath} must import Switch from @strapi/design-system`
    );
  }
});

for (const { relativePath, source, expectedChecked } of affectedFiles) {
  test(`${relativePath} renders its exact compact Switch controls`, () => {
    const switches = extractSwitchOpeningTags(source);

    assert.equal(
      switches.length,
      expectedChecked.length,
      `${relativePath} must render exactly ${expectedChecked.length} Switch controls; found ${switches.length}`
    );

    const actualChecked = switches.map((tag, index) =>
      checkedExpression(tag, relativePath, index)
    );

    for (const expectedExpression of expectedChecked) {
      const occurrenceCount = actualChecked.filter(
        (expression) => expression === expectedExpression
      ).length;
      assert.equal(
        occurrenceCount,
        1,
        `${relativePath} must contain exactly one Switch checked by "${expectedExpression}"; found ${occurrenceCount}`
      );
    }

    switches.forEach((tag, index) => {
      const control = `Switch checked by "${actualChecked[index]}"`;
      assertNonEmptyStringAttribute(tag, 'aria-label', relativePath, control);
      assertNonEmptyStringAttribute(tag, 'onLabel', relativePath, control);
      assertNonEmptyStringAttribute(tag, 'offLabel', relativePath, control);
      assertHiddenLabels(tag, relativePath, control);
    });
  });
}
