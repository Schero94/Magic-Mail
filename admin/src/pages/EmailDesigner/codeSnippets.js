/**
 * Usage snippets for the "Code snippets" dialog.
 *
 * Snippets are token lists ([kind, text]) that the dialog renders as React
 * children, so nothing is ever injected as HTML (SUP-12). The copy text is the
 * concatenation of the tokens, so the shown and the copied code never differ.
 */
import { getBackendBaseUrl, toPositiveTemplateId } from './templateListUtils';

const ID_PLACEHOLDER = 'YOUR_TEMPLATE_ID';

/** @typedef {['plain'|'comment'|'keyword'|'string'|'function'|'number', string]} Token */

const tok = (kind, text) => [kind, text];
const plain = (text) => tok('plain', text);

/**
 * @param {{templateId: unknown, baseUrl?: string}} params
 * @returns {Array<{key: 'native'|'plugin'|'curl', tokens: Token[]}>}
 */
export const buildCodeSnippets = ({ templateId, baseUrl } = {}) => {
  const safeId = toPositiveTemplateId(templateId);
  const idToken = safeId === null ? plain(ID_PLACEHOLDER) : tok('number', String(safeId));
  const idText = safeId === null ? ID_PLACEHOLDER : String(safeId);
  const origin = (typeof baseUrl === 'string' && baseUrl) || getBackendBaseUrl();

  const native = [
    tok('comment', '// Anywhere in your Strapi backend:'),
    plain('\n'),
    tok('keyword', 'await'),
    plain(' strapi.'),
    tok('function', 'plugin'),
    plain('('),
    tok('string', "'email'"),
    plain(').'),
    tok('function', 'service'),
    plain('('),
    tok('string', "'email'"),
    plain(').'),
    tok('function', 'send'),
    plain('({\n  '),
    tok('keyword', 'to'),
    plain(': '),
    tok('string', "'user@example.com'"),
    plain(',\n  '),
    tok('keyword', 'subject'),
    plain(': '),
    tok('string', "'Your Subject'"),
    plain(', '),
    tok('comment', '// Optional (overridden by template)'),
    plain('\n  '),
    tok('keyword', 'templateId'),
    plain(': '),
    idToken,
    plain(',\n  '),
    tok('keyword', 'data'),
    plain(': {\n    '),
    tok('keyword', 'name'),
    plain(': '),
    tok('string', "'John Doe'"),
    plain(',\n    '),
    tok('keyword', 'code'),
    plain(': '),
    tok('string', "'123456'"),
    plain(',\n  },\n});'),
  ];

  const plugin = [
    tok('comment', '// Inside the Strapi backend'),
    plain('\n'),
    tok('keyword', 'await'),
    plain(' strapi.'),
    tok('function', 'plugin'),
    plain('('),
    tok('string', "'magic-mail'"),
    plain(')\n  .'),
    tok('function', 'service'),
    plain('('),
    tok('string', "'email-router'"),
    plain(')\n  .'),
    tok('function', 'send'),
    plain('({\n    '),
    tok('keyword', 'to'),
    plain(': '),
    tok('string', "'user@example.com'"),
    plain(',\n    '),
    tok('keyword', 'templateId'),
    plain(': '),
    idToken,
    plain(',\n    '),
    tok('keyword', 'templateData'),
    plain(': {\n      '),
    tok('keyword', 'name'),
    plain(': '),
    tok('string', "'John Doe'"),
    plain(',\n      '),
    tok('keyword', 'code'),
    plain(': '),
    tok('string', "'123456'"),
    plain(',\n    },\n  });'),
  ];

  const body = `'{
    "to": "user@example.com",
    "templateId": ${idText},
    "templateData": {
      "name": "John Doe",
      "code": "123456"
    }
  }'`;

  const curl = [
    plain(`curl -X POST ${origin}/api/magic-mail/send \\\n  -H `),
    tok('string', '"Content-Type: application/json"'),
    plain(' \\\n  -H '),
    tok('string', '"Authorization: Bearer YOUR_API_TOKEN"'),
    plain(' \\\n  -d '),
    tok('string', body),
  ];

  return [
    { key: 'native', tokens: native },
    { key: 'plugin', tokens: plugin },
    { key: 'curl', tokens: curl },
  ];
};

/**
 * @param {Token[]} tokens
 * @returns {string} the plain code text that the copy button writes
 */
export const snippetText = (tokens) => tokens.map(([, text]) => text).join('');
