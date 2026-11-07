'use strict';

/**
 * Mailgun API regions. A Mailgun domain lives in exactly one region and must
 * be called on that region's base URL ("Be sure to use the appropriate base
 * URL based on which region you have created for your domain"):
 * https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview
 *
 * Only these fixed hosts are used, so the stored `region` can never send the
 * API key to another server.
 */
const MAILGUN_API_BASE_URLS = Object.freeze({
  us: 'https://api.mailgun.net',
  eu: 'https://api.eu.mailgun.net',
});

const MAILGUN_REGIONS = Object.freeze(Object.keys(MAILGUN_API_BASE_URLS));

const DEFAULT_MAILGUN_REGION = 'us';

/**
 * Resolves a stored `config.region`. Accounts saved before regions existed
 * have no region and keep using the US endpoint.
 *
 * @param {unknown} value
 * @returns {'us'|'eu'|null} the region, or null for an unsupported value
 */
const resolveMailgunRegion = (value) => {
  if (value === undefined || value === null || value === '') return DEFAULT_MAILGUN_REGION;
  return typeof value === 'string' && MAILGUN_REGIONS.includes(value) ? value : null;
};

/**
 * @param {'us'|'eu'} region - a value returned by resolveMailgunRegion()
 * @returns {string} base URL without a trailing slash
 */
const mailgunApiBaseUrl = (region) => MAILGUN_API_BASE_URLS[region];

module.exports = {
  DEFAULT_MAILGUN_REGION,
  MAILGUN_REGIONS,
  mailgunApiBaseUrl,
  resolveMailgunRegion,
};
