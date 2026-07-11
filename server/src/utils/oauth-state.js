'use strict';

const crypto = require('crypto');

/**
 * OAuth state & PKCE helper.
 *
 * OAuth state is generated as an HMAC-signed payload (clientId + timestamp +
 * nonce). The callback / token-exchange code verifies the HMAC, checks the
 * timestamp (10 min TTL), and records the nonce as "used" so it cannot be
 * replayed. This closes the classic OAuth CSRF gap described in RFC 6819.
 *
 * PKCE (RFC 7636) code_verifier is generated at initiation time, hashed with
 * SHA-256 to produce the code_challenge, and stashed under the state nonce so
 * the token exchange can retrieve it.
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const USED_STATE_STORE_KEY = 'oauth:usedStates';
const PKCE_STORE_KEY_PREFIX = 'oauth:pkce:';

/**
 * Per-nonce in-process serialization queue.
 *
 * The plugin store exposes no compare-and-set primitive, so a naive
 * get -> check -> set consumption sequence has a TOCTOU race: two concurrent
 * token exchanges with the same freshly minted state could both read the
 * "used" list before either writes it and both succeed. Serializing the
 * critical section per nonce guarantees exactly one winner within a Strapi
 * instance.
 *
 * Note: this is single-instance atomicity. Horizontally scaled deployments
 * should additionally front OAuth with a shared store (Redis GETDEL or a
 * unique DB constraint); the signed + TTL-bounded + single-use design keeps
 * the residual multi-instance window negligible.
 */
const nonceLocks = new Map();

/**
 * Runs `task` with exclusive access for `key`, serializing concurrent callers.
 *
 * @param {string} key
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 * @template T
 */
async function runExclusive(key, task) {
  const previous = nonceLocks.get(key) || Promise.resolve();
  let resolveCurrent;
  const current = new Promise((resolve) => { resolveCurrent = resolve; });
  const composed = previous.then(() => current);
  nonceLocks.set(key, composed);

  await previous;
  try {
    return await task();
  } finally {
    resolveCurrent();
    if (nonceLocks.get(key) === composed) {
      nonceLocks.delete(key);
    }
  }
}

/**
 * Returns the signing secret for state HMACs.
 * Derived from APP_KEYS / JWT_SECRET / API_TOKEN_SALT — any one is sufficient.
 *
 * @param {object} strapi
 * @returns {Buffer}
 */
function getSigningSecret(strapi) {
  const candidates = [
    process.env.MAGIC_MAIL_OAUTH_STATE_SECRET,
    process.env.APP_KEYS,
    strapi?.config?.get?.('server.app.keys')?.[0],
    process.env.API_TOKEN_SALT,
    process.env.JWT_SECRET,
  ].filter(Boolean);

  if (candidates.length === 0) {
    throw new Error('[magic-mail] No signing secret available for OAuth state. Set MAGIC_MAIL_OAUTH_STATE_SECRET or APP_KEYS.');
  }
  return crypto.createHash('sha256').update(String(candidates[0])).digest();
}

/**
 * Creates a signed, one-time-use OAuth state with optional PKCE.
 *
 * @param {object} strapi
 * @param {object} params
 * @param {string} params.clientId - OAuth client ID we are authenticating against
 * @param {string} [params.provider] - 'gmail' | 'microsoft' | 'yahoo'
 * @param {boolean} [params.usePKCE=true]
 * @returns {Promise<{state: string, codeChallenge: string|null, codeChallengeMethod: string|null}>}
 */
async function createState(strapi, { clientId, provider, usePKCE = true }) {
  if (!clientId) throw new Error('clientId is required');

  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();

  const payload = { clientId, provider, timestamp, nonce, pkce: usePKCE };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');

  const sig = crypto
    .createHmac('sha256', getSigningSecret(strapi))
    .update(payloadB64)
    .digest('base64url');

  const state = `${payloadB64}.${sig}`;

  let codeChallenge = null;
  let codeChallengeMethod = null;
  if (usePKCE) {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    codeChallengeMethod = 'S256';

    try {
      const store = strapi.store({ type: 'plugin', name: 'magic-mail' });
      const key = `${PKCE_STORE_KEY_PREFIX}${nonce}`;
      await store.set({ key, value: { codeVerifier, createdAt: timestamp } });
    } catch (err) {
      throw new Error(`[magic-mail] Could not persist PKCE verifier: ${err.message}`);
    }
  }

  return { state, codeChallenge, codeChallengeMethod };
}

/**
 * Verifies a state string: signature, TTL, and one-time-use guarantee.
 *
 * @param {object} strapi
 * @param {string} stateString
 * @param {string} [expectedClientId] - Optional clientId to cross-check
 * @returns {Promise<{payload: object, codeVerifier: string|null}>} Verified payload + PKCE verifier (if present)
 * @throws {Error} When verification fails
 */
async function verifyAndConsumeState(strapi, stateString, expectedClientId) {
  if (!stateString || typeof stateString !== 'string') {
    throw new Error('Missing state');
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed state');
  }

  const [payloadB64, sig] = parts;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret(strapi))
    .update(payloadB64)
    .digest('base64url');

  const sigOk = sig.length === expectedSig.length &&
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

  if (!Number.isFinite(payload.timestamp) || typeof payload.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(payload.nonce)) {
    throw new Error('Incomplete state payload');
  }

  const age = Date.now() - payload.timestamp;
  if (age < -30_000 || age > STATE_TTL_MS) {
    throw new Error('State expired');
  }

  if (expectedClientId && payload.clientId !== expectedClientId) {
    throw new Error('State clientId mismatch');
  }

  const store = strapi.store({ type: 'plugin', name: 'magic-mail' });

  // Serialize the check-then-consume window per nonce so exactly one concurrent
  // caller can claim a given state.
  return runExclusive(payload.nonce, async () => {
    const usedRaw = await store.get({ key: USED_STATE_STORE_KEY });
    const used = Array.isArray(usedRaw) ? usedRaw : [];

    if (used.some((entry) => entry.nonce === payload.nonce)) {
      throw new Error('State already used (replay protection)');
    }

    const now = Date.now();
    const pruned = used.filter((entry) => now - entry.ts < STATE_TTL_MS);
    pruned.push({ nonce: payload.nonce, ts: now });
    const capped = pruned.slice(-500);
    await store.set({ key: USED_STATE_STORE_KEY, value: capped });

    let codeVerifier = null;
    try {
      const pkceKey = `${PKCE_STORE_KEY_PREFIX}${payload.nonce}`;
      const record = await store.get({ key: pkceKey });
      if (record && record.codeVerifier) {
        codeVerifier = record.codeVerifier;
        await store.delete({ key: pkceKey });
      }
    } catch (err) {
      if (payload.pkce) {
        throw new Error(`PKCE verifier could not be consumed: ${err.message}`);
      }
    }

    if (payload.pkce && !codeVerifier) {
      throw new Error('PKCE verifier is missing or already consumed');
    }

    return { payload, codeVerifier };
  });
}

module.exports = {
  createState,
  verifyAndConsumeState,
  STATE_TTL_MS,
};
