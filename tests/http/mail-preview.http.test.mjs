/**
 * Real Strapi HTTP tests of the email preview (run against an isolated acceptance host, never a
 * shared or production instance). The host must have sent synthetic mails through Magic Mail
 * (templates with secret-looking variables) and have a second admin role with Magic Mail `read`
 * but without `content.read`.
 *
 *   MM_HTTP_BASE=http://127.0.0.1:1681 \
 *   MM_HTTP_CREDS=/path/creds.json   # { admin: {email,password}, analyst: {email,password} }
 *   MM_HTTP_MARKERS=/path/markers.json   # synthetic secret values that were sent as variables
 *   MM_HTTP_DB=/path/review.db       # SQLite file of the host (store-time check)
 *   npm run test:http
 *
 * The suite fails (it does not skip) when any of these is missing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { before, test } from 'node:test';

const require = createRequire(import.meta.url);
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the HTTP suite (no silent skip)`);
  return value;
};
const BASE = env('MM_HTTP_BASE');
const creds = JSON.parse(fs.readFileSync(env('MM_HTTP_CREDS'), 'utf8'));
const markers = JSON.parse(fs.readFileSync(env('MM_HTTP_MARKERS'), 'utf8'));
const DB = env('MM_HTTP_DB');

const login = async ({ email, password }) => {
  const res = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, 'admin login');
  return (await res.json()).data.token;
};
const get = (path, token) =>
  fetch(`${BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

let adminToken;
let analystToken;
let logs;

before(async () => {
  adminToken = await login(creds.admin);
  analystToken = await login(creds.analyst);
  const res = await get('/magic-mail/analytics/emails?pageSize=100', adminToken);
  assert.equal(res.status, 200);
  logs = (await res.json()).data;
  assert.ok(logs.length >= 3, 'the host has sent mails');
});

const byTemplate = (name) => logs.find((log) => (log.templateName || '').startsWith(name));

test('anonymous callers get 401 and no content', async () => {
  const res = await get(`/magic-mail/analytics/emails/${logs[0].emailId}/content`);
  assert.equal(res.status, 401);
  assert.doesNotMatch(await res.text(), /variables|<html/i);
});

test('an admin with read but without content.read gets 403; the log itself stays readable', async () => {
  const log = byTemplate('Order confirmation');
  const content = await get(`/magic-mail/analytics/emails/${log.emailId}/content`, analystToken);
  assert.equal(content.status, 403);
  const body = await content.json();
  assert.equal(body.error.name, 'PolicyError');
  assert.equal(body.data, null);
  const detail = await get(`/magic-mail/analytics/emails/${log.emailId}`, analystToken);
  assert.equal(detail.status, 200);
});

test('super admin gets the re-rendered preview with masked variables and no secret', async () => {
  const log = byTemplate('Order confirmation');
  const res = await get(`/magic-mail/analytics/emails/${log.emailId}/content`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const text = await res.text();
  for (const [name, value] of Object.entries(markers)) {
    assert.ok(!text.includes(value), `${name} never leaves the server`);
  }
  const { data } = JSON.parse(text);
  assert.equal(data.state, 'rerendered');
  assert.equal(data.variablesState, 'stored');
  assert.equal(data.variables.sessionJwt, '••••••');
  assert.equal(data.variables.customer.customerNumber, '••••••', 'settings denylist');
  assert.match(data.variables.orderUrl, /\?token=••••••$/);
  assert.match(data.html, /Thank you, /);
  assert.doesNotMatch(data.html, /magic-mail\/track/);
  assert.doesNotMatch(data.html, /\shref=/i);
  assert.match(data.html, /img-src data:;/);
  assert.ok(data.images.blocked >= 1);
});

test('Load images keeps remote images but still no tracking URL', async () => {
  const log = byTemplate('Order confirmation');
  const res = await get(`/magic-mail/analytics/emails/${log.emailId}/content?images=1`, adminToken);
  const { data } = await res.json();
  assert.match(data.html, /cdn\.shop\.example\.test\/logo\.png/);
  assert.doesNotMatch(data.html, /magic-mail\/track/);
});

test('viewing the preview never counts an open or a click', async () => {
  const log = byTemplate('Order confirmation');
  const before = await (
    await get(`/magic-mail/analytics/emails/${log.emailId}`, adminToken)
  ).json();
  for (let i = 0; i < 3; i += 1) {
    await get(`/magic-mail/analytics/emails/${log.emailId}/content?images=1`, adminToken);
  }
  const after = await (await get(`/magic-mail/analytics/emails/${log.emailId}`, adminToken)).json();
  assert.equal(after.data.openCount, before.data.openCount);
  assert.equal(after.data.clickCount, before.data.clickCount);
});

test('deleted template version: the subject and variables remain, the body is reported missing', async () => {
  const log = byTemplate('Password reset');
  const { data } = await (
    await get(`/magic-mail/analytics/emails/${log.emailId}/content`, adminToken)
  ).json();
  assert.equal(data.state, 'templateMissing');
  assert.equal(data.html, null);
  assert.equal(data.subject, 'Reset your password');
  assert.equal(data.variables.otp, '••••••');
  // The key itself names a reset link, so the whole value is hidden.
  assert.equal(data.variables.resetUrl, '••••••');
});

test('validation and not-found errors use the Strapi error envelope', async () => {
  const bad = await get(`/magic-mail/analytics/emails/${logs[0].emailId}/content?x=1`, adminToken);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.name, 'ValidationError');
  const missing = await get(`/magic-mail/analytics/emails/${'0'.repeat(32)}/content`, adminToken);
  assert.equal(missing.status, 404);
  const malformed = await get('/magic-mail/analytics/emails/not-an-id/content', adminToken);
  assert.equal(malformed.status, 404);
});

test('the Content API exposes no preview data', async () => {
  for (const path of [
    `/api/magic-mail/analytics/emails/${logs[0].emailId}/content`,
    '/api/email-contents',
    '/api/magic-mail/email-contents',
  ]) {
    const res = await get(path);
    assert.ok([403, 404, 405].includes(res.status), `${path}: ${res.status}`);
    assert.doesNotMatch(await res.text(), /variables|htmlCopy/);
  }
  const graphql = await fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ emailContents { documentId } }' }),
  });
  assert.ok([400, 404, 405].includes(graphql.status), `graphql: ${graphql.status}`);
});

test('store time: the database holds no secret value at all', () => {
  const Database = require('better-sqlite3');
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try {
    const dump = JSON.stringify(db.prepare('select * from magic_mail_email_contents').all());
    for (const [name, value] of Object.entries(markers)) {
      assert.ok(!dump.includes(value), `${name} is not stored`);
    }
    const core = db
      .prepare('select variables from magic_mail_email_contents where variables is not null')
      .all()
      .map((row) => JSON.parse(row.variables))
      .filter((variables) => 'TOKEN' in variables);
    assert.ok(core.length >= 1, 'the users-permissions reset mail was recorded');
    for (const variables of core) assert.equal(variables.TOKEN, '••••••');
  } finally {
    db.close();
  }
});
