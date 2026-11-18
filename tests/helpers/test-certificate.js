'use strict';

/**
 * Self-signed X.509 v3 certificates for tests, built with a minimal DER
 * encoder and node:crypto (RSA 2048, sha256WithRSAEncryption). Used to sign
 * synthetic Amazon SNS messages; nothing is written to disk and no private
 * key is stored in the repository.
 */

const crypto = require('node:crypto');

/** @param {number} length @returns {Buffer} DER length octets */
function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** @param {number} tag @param {Buffer[]|Buffer} content @returns {Buffer} */
function tlv(tag, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

/** @param {string} dotted @returns {Buffer} */
function oid(dotted) {
  const parts = dotted.split('.').map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk = [];
    let value = part;
    do {
      chunk.unshift(value & 0x7f);
      value = Math.floor(value / 128);
    } while (value > 0);
    for (let i = 0; i < chunk.length - 1; i += 1) chunk[i] |= 0x80;
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/** @param {Date} date @returns {Buffer} UTCTime */
function utcTime(date) {
  const iso = date.toISOString();
  const text = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return tlv(0x17, Buffer.from(text, 'ascii'));
}

/** @param {string} commonName @returns {Buffer} X.501 Name with one CN */
function name(commonName) {
  return tlv(0x30, [
    tlv(0x31, [tlv(0x30, [oid('2.5.4.3'), tlv(0x0c, Buffer.from(commonName, 'utf8'))])]),
  ]);
}

/**
 * Creates an RSA key pair and a self-signed certificate.
 *
 * @param {{commonName?: string, notBefore?: Date, notAfter?: Date}} [options]
 * @returns {{pem: string, privateKey: crypto.KeyObject, publicKey: crypto.KeyObject}}
 */
function createSelfSignedCertificate({
  commonName = 'sns.amazonaws.com',
  notBefore = new Date(Date.now() - 24 * 3600_000),
  notAfter = new Date(Date.now() + 365 * 24 * 3600_000),
} = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const algorithm = tlv(0x30, [oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00])]);
  const tbs = tlv(0x30, [
    tlv(0xa0, [tlv(0x02, Buffer.from([0x02]))]),
    tlv(0x02, Buffer.concat([Buffer.from([0x01]), crypto.randomBytes(8)])),
    algorithm,
    name(commonName),
    tlv(0x30, [utcTime(notBefore), utcTime(notAfter)]),
    name(commonName),
    publicKey.export({ type: 'spki', format: 'der' }),
  ]);
  const signature = crypto.sign('sha256', tbs, privateKey);
  const der = tlv(0x30, [
    tbs,
    algorithm,
    tlv(0x03, Buffer.concat([Buffer.from([0x00]), signature])),
  ]);
  const body = der
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n');
  return {
    pem: `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`,
    privateKey,
    publicKey,
  };
}

module.exports = { createSelfSignedCertificate };
