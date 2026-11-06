'use strict';

const crypto = require('crypto');
const { derivePurposeKey } = require('./encryption');

/**
 * OAuth state & PKCE helper.
 *
 * OAuth state is an HMAC-signed payload (clientId, provider, admin user id,
 * timestamp, nonce). The token exchange verifies the HMAC, the 10 minute
 * TTL, the client id and the initiating admin, and consumes the nonce so it
 * can not be replayed (RFC 6819 CSRF protection, RFC 9700 binding).
 *
 * PKCE (RFC 7636): the code_verifier is generated at initiation time and
 * kept server-side in ONE plugin-store entry (`oauth:pending`) keyed by
 * nonce. Every create/consume prunes entries older than the TTL, so
 * abandoned flows never accumulate rows. All read-modify-write cycles on
 * that entry run under one in-process lock.
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_STORE_KEY = 'oauth:pending';
const MAX_PENDING_FLOWS = 200;
/** Pre-4.0 per-flow keys (`oauth:pkce:<nonce>`) and the separate used list. */
const LEGACY_PKCE_PREFIX = 'oauth:pkce:';
const LEGACY_USED_STATE_KEY = 'oauth:usedStates';

/**
 * In-process serialization queue. The plugin store has no compare-and-set,
 * so the pending map is only read and written inside `runExclusive`.
 *
 * Single-instance atomicity: horizontally scaled deployments should run the
 * OAuth flow against one instance (sticky admin sessions); the signed,
 * TTL-bounded, user-bound state keeps the residual window small.
 */
const locks = new Map();

/**
 * Runs `task` with exclusive access for `key`.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
async function runExclusive(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const composed = previous.then(() => current);
  locks.set(key, composed);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(key) === composed) locks.delete(key);
  }
}

/**
 * Returns the HMAC key for state signatures: an HKDF subkey (purpose
 * `oauth-state`) of MAGIC_MAIL_OAUTH_STATE_SECRET, else
 * MAGIC_MAIL_ENCRYPTION_KEY, else the first Strapi app key.
 *
 * @param {object} strapi
 * @returns {Buffer}
 */
function getSigningKey(strapi) {
  const configKeys = strapi?.config?.get?.('server.app.keys');
  const appKey =
    (Array.isArray(configKeys) ? configKeys[0] : null) ||
    String(process.env.APP_KEYS || '')
      .split(',')
      .map((key) => key.trim())
      .find(Boolean);
  const material =
    process.env.MAGIC_MAIL_OAUTH_STATE_SECRET || process.env.MAGIC_MAIL_ENCRYPTION_KEY || appKey;

  if (!material) {
    throw new Error(
      '[magic-mail] No signing secret available for OAuth state. Set MAGIC_MAIL_OAUTH_STATE_SECRET or APP_KEYS.'
    );
  }
  return derivePurposeKey(material, 'oauth-state');
}

/** @returns {object} plugin store */
const pluginStore = (strapi) => strapi.store({ type: 'plugin', name: 'magic-mail' });

/**
 * Removes expired entries and caps the map size (oldest first).
 *
 * @param {Record<string, {createdAt: number}>} pending
 * @param {number} now
 * @returns {Record<string, object>}
 */
function prunePending(pending, now) {
  const fresh = Object.entries(
    pending && typeof pending === 'object' && !Array.isArray(pending) ? pending : {}
  )
    .filter(
      ([, entry]) =>
        entry && Number.isFinite(entry.createdAt) && now - entry.createdAt <= STATE_TTL_MS
    )
    .sort(([, a], [, b]) => a.createdAt - b.createdAt)
    .slice(-MAX_PENDING_FLOWS);
  return Object.fromEntries(fresh);
}

let legacyCleanupDone = false;

/**
 * One-time removal of pre-4.0 per-flow PKCE rows and the used-state list.
 * Best effort: failures are ignored (rows are harmless, just clutter).
 *
 * @param {object} strapi
 * @returns {Promise<void>}
 */
async function cleanupLegacyRows(strapi) {
  if (legacyCleanupDone) return;
  legacyCleanupDone = true;
  try {
    const query = strapi?.db?.query?.('strapi::core-store');
    if (query?.deleteMany) {
      await query.deleteMany({
        where: { key: { $startsWith: `plugin_magic-mail_${LEGACY_PKCE_PREFIX}` } },
      });
    }
    await pluginStore(strapi).delete({ key: LEGACY_USED_STATE_KEY });
  } catch {
    // ignore
  }
}

/**
 * Normalises an admin user id for comparison.
 *
 * @param {unknown} userId
 * @returns {string|null}
 */
const normalizeUserId = (userId) =>
  userId === undefined || userId === null || userId === '' ? null : String(userId);

/**
 * Creates a signed, one-time-use OAuth state with PKCE.
 *
 * @param {object} strapi
 * @param {object} params
 * @param {string} params.clientId - OAuth client ID we are authenticating against
 * @param {string} [params.provider] - 'gmail' | 'microsoft' | 'yahoo'
 * @param {string|number} [params.userId] - Initiating admin user id (bound into the state)
 * @param {string} [params.accountId] - documentId of the account being reconnected
 * @param {boolean} [params.usePKCE=true]
 * @returns {Promise<{state: string, codeChallenge: string|null, codeChallengeMethod: string|null}>}
 */
async function createState(strapi, { clientId, provider, userId, accountId, usePKCE = true }) {
  if (!clientId) throw new Error('clientId is required');

  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();

  const payload = {
    clientId,
    provider,
    uid: normalizeUserId(userId),
    acc: accountId || null,
    timestamp,
    nonce,
    pkce: usePKCE,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningKey(strapi))
    .update(payloadB64)
    .digest('base64url');
  const state = `${payloadB64}.${sig}`;

  let codeVerifier = null;
  let codeChallenge = null;
  let codeChallengeMethod = null;
  if (usePKCE) {
    codeVerifier = crypto.randomBytes(32).toString('base64url');
    codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    codeChallengeMethod = 'S256';
  }

  try {
    await runExclusive(PENDING_STORE_KEY, async () => {
      const store = pluginStore(strapi);
      const pending = prunePending(await store.get({ key: PENDING_STORE_KEY }), timestamp);
      pending[nonce] = { codeVerifier, createdAt: timestamp };
      await store.set({ key: PENDING_STORE_KEY, value: prunePending(pending, timestamp) });
    });
  } catch (err) {
    throw new Error(`[magic-mail] Could not persist PKCE verifier: ${err.message}`);
  }

  await cleanupLegacyRows(strapi);

  return { state, codeChallenge, codeChallengeMethod };
}

/**
 * Verifies a state string: signature, TTL, client id, initiating admin and
 * one-time use. Consumes the pending flow.
 *
 * @param {object} strapi
 * @param {string} stateString
 * @param {string|{clientId?: string, userId?: string|number, accountId?: string}} [expected]
 *   Expected client id (string, legacy signature) or an object of expectations
 * @returns {Promise<{payload: object, codeVerifier: string|null}>}
 * @throws {Error} When verification fails
 */
async function verifyAndConsumeState(strapi, stateString, expected = {}) {
  const expectations = typeof expected === 'string' ? { clientId: expected } : expected || {};

  if (!stateString || typeof stateString !== 'string') {
    throw new Error('Missing state');
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed state');
  }
  const [payloadB64, sig] = parts;

  const expectedSig = crypto
    .createHmac('sha256', getSigningKey(strapi))
    .update(payloadB64)
    .digest('base64url');
  const sigOk =
    sig.length === expectedSig.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  if (!sigOk) {
    throw new Error('Invalid state signature');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    throw new Error('Malformed state payload');
  }

  if (
    !payload ||
    !Number.isFinite(payload.timestamp) ||
    typeof payload.nonce !== 'string' ||
    !/^[a-f0-9]{32}$/.test(payload.nonce)
  ) {
    throw new Error('Incomplete state payload');
  }

  const age = Date.now() - payload.timestamp;
  if (age < -30_000 || age > STATE_TTL_MS) {
    throw new Error('State expired');
  }

  if (expectations.clientId !== undefined && payload.clientId !== expectations.clientId) {
    throw new Error('State clientId mismatch');
  }
  if (
    'userId' in expectations &&
    normalizeUserId(payload.uid) !== normalizeUserId(expectations.userId)
  ) {
    throw new Error('State was issued to another admin user');
  }
  if ('accountId' in expectations && (payload.acc || null) !== (expectations.accountId || null)) {
    throw new Error('State was issued for another account');
  }

  return runExclusive(PENDING_STORE_KEY, async () => {
    const store = pluginStore(strapi);
    const now = Date.now();
    const pending = prunePending(await store.get({ key: PENDING_STORE_KEY }), now);
    const entry = pending[payload.nonce];

    if (!entry) {
      throw new Error('State already used or expired (replay protection)');
    }

    delete pending[payload.nonce];
    await store.set({ key: PENDING_STORE_KEY, value: pending });

    if (payload.pkce && !entry.codeVerifier) {
      throw new Error('PKCE verifier is missing');
    }

    return { payload, codeVerifier: entry.codeVerifier || null };
  });
}

/** Test hook: resets the one-time legacy cleanup flag. */
function resetLegacyCleanupForTests() {
  legacyCleanupDone = false;
}

module.exports = {
  createState,
  verifyAndConsumeState,
  STATE_TTL_MS,
  PENDING_STORE_KEY,
  resetLegacyCleanupForTests,
};
