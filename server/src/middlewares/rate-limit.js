'use strict';

const crypto = require('crypto');
const net = require('net');

/**
 * In-memory per-caller rate limiter for magic-mail Content-API endpoints.
 *
 * The primary purpose is to contain damage from a leaked or compromised
 * API token used to hit /send and /send-message. It is NOT a
 * distributed limiter — if you run multiple Strapi instances behind a
 * load balancer, the quota is per-instance. Replace with a Redis-backed
 * implementation if that is a concern.
 *
 * Keying uses a STABLE bucket id supplied per route (never the raw request
 * path). Keying by `ctx.path` let a caller reset their quota simply by varying
 * a path parameter (email id, link hash) and grew the Map without bound. The
 * caller identity is hashed so tokens and IPs never live in memory as keys.
 *
 * Unauthenticated callers are keyed by `ctx.request.ip`. Behind a reverse
 * proxy, enable `server.proxy` in Strapi, or every client shares the proxy's
 * address and therefore one quota.
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
  let value = String(ip || '').trim().split('%')[0];
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
    ? [...headGroups, ...new Array(Math.max(0, 8 - headGroups.length - tailCount)).fill('0'), ...tailGroups]
    : headGroups;
  return `${groups.slice(0, 4).map((group) => (parseInt(group, 16) || 0).toString(16)).join(':')}::/64`;
};

/**
 * Returns a stable, hashed key identifying the caller for rate-limiting.
 * @param {object} ctx - Koa context
 * @returns {string}
 */
const callerKey = (ctx) => {
  const userId = ctx.state?.user?.id;
  if (userId) return `u:${userId}`;
  const tokenId =
    ctx.state?.auth?.credentials?.id ??
    ctx.state?.auth?.credentials?.token ??
    null;
  if (tokenId) {
    const digest = crypto.createHash('sha256').update(String(tokenId)).digest('hex').slice(0, 16);
    return `t:${digest}`;
  }
  const ip = ipNetworkKey(ctx.request?.ip || ctx.ip || 'unknown');
  return `ip:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
};

/**
 * @param {{ bucket?: string, max?: number, window?: number, degrade?: boolean, hardMax?: number }} cfg
 */
const rateLimit = (cfg = {}, { strapi }) => {
  const max = Number.isFinite(cfg.max) ? cfg.max : 60;
  const windowMs = Number.isFinite(cfg.window) ? cfg.window : 60_000;
  const degrade = cfg.degrade === true;
  const hardMax = Number.isFinite(cfg.hardMax) ? Math.max(cfg.hardMax, max) : max * 10;

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
      entry = { count: 0, expiresAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.expiresAt - now) / 1000);
      if (!entry.warned) {
        // One warning per caller and window (no path, no caller identity).
        entry.warned = true;
        strapi.log.warn(`[magic-mail] Rate limit exceeded on bucket "${routeBucket}" (${max}/${windowMs} ms)`);
      }

      if (degrade && entry.count <= hardMax) {
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
};
/** Test hook: number of live buckets. */
rateLimit.bucketCount = () => buckets.size;

module.exports = rateLimit;
