'use strict';

const crypto = require('crypto');

/**
 * In-memory per-caller rate limiter for magic-mail Content-API endpoints.
 *
 * The primary purpose is to contain damage from a leaked or compromised
 * API token used to hit /send, /send-message, /send-whatsapp. It is NOT a
 * distributed limiter — if you run multiple Strapi instances behind a
 * load balancer, the quota is per-instance. Replace with a Redis-backed
 * implementation if that is a concern.
 *
 * Keying uses a STABLE bucket id supplied per route (never the raw request
 * path). Keying by `ctx.path` let a caller reset their quota simply by varying
 * a path parameter (email id, link hash, phone number) and grew the Map without
 * bound. The caller identity is hashed so tokens never live in memory as keys.
 *
 * Route-level config shape:
 *   { name: 'plugin::magic-mail.rate-limit', config: { bucket: 'send', max: 60, window: 60000 } }
 */

const buckets = new Map();

const prune = (now) => {
  for (const [key, entry] of buckets) {
    if (entry.expiresAt <= now) buckets.delete(key);
  }
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
  return `ip:${ctx.request.ip || ctx.ip || 'unknown'}`;
};

/**
 * @param {{ bucket?: string, max?: number, window?: number }} cfg
 */
const rateLimit = (cfg = {}, { strapi }) => {
  const max = Number.isFinite(cfg.max) ? cfg.max : 60;
  const windowMs = Number.isFinite(cfg.window) ? cfg.window : 60_000;

  return async (ctx, next) => {
    // A stable bucket id keeps all requests to one logical endpoint in a single
    // quota regardless of dynamic path segments. Prefer the explicit config
    // bucket, then the matched route definition path, never the raw request URL.
    const routeBucket = cfg.bucket || ctx.state?.route?.path || 'magic-mail';
    const key = `${routeBucket}::${callerKey(ctx)}`;
    const now = Date.now();

    // Opportunistically drop expired entries so the map cannot grow unbounded.
    if (buckets.size > 1000) prune(now);

    let entry = buckets.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.expiresAt - now) / 1000);
      ctx.set('Retry-After', String(retryAfterSec));
      strapi.log.warn(
        `[magic-mail] Rate limit exceeded on ${ctx.path} for ${callerKey(ctx)} (${entry.count}/${max})`
      );
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

module.exports = rateLimit;
