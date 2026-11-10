'use strict';

/**
 * Pre-send recipient domain checks. Cheap, local and deterministic by
 * default; the MX lookup is opt-in.
 *
 *  - Reserved names never deliver: the TLDs `.test`, `.invalid`, `.example`
 *    and `.localhost` (RFC 2606, RFC 6761) and the reserved second-level
 *    domains example.com/.net/.org. Rejected as INVALID_RECIPIENT_DOMAIN
 *    unless the owner allows them (development hosts).
 *  - Well-known typo domains of large mailbox providers (googelmail.com,
 *    gmial.com, gmx.ed, ...) are rejected as RECIPIENT_DOMAIN_TYPO with the
 *    likely intended domain as a suggestion. Such mails are accepted by the
 *    provider and bounce later (often after a multi-day retry window).
 *  - Optional: a domain without MX and A/AAAA records (NXDOMAIN or no data)
 *    is rejected as INVALID_RECIPIENT_DOMAIN. Lookups time out after 3 s and
 *    are cached; any other DNS error lets the mail through.
 */

const dns = require('node:dns');

const RESERVED_TLDS = ['test', 'invalid', 'example', 'localhost'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];

/** Typo → intended domain. Lower-case, exact matches only. */
const TYPO_DOMAINS = Object.freeze({
  'googelmail.com': 'googlemail.com',
  'googlemail.co': 'googlemail.com',
  'googlemial.com': 'googlemail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.de': 'gmail.com',
  'gmx.ed': 'gmx.de',
  'gmx.dee': 'gmx.de',
  'gmx.d': 'gmx.de',
  'gmx.nett': 'gmx.net',
  'gmx.ne': 'gmx.net',
  'gmxx.de': 'gmx.de',
  'web.ed': 'web.de',
  'web.dee': 'web.de',
  'wbe.de': 'web.de',
  'weeb.de': 'web.de',
  't-onlien.de': 't-online.de',
  't-onine.de': 't-online.de',
  't-onlin.de': 't-online.de',
  't-online.com': 't-online.de',
  'tonline.de': 't-online.de',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'icloud.co': 'icloud.com',
  'icoud.com': 'icloud.com',
  'iclod.com': 'icloud.com',
  'freenet.dee': 'freenet.de',
  'onlinde.de': 'online.de',
});

const MX_TIMEOUT_MS = 3_000;
const MX_CACHE_MS = 60 * 60_000;
const MX_CACHE_MAX = 2_000;
const mxCache = new Map();
let resolver = {
  resolveMx: (domain) => dns.promises.resolveMx(domain),
  resolve4: (domain) => dns.promises.resolve4(domain),
};

/**
 * @param {string} address
 * @returns {string} lower-case domain or ''
 */
function domainOf(address) {
  const at = String(address || '').lastIndexOf('@');
  return at === -1
    ? ''
    : String(address)
        .slice(at + 1)
        .trim()
        .toLowerCase()
        .replace(/\.$/, '');
}

/** @param {string} domain @returns {boolean} */
function isReservedDomain(domain) {
  if (!domain) return false;
  const tld = domain.split('.').pop();
  if (RESERVED_TLDS.includes(tld)) return true;
  return RESERVED_DOMAINS.some(
    (reserved) => domain === reserved || domain.endsWith(`.${reserved}`)
  );
}

/** @param {string} domain @returns {string|null} intended domain */
function typoSuggestion(domain) {
  return TYPO_DOMAINS[domain] || null;
}

/**
 * Promise with a timeout; resolves `fallback` when it fires.
 */
function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
      timer.unref?.();
    }),
  ]);
}

/**
 * Whether a domain can receive mail (MX, or A as the implicit MX of RFC 5321).
 * `null` means unknown (timeout or DNS failure): the mail is not blocked.
 *
 * @param {string} domain
 * @returns {Promise<boolean|null>}
 */
async function domainAcceptsMail(domain) {
  const cached = mxCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const lookup = async () => {
    try {
      const mx = await resolver.resolveMx(domain);
      if (Array.isArray(mx) && mx.length) {
        // RFC 7505 null MX ("." with preference 0) means: no mail.
        return !(mx.length === 1 && (mx[0].exchange === '' || mx[0].exchange === '.'));
      }
    } catch (error) {
      if (!['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(error?.code)) return null;
      if (error?.code === 'ENOTFOUND') return false;
    }
    try {
      const a = await resolver.resolve4(domain);
      return Array.isArray(a) && a.length > 0;
    } catch (error) {
      return ['ENOTFOUND', 'ENODATA'].includes(error?.code) ? false : null;
    }
  };
  const value = await withTimeout(lookup(), MX_TIMEOUT_MS, null);
  if (value !== null) {
    if (mxCache.size >= MX_CACHE_MAX) mxCache.delete(mxCache.keys().next().value);
    mxCache.set(domain, { value, expiresAt: Date.now() + MX_CACHE_MS });
  }
  return value;
}

/**
 * First problem among the recipients, or null.
 *
 * @param {string[]} addresses - bare addresses
 * @param {{enabled?: boolean, allowReserved?: boolean, verifyMx?: boolean}} [options]
 * @returns {Promise<null|{code: string, domain: string, suggestion?: string}>}
 */
async function checkRecipientDomains(
  addresses,
  { enabled = true, allowReserved = false, verifyMx = false } = {}
) {
  if (!enabled) return null;
  const domains = [...new Set((addresses || []).map(domainOf).filter(Boolean))].slice(0, 200);
  for (const domain of domains) {
    if (!allowReserved && isReservedDomain(domain)) {
      return { code: 'INVALID_RECIPIENT_DOMAIN', domain };
    }
    const suggestion = typoSuggestion(domain);
    if (suggestion) return { code: 'RECIPIENT_DOMAIN_TYPO', domain, suggestion };
  }
  if (verifyMx) {
    for (const domain of domains.slice(0, 20)) {
      if (allowReserved && isReservedDomain(domain)) continue;
      if ((await domainAcceptsMail(domain)) === false) {
        return { code: 'INVALID_RECIPIENT_DOMAIN', domain };
      }
    }
  }
  return null;
}

/** Test seam: replace the DNS resolver and clear the cache. */
function setResolver(next) {
  resolver = next;
  mxCache.clear();
}

module.exports = {
  checkRecipientDomains,
  isReservedDomain,
  typoSuggestion,
  domainAcceptsMail,
  domainOf,
  setResolver,
  TYPO_DOMAINS,
};
