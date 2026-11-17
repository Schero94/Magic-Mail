'use strict';

/**
 * The README ships in the npm package and is rendered outside GitHub: on
 * npmjs.com (which cuts it off at 64 KiB) and on the Strapi marketplace
 * (which resolves relative URLs against community.strapi.io). These tests keep
 * it short, keep every link and image absolute, and check that each absolute
 * link into this repository points at a file (and heading) that exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

const RAW = 'https://raw.githubusercontent.com/Schero94/Magic-Mail/main/';
const BLOB = 'https://github.com/Schero94/Magic-Mail/blob/main/';
const REPO = 'https://github.com/Schero94/Magic-Mail';

/**
 * GitHub's heading anchor: lower case, punctuation removed, spaces to hyphens.
 *
 * @param {string} heading - heading text without the leading hashes
 * @returns {string} anchor slug
 */
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

/**
 * Anchors of every Markdown heading outside fenced code blocks.
 *
 * @param {string} markdown - document text
 * @returns {Set<string>} heading anchors
 */
const anchorsOf = (markdown) => {
  const anchors = new Set();
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const match = !fence && line.match(/^#{1,6} (.+)$/);
    if (match) anchors.add(slug(match[1]));
  }
  return anchors;
};

/**
 * Every link and image target in a Markdown document: `[text](url)`,
 * `![alt](url)`, HTML `src`/`href` attributes and bare reference definitions.
 * Fenced code blocks are skipped.
 *
 * @param {string} markdown - document text
 * @returns {string[]} targets in document order
 */
const targetsOf = (markdown) => {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '');
  const targets = [];
  for (const [, url] of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g))
    targets.push(url);
  for (const [, url] of text.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) targets.push(url);
  for (const [, url] of text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) targets.push(url);
  return targets;
};

const imagesOf = (markdown) => {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '');
  return [
    ...[...text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)].map((m) => m[1]),
    ...[...text.matchAll(/<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
  ];
};

test('README stays well below the 64 KiB npm cut-off', () => {
  const bytes = Buffer.byteLength(readme, 'utf8');
  assert.ok(bytes <= 60_000, `README.md is ${bytes} bytes; move detail into docs/*.md`);
});

test('every README link and image is absolute (http(s), mailto) or an in-page anchor', () => {
  const targets = targetsOf(readme);
  assert.ok(targets.length > 20, 'the link extractor found the README links');
  const relative = targets.filter((url) => !/^(https?:\/\/|mailto:|#)/.test(url));
  assert.deepEqual(relative, [], 'relative URLs break on npm and the Strapi marketplace');
});

test('README in-page anchors point at README headings', () => {
  const anchors = anchorsOf(readme);
  const missing = targetsOf(readme)
    .filter((url) => url.startsWith('#'))
    .filter((url) => !anchors.has(url.slice(1)));
  assert.deepEqual(missing, []);
});

test('README images are a short curated set served from this repository', () => {
  const images = imagesOf(readme);
  const screenshots = images.filter((url) => url.endsWith('.webp'));
  assert.ok(
    screenshots.length >= 4 && screenshots.length <= 8,
    `${screenshots.length} screenshots`
  );
  assert.equal(new Set(images).size, images.length, 'no image is shown twice');
  const isBadge = (url) =>
    url.startsWith('https://img.shields.io/') ||
    /\/actions\/workflows\/[\w.-]+\/badge\.svg/.test(url);
  for (const url of images.filter((image) => !isBadge(image))) {
    assert.ok(url.startsWith(RAW), `${url} must be served from ${RAW}`);
    const file = url.slice(RAW.length);
    assert.ok(fs.existsSync(path.join(root, file)), `${file} exists in the repository`);
  }
  for (const [, alt] of readme.matchAll(/!\[([^\]]*)\]\([^)\s]+\.webp\)/g)) {
    assert.ok(alt.length >= 20, `image alt text "${alt}" describes the screen`);
  }
});

test('absolute README links into this repository resolve to files and headings', () => {
  for (const url of targetsOf(readme)) {
    if (url.startsWith(BLOB)) {
      const [file, anchor] = url.slice(BLOB.length).split('#');
      const full = path.join(root, file);
      assert.ok(fs.existsSync(full), `${file} exists`);
      if (anchor) {
        assert.ok(anchorsOf(fs.readFileSync(full, 'utf8')).has(anchor), `${file}#${anchor}`);
      }
    } else if (url.startsWith(`${REPO}#`)) {
      const anchor = url.slice(REPO.length + 1);
      assert.ok(anchor === 'readme' || anchorsOf(readme).has(anchor), `README#${anchor}`);
    }
  }
});

test('links between the docs guides resolve to files and headings', () => {
  const docs = fs.readdirSync(path.join(root, 'docs')).filter((file) => file.endsWith('.md'));
  assert.ok(docs.includes('sending.md') && docs.includes('api.md'));
  for (const doc of docs) {
    const text = fs.readFileSync(path.join(root, 'docs', doc), 'utf8');
    for (const url of targetsOf(text)) {
      if (/^(https?:\/\/|mailto:)/.test(url)) continue;
      const [file, anchor] = url.split('#');
      const target = file ? path.join(root, 'docs', file) : path.join(root, 'docs', doc);
      assert.ok(fs.existsSync(target), `${doc}: ${url}`);
      if (anchor && target.endsWith('.md')) {
        assert.ok(anchorsOf(fs.readFileSync(target, 'utf8')).has(anchor), `${doc}: ${url}`);
      }
    }
  }
});
