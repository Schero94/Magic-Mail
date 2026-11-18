'use strict';

/**
 * SendGrid API regions.
 *
 * SendGrid serves global users and subusers from https://api.sendgrid.com and
 * EU regional subusers from https://api.eu.sendgrid.com (`servers` of
 * twilio/sendgrid-oai tsg_mail_v3.json, pinned in
 * tests/fixtures/openapi/sendgrid-mail.json; Mail Send reference:
 * "EU Regional Email sending requires use of an EU IP address and EU
 * subuser"). Checked 2026-11-18.
 *
 * The account stores `config.region` as 'us' (global) or 'eu'. Only these two
 * fixed hosts are ever used, so a stored value can never send the API key to
 * another server.
 */

const SENDGRID_API_BASE_URLS = Object.freeze({
  us: 'https://api.sendgrid.com',
  eu: 'https://api.eu.sendgrid.com',
});
const SENDGRID_REGIONS = Object.freeze(Object.keys(SENDGRID_API_BASE_URLS));

/**
 * Resolves a stored SendGrid `config.region`. Accounts saved before regions
 * existed have none and keep the global endpoint.
 *
 * @param {unknown} value
 * @returns {'us'|'eu'|null} the region, or null for an unsupported value
 */
const resolveSendGridRegion = (value) => {
  if (value === undefined || value === null || value === '') return 'us';
  return typeof value === 'string' && SENDGRID_REGIONS.includes(value) ? value : null;
};

/**
 * @param {'us'|'eu'} region - a value returned by resolveSendGridRegion()
 * @returns {string} base URL without a trailing slash
 */
const sendGridApiBaseUrl = (region) => SENDGRID_API_BASE_URLS[region];

module.exports = {
  SENDGRID_API_BASE_URLS,
  SENDGRID_REGIONS,
  resolveSendGridRegion,
  sendGridApiBaseUrl,
};
