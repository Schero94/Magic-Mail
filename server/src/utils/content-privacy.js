'use strict';

/**
 * Masking of email content before it is stored for the admin preview.
 *
 * Everything here runs at STORE time: the database never holds a value this
 * module classifies as secret. The rules, in order:
 *
 * 1. Denylist (settings): a key or dotted path on the list is always masked.
 * 2. Built-in key rules: a key whose words or normalised name contain
 *    password, token, secret, otp, jwt, key, code, reset, confirmation,
 *    session, cookie, auth, nonce, ticket, signature, credential, pin, cvv
 *    (and a few more) is masked. Harmless "code" compounds such as
 *    postalCode or countryCode are kept.
 * 3. Allowlist (settings): a key or path on the list skips rule 2 and the
 *    random-string rule 5. It never skips rules 1, 4 and 6.
 * 4. URLs: query parameters, fragments and path segments that carry a token
 *    (reset password `?code=`, email confirmation `?confirmation=`, magic
 *    links, signed URLs) are replaced. The rest of the URL stays readable.
 * 5. Values that look like tokens: long hexadecimal strings, UUIDs and long
 *    random base64/base64url strings.
 * 6. JWTs anywhere, also inside free text.
 *
 * All functions are linear in the input size: no regular expression with
 * nested or overlapping quantifiers, no RegExp built from user input, and
 * every input is capped before it is scanned.
 */

/** Replacement text for a masked value (also used inside URLs). */
const MASK = '••••••';

const LIMITS = Object.freeze({
  depth: 8,
  keysPerObject: 200,
  itemsPerArray: 200,
  stringLength: 5000,
  totalBytes: 64 * 1024,
  listEntries: 100,
  listEntryLength: 100,
  textScan: 2 * 1024 * 1024,
});

/** Words that make a key sensitive when they appear as a whole word. */
const SENSITIVE_WORDS = new Set([
  'password',
  'passwd',
  'pwd',
  'pass',
  'passphrase',
  'secret',
  'token',
  'tokens',
  'otp',
  'totp',
  'jwt',
  'key',
  'apikey',
  'code',
  'reset',
  'confirmation',
  'confirm',
  'session',
  'sid',
  'cookie',
  'auth',
  'authorization',
  'nonce',
  'ticket',
  'signature',
  'sig',
  'credential',
  'credentials',
  'pin',
  'cvv',
  'cvc',
  'salt',
  'hash',
  'magic',
  'bearer',
  'iban',
]);

/** Fragments that make a key sensitive anywhere in its normalised name. */
const SENSITIVE_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'jwt',
  'apikey',
  'privatekey',
  'accesskey',
  'secretkey',
  'credential',
  'otp',
  'resetlink',
  'reseturl',
  'magiclink',
  'loginlink',
  'loginurl',
  'confirmationlink',
  'confirmationurl',
  'verifylink',
  'verifyurl',
  'verificationlink',
  'verificationurl',
  'signedurl',
];

/** "code" compounds that are not secrets. */
const SAFE_KEYS = new Set([
  'postalcode',
  'zipcode',
  'postcode',
  'countrycode',
  'currencycode',
  'languagecode',
  'localecode',
  'statuscode',
  'areacode',
  'phonecode',
  'dialcode',
  'colorcode',
  'colourcode',
]);

/** Query parameter name fragments that carry a token. */
const TOKEN_PARAM_FRAGMENTS = [
  'token',
  'secret',
  'password',
  'code',
  'key',
  'sig',
  'otp',
  'auth',
  'session',
  'nonce',
  'state',
  'ticket',
  'magic',
  'reset',
  'confirm',
  'jwt',
  'hash',
  'hmac',
  'credential',
  'expires',
  'verify',
];

/**
 * Lower-cases a key and removes `_`, `-`, `.` and spaces (loginToken,
 * login_token and login-token all become `logintoken`).
 *
 * @param {string} key
 * @returns {string}
 */
const normalizeKey = (key) =>
  String(key)
    .slice(0, 200)
    .toLowerCase()
    .replace(/[\s_.-]/g, '');

/**
 * Splits a key into lower-case words (camelCase, snake_case, kebab-case).
 *
 * @param {string} key
 * @returns {string[]}
 */
const keyWords = (key) =>
  String(key)
    .slice(0, 200)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * True when a key name alone marks its value as secret.
 *
 * @param {string} key
 * @returns {boolean}
 */
const isSensitiveKeyName = (key) => {
  const normalized = normalizeKey(key);
  if (!normalized || SAFE_KEYS.has(normalized)) return false;
  if (SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) return true;
  return keyWords(key).some((word) => SENSITIVE_WORDS.has(word));
};

/**
 * Shannon entropy in bits per character.
 *
 * @param {string} value
 * @returns {number}
 */
const entropy = (value) => {
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) || 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
};

const JWT_SHAPE = /^eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*$/;
const HEX_TOKEN = /^[A-Fa-f0-9]{32,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANDOM_CHARS = /^[A-Za-z0-9_\-+/=~]{20,}$/;

/**
 * True for a JWT.
 *
 * @param {string} value
 * @returns {boolean}
 */
const isJwt = (value) => value.length <= 8192 && JWT_SHAPE.test(value);

/**
 * True when a string looks like a generated token: a JWT, 32+ hex
 * characters, a UUID, or 20+ base64/base64url characters that mix letters
 * and digits with high entropy. Words, sentences, e-mail addresses and
 * readable identifiers do not match.
 *
 * @param {string} value
 * @returns {boolean}
 */
const looksLikeToken = (value) => {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 20 || text.length > 8192) return false;
  if (isJwt(text)) return true;
  if (HEX_TOKEN.test(text) || UUID.test(text)) return true;
  if (!RANDOM_CHARS.test(text)) return false;
  if (!/[0-9]/.test(text) || !/[A-Za-z]/.test(text)) return false;
  return entropy(text) >= 3.5;
};

/**
 * True when a query parameter name carries a token.
 *
 * @param {string} name
 * @returns {boolean}
 */
const isTokenParam = (name) => {
  const normalized = normalizeKey(name);
  if (!normalized) return false;
  return TOKEN_PARAM_FRAGMENTS.some((fragment) => normalized.includes(fragment));
};

/**
 * Masks the token-carrying parts of an absolute URL: user info, query
 * parameter values whose name carries a token or whose value looks like
 * one, token-like path segments and a fragment with a token. Returns the
 * input unchanged when it is not an http(s) URL.
 *
 * @param {string} value
 * @returns {{value: string, masked: boolean}}
 */
const maskUrl = (value) => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || value.length > 8192) {
    return { value, masked: false };
  }
  let masked = false;
  const hashAt = value.indexOf('#');
  const beforeHash = hashAt === -1 ? value : value.slice(0, hashAt);
  let fragment = hashAt === -1 ? null : value.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  let base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? null : beforeHash.slice(queryAt + 1);

  // scheme://userinfo@host/path -> drop user info.
  const schemeEnd = base.indexOf('://') + 3;
  const pathStart = base.indexOf('/', schemeEnd);
  const authority = pathStart === -1 ? base.slice(schemeEnd) : base.slice(schemeEnd, pathStart);
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    base = `${base.slice(0, schemeEnd)}${authority.slice(at + 1)}${
      pathStart === -1 ? '' : base.slice(pathStart)
    }`;
    masked = true;
  }

  const pathFrom = base.indexOf('/', schemeEnd);
  if (pathFrom !== -1) {
    const segments = base.slice(pathFrom).split('/');
    let changed = false;
    const next = segments.map((segment) => {
      let decoded;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        decoded = segment;
      }
      if (decoded && looksLikeToken(decoded)) {
        changed = true;
        return MASK;
      }
      return segment;
    });
    if (changed) {
      base = base.slice(0, pathFrom) + next.join('/');
      masked = true;
    }
  }

  let nextQuery = query;
  if (query) {
    nextQuery = query
      .split('&')
      .map((pair) => {
        if (!pair) return pair;
        const eq = pair.indexOf('=');
        const name = eq === -1 ? pair : pair.slice(0, eq);
        const raw = eq === -1 ? '' : pair.slice(eq + 1);
        let decodedValue = raw;
        let decodedName = name;
        try {
          decodedValue = decodeURIComponent(raw.replace(/\+/g, ' '));
          decodedName = decodeURIComponent(name);
        } catch {
          // keep the raw form
        }
        if (raw && (isTokenParam(decodedName) || looksLikeToken(decodedValue))) {
          masked = true;
          return `${name}=${MASK}`;
        }
        return pair;
      })
      .join('&');
  }

  if (fragment) {
    const lower = fragment.toLowerCase();
    if (
      fragment.includes('=') ||
      TOKEN_PARAM_FRAGMENTS.some((part) => lower.includes(part)) ||
      looksLikeToken(fragment)
    ) {
      fragment = MASK;
      masked = true;
    }
  }

  const rebuilt = `${base}${nextQuery !== null ? `?${nextQuery}` : ''}${
    fragment !== null ? `#${fragment}` : ''
  }`;
  return { value: masked ? rebuilt : value, masked };
};

/** http(s) URLs inside free text or HTML (one bounded character class). */
const URL_IN_TEXT = /https?:\/\/[^\s"'<>()]{1,2048}/gi;
/** JWTs inside free text. */
const JWT_IN_TEXT = /eyJ[A-Za-z0-9_-]{4,4096}\.[A-Za-z0-9_-]{4,8192}\.[A-Za-z0-9_-]{0,4096}/g;

/**
 * Masks token-carrying URLs and JWTs inside free text or HTML. HTML entity
 * `&amp;` between query parameters is handled like `&`.
 *
 * @param {string} text
 * @returns {{value: string, masked: boolean}}
 */
const maskText = (text) => {
  if (typeof text !== 'string' || text.length === 0) return { value: text, masked: false };
  const input = text.length > LIMITS.textScan ? text.slice(0, LIMITS.textScan) : text;
  let masked = false;
  let value = input.replace(URL_IN_TEXT, (url) => {
    // In HTML attributes `&` is written `&amp;`; mask on the decoded form.
    const decoded = url.includes('&amp;') ? url.split('&amp;').join('&') : url;
    const result = maskUrl(decoded);
    if (!result.masked) return url;
    masked = true;
    return url.includes('&amp;') ? result.value.split('&').join('&amp;') : result.value;
  });
  value = value.replace(JWT_IN_TEXT, () => {
    masked = true;
    return MASK;
  });
  return { value, masked };
};

/**
 * Normalises a settings list (denylist or allowlist): trimmed, lower-cased,
 * separators removed per path segment, numeric segments dropped, empty and
 * duplicate entries removed, bounded.
 *
 * @param {unknown} list
 * @returns {string[]}
 */
const normalizeKeyList = (list) => {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const entry of list.slice(0, LIMITS.listEntries)) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim().slice(0, LIMITS.listEntryLength);
    if (!trimmed) continue;
    const path = trimmed
      .split('.')
      .map(normalizeKey)
      .filter((segment) => segment && !/^\d+$/.test(segment))
      .join('.');
    if (path) out.add(path);
  }
  return [...out];
};

/** Settings key list entry pattern (validation): letters, digits, _ - . */
const KEY_LIST_ENTRY = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * True when `key` (with its dotted `path`) is on a normalised list. An entry
 * matches the key name anywhere, or the full path.
 *
 * @param {string[]} list - normalizeKeyList() output
 * @param {string} key
 * @param {string} path - normalised dotted path without array indices
 * @returns {boolean}
 */
const onList = (list, key, path) =>
  list.length > 0 && (list.includes(normalizeKey(key)) || list.includes(path));

/**
 * Masks a template-data object at store time.
 *
 * Returns a bounded deep copy in which secret values are replaced by MASK,
 * the dotted paths of every masked value, the raw strings that were masked
 * (callers use them to redact the stored HTML copy; they are never stored)
 * and whether anything was cut to fit the limits.
 *
 * @param {unknown} data - Template data of the send
 * @param {{denylist?: string[], allowlist?: string[]}} [options] - Settings lists
 * @returns {{variables: object, maskedPaths: string[], secrets: string[], truncated: boolean, tooLarge: boolean}}
 */
const maskVariables = (data, options = {}) => {
  const denylist = normalizeKeyList(options.denylist);
  const allowlist = normalizeKeyList(options.allowlist);
  const maskedPaths = [];
  const secrets = new Set();
  let truncated = false;

  const remember = (value) => {
    if (typeof value === 'string' && value.length >= 4) secrets.add(value);
    else if (typeof value === 'number' && String(value).length >= 4) secrets.add(String(value));
  };

  const collectSecrets = (value, depth) => {
    if (depth > LIMITS.depth) return;
    if (typeof value === 'string' || typeof value === 'number') remember(value);
    else if (Array.isArray(value)) {
      for (const item of value.slice(0, LIMITS.itemsPerArray)) collectSecrets(item, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value).slice(0, LIMITS.keysPerObject))
        collectSecrets(item, depth + 1);
    }
  };

  const walk = (value, key, displayPath, matchPath, depth) => {
    if (key !== null) {
      const denied = onList(denylist, key, matchPath);
      const allowed = !denied && onList(allowlist, key, matchPath);
      if (denied || (!allowed && isSensitiveKeyName(key))) {
        if (value !== null && value !== undefined && value !== '') {
          maskedPaths.push(displayPath);
          collectSecrets(value, depth);
          return MASK;
        }
        return value ?? null;
      }
      if (typeof value === 'string') {
        if (isJwt(value.trim()) || (!allowed && looksLikeToken(value))) {
          maskedPaths.push(displayPath);
          remember(value);
          return MASK;
        }
      }
    }

    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      let text = value;
      if (text.length > LIMITS.stringLength) {
        text = text.slice(0, LIMITS.stringLength);
        truncated = true;
      }
      const result = maskText(text);
      if (result.masked) {
        if (key !== null) maskedPaths.push(displayPath);
        remember(value);
      }
      return result.value;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value !== 'object') return null;
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return '[binary]';
    if (depth >= LIMITS.depth) {
      truncated = true;
      return null;
    }
    if (Array.isArray(value)) {
      if (value.length > LIMITS.itemsPerArray) truncated = true;
      return value
        .slice(0, LIMITS.itemsPerArray)
        .map((item, index) => walk(item, null, `${displayPath}[${index}]`, matchPath, depth + 1));
    }
    const out = {};
    const entries = Object.entries(value);
    if (entries.length > LIMITS.keysPerObject) truncated = true;
    for (const [childKey, childValue] of entries.slice(0, LIMITS.keysPerObject)) {
      if (childKey === '__proto__' || childKey === 'constructor' || childKey === 'prototype') {
        continue;
      }
      const childDisplay = displayPath ? `${displayPath}.${childKey}` : childKey;
      const normalized = normalizeKey(childKey);
      const childMatch = matchPath ? `${matchPath}.${normalized}` : normalized;
      out[childKey] = walk(childValue, childKey, childDisplay, childMatch, depth + 1);
    }
    return out;
  };

  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const variables = walk(source, null, '', '', 0) || {};
  let tooLarge = false;
  if (Buffer.byteLength(JSON.stringify(variables), 'utf8') > LIMITS.totalBytes) tooLarge = true;
  return {
    variables: tooLarge ? {} : variables,
    maskedPaths: [...new Set(maskedPaths)].slice(0, 500),
    secrets: [...secrets],
    truncated,
    tooLarge,
  };
};

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/**
 * Replaces every occurrence of the given secret strings (plain, HTML
 * escaped and URL encoded) with MASK. Plain string search, no RegExp.
 *
 * @param {string} text
 * @param {string[]} secrets
 * @returns {string}
 */
const redactValues = (text, secrets = []) => {
  if (typeof text !== 'string' || !text || !Array.isArray(secrets)) return text;
  let out = text;
  const forms = new Set();
  for (const secret of secrets.slice(0, 1000)) {
    if (typeof secret !== 'string' || secret.length < 4) continue;
    forms.add(secret);
    forms.add(escapeHtml(secret));
    forms.add(encodeURIComponent(secret));
  }
  // Longest first, so a secret that contains another one is replaced whole.
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    if (form && out.includes(form)) out = out.split(form).join(MASK);
  }
  return out;
};

/**
 * Masks a rendered HTML or text body for storage: token URLs, JWTs and the
 * raw values of every masked variable.
 *
 * @param {string} body
 * @param {string[]} [secrets]
 * @returns {string}
 */
const maskStoredBody = (body, secrets = []) => {
  if (typeof body !== 'string' || !body) return body;
  return maskText(redactValues(body, secrets)).value;
};

module.exports = {
  MASK,
  LIMITS,
  KEY_LIST_ENTRY,
  normalizeKey,
  normalizeKeyList,
  isSensitiveKeyName,
  looksLikeToken,
  isTokenParam,
  maskUrl,
  maskText,
  maskVariables,
  redactValues,
  maskStoredBody,
};
