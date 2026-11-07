'use strict';

const crypto = require('crypto');
const net = require('net');

/**
 * Per-caller rate limiter for magic-mail Content-API and admin test-send
 * endpoints.
 *
 * The primary purpose is to contain damage from a leaked or compromised
 * API token used to hit /send and /send-message.
 *
 * Multi-instance (replicas, pm2 cluster): counters are shared through a
 * store, so the configured limit is global, not per process.
 * - `database` (default whenever Strapi has a knex connection): fixed-window
 *   counters in `magic_mail_rate_limits`, one atomic upsert per counted hit.
 * - `redis`: pass an ioredis / node-redis v4+ client as
 *   `config.rateLimit.redis` and set `config.rateLimit.store = 'redis'`.
 *   On a Redis error the database store is used, then the in-memory count.
 * - `memory`: the pre-4.3 per-process limiter (single instance only).
 * A per-process in-memory count always runs first. For `degrade` buckets
 * (tracking) the shared store is only consulted once the local count of a
 * caller exceeds `localBurst` (default max / 10), so ordinary opens and clicks
 * never write to the database; the accumulated local hits are added then.
 *
 * Keying uses a STABLE bucket id supplied per route (never the raw request
 * path). Keying by `ctx.path` let a caller reset their quota simply by varying
 * a path parameter (email id, link hash) and grew the Map without bound. The
 * caller identity is hashed so tokens and IPs never live in memory as keys.
 *
 * Unauthenticated callers are keyed by `ctx.request.ip`. Behind a reverse
 * proxy (Railway, Render, a load balancer), enable `server.proxy` in Strapi,
 * or every client shares the proxy's address and therefore one quota.
 *
 * `degrade: true` (tracking routes): over `max` the request continues with
 * `ctx.state.magicMailRateLimited = true` so the handler can skip recording
 * while the recipient still gets the redirect / pixel. Only above `hardMax`
 * (default 10 x max) is a plain-text 429 returned.
 *
 * Route-level config shape:
 *   { name: 'plugin::magic-mail.rate-limit', config: { bucket: 'send', max: 60, window: 60000 } }
 *   { name: 'plugin::magic-mail.rate-limit', config: { bucket: 'tracking', max: 300, window: 60000, degrade: true } }
 */

const coordination = require('../utils/coordination');

const buckets = new Map();
const MAX_BUCKETS = 50_000;
/** A full sweep of expired entries runs at most this often (amortised O(1) per request). */
const PRUNE_INTERVAL_MS = 1_000;
let lastPruneAt = 0;

const prune = (now) => {
  lastPruneAt = now;
  for (const [key, entry] of buckets) {
    if (entry.expiresAt <= now) buckets.delete(key);
  }
};

/**
 * Reduces an IPv6 address to its /64 network: a single client usually owns a
 * whole /64, so keying by the full address let one host get a fresh quota
 * (and a fresh map entry) per address. IPv4 and IPv4-mapped addresses are
 * kept as-is.
 *
 * @param {string} ip
 * @returns {string}
 */
const ipNetworkKey = (ip) => {
  let value = String(ip || '')
    .trim()
    .split('%')[0];
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped) return mapped[1];
  if (net.isIP(value) !== 6) return value || 'unknown';
  const lower = value.toLowerCase();
  const [head, tail = ''] = lower.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const tailCount = tailGroups.reduce((sum, group) => sum + (group.includes('.') ? 2 : 1), 0);
  const groups = lower.includes('::')
    ? [
        ...headGroups,
        ...new Array(Math.max(0, 8 - headGroups.length - tailCount)).fill('0'),
        ...tailGroups,
      ]
    : headGroups;
  return `${groups
    .slice(0, 4)
    .map((group) => (parseInt(group, 16) || 0).toString(16))
    .join(':')}::/64`;
};

/**
 * Returns a stable, hashed key identifying the caller for rate-limiting.
 * @param {object} ctx - Koa context
 * @returns {string}
 */
const callerKey = (ctx) => {
  const userId = ctx.state?.user?.id;
  if (userId) return `u:${userId}`;
  const tokenId = ctx.state?.auth?.credentials?.id ?? ctx.state?.auth?.credentials?.token ?? null;
  if (tokenId) {
    const digest = crypto.createHash('sha256').update(String(tokenId)).digest('hex').slice(0, 16);
    return `t:${digest}`;
  }
  const ip = ipNetworkKey(ctx.request?.ip || ctx.ip || 'unknown');
  return `ip:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
};

const STORE_WARN_INTERVAL_MS = 60_000;
let lastStoreWarnAt = 0;

/**
 * Logs a shared-store failure at most once a minute (no keys, no secrets).
 * @param {object} strapi
 * @param {string} store
 * @param {unknown} error
 */
const warnStoreFailure = (strapi, store, error) => {
  const now = Date.now();
  if (now - lastStoreWarnAt < STORE_WARN_INTERVAL_MS) return;
  lastStoreWarnAt = now;
  strapi.log.warn(
    `[magic-mail] Rate-limit store "${store}" failed (${error?.name || 'Error'}); using the next store`
  );
};

/**
 * Reads `plugin::magic-mail.rateLimit` without throwing on test doubles.
 * @param {object} strapi
 * @returns {{store?: string, redis?: object, redisPrefix?: string}}
 */
const readStoreConfig = (strapi) => {
  try {
    const value = strapi?.config?.get?.('plugin::magic-mail.rateLimit');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

/**
 * Adds `increment` hits in Redis (ioredis or node-redis v4+ client).
 *
 * @param {object} client
 * @param {string} prefix
 * @param {string} key
 * @param {number} windowMs
 * @param {number} increment
 * @returns {Promise<{count: number, resetAt: number}>}
 */
async function redisHit(client, prefix, key, windowMs, increment) {
  const incrBy = client.incrby || client.incrBy;
  const pexpire = client.pexpire || client.pExpire;
  if (typeof incrBy !== 'function' || typeof pexpire !== 'function') {
    throw new TypeError('config.rateLimit.redis must provide incrby/incrBy and pexpire/pExpire');
  }
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const redisKey = `${prefix}${key}@${windowStart}`;
  const count = Number(await incrBy.call(client, redisKey, increment));
  // The key is unique per window, so (re)setting its expiry is idempotent.
  if (count === increment) await pexpire.call(client, redisKey, windowMs + 1000);
  return { count, resetAt: windowStart + windowMs };
}

/**
 * Adds hits to the shared store chain (redis -> database). Returns null when
 * no shared store is configured or every store failed (caller then uses the
 * per-process count).
 *
 * @param {object} strapi
 * @param {string} key
 * @param {number} windowMs
 * @param {number} increment
 * @returns {Promise<{count: number, resetAt: number}|null>}
 */
async function sharedHit(strapi, key, windowMs, increment) {
  const config = readStoreConfig(strapi);
  const store = config.store || 'database';
  if (store === 'memory') return null;
  if (store === 'redis' && config.redis) {
    try {
      return await redisHit(
        config.redis,
        typeof config.redisPrefix === 'string' ? config.redisPrefix : 'magic-mail:rl:',
        key,
        windowMs,
        increment
      );
    } catch (error) {
      warnStoreFailure(strapi, 'redis', error);
    }
  }
  try {
    return await coordination.hitRateLimit(strapi, key, windowMs, increment);
  } catch (error) {
    warnStoreFailure(strapi, 'database', error);
    return null;
  }
}

/**
 * @param {{ bucket?: string, max?: number, window?: number, degrade?: boolean, hardMax?: number, localBurst?: number }} cfg
 */
const rateLimit = (cfg = {}, { strapi }) => {
  const max = Number.isFinite(cfg.max) ? cfg.max : 60;
  const windowMs = Number.isFinite(cfg.window) && cfg.window > 0 ? cfg.window : 60_000;
  const degrade = cfg.degrade === true;
  const hardMax = Number.isFinite(cfg.hardMax) ? Math.max(cfg.hardMax, max) : max * 10;
  // Hits a caller may make in one process before the shared store is asked.
  const localBurst = Number.isFinite(cfg.localBurst)
    ? Math.max(1, Math.floor(cfg.localBurst))
    : degrade
      ? Math.max(1, Math.floor(max / 10))
      : 1;

  return async (ctx, next) => {
    // A stable bucket id keeps all requests to one logical endpoint in a single
    // quota regardless of dynamic path segments. Prefer the explicit config
    // bucket, then the matched route definition path, never the raw request URL.
    const routeBucket = cfg.bucket || ctx.state?.route?.path || 'magic-mail';
    const key = `${routeBucket}::${callerKey(ctx)}`;
    const now = Date.now();

    // Opportunistically drop expired entries so the map cannot grow unbounded.
    // Throttled: a sweep on every request made each request O(map size), a
    // CPU amplifier on the public tracking routes.
    if (buckets.size > 1000 && now - lastPruneAt >= PRUNE_INTERVAL_MS) prune(now);
    // Hard ceiling: if many distinct callers are still live, drop the oldest
    // entries instead of growing without bound.
    if (buckets.size > MAX_BUCKETS) {
      const excess = buckets.size - MAX_BUCKETS;
      let dropped = 0;
      for (const bucketKey of buckets.keys()) {
        if (dropped >= excess) break;
        buckets.delete(bucketKey);
        dropped += 1;
      }
    }

    let entry = buckets.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = {
        count: 0,
        unflushed: 0,
        expiresAt: now + windowMs,
        blockedUntil: 0,
        blockedCount: 0,
      };
      buckets.set(key, entry);
    }

    entry.count += 1;
    entry.unflushed += 1;

    // Shared count across processes (database / redis). Local count first:
    // below `localBurst` nothing is written; the hits are added later.
    let count = entry.count;
    let resetAt = entry.expiresAt;
    if (entry.blockedUntil > now) {
      // Already over the hard limit in the shared window: answer from memory,
      // so a flood can not turn into one database write per request.
      count = Math.max(count, entry.blockedCount);
      resetAt = entry.blockedUntil;
    } else if (entry.count >= localBurst) {
      const increment = entry.unflushed;
      entry.unflushed = 0;
      const shared = await sharedHit(strapi, key, windowMs, increment);
      if (shared) {
        count = Math.max(shared.count, entry.count);
        resetAt = shared.resetAt;
        if (count > (degrade ? hardMax : max)) {
          entry.blockedUntil = resetAt;
          entry.blockedCount = count;
        }
      } else {
        // No shared store: keep the unflushed hits for the next attempt.
        entry.unflushed += increment;
      }
    }

    if (count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
      if (!entry.warned) {
        // One warning per caller and window (no path, no caller identity).
        entry.warned = true;
        strapi.log.warn(
          `[magic-mail] Rate limit exceeded on bucket "${routeBucket}" (${max}/${windowMs} ms)`
        );
      }

      if (degrade && count <= hardMax) {
        ctx.state = ctx.state || {};
        ctx.state.magicMailRateLimited = true;
        await next();
        return;
      }

      ctx.set('Retry-After', String(retryAfterSec));
      if (degrade) {
        ctx.status = 429;
        ctx.type = 'text/plain; charset=utf-8';
        ctx.body = 'Too many requests. Please try again later.';
        return;
      }
      ctx.status = 429;
      ctx.body = {
        data: null,
        error: {
          status: 429,
          name: 'TooManyRequestsError',
          message: 'Too many requests. Please slow down.',
          details: { retryAfter: retryAfterSec },
        },
      };
      return;
    }

    await next();
  };
};

rateLimit.ipNetworkKey = ipNetworkKey;
/** Test hook: clears all buckets. */
rateLimit.resetForTests = () => {
  buckets.clear();
  lastPruneAt = 0;
  lastStoreWarnAt = 0;
};
rateLimit.redisHit = redisHit;
/** Test hook: number of live buckets. */
rateLimit.bucketCount = () => buckets.size;

module.exports = rateLimit;
