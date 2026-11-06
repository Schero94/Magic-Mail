/**
 * Development watcher.
 *
 *   node scripts/watch.mjs          # strapi-plugin watch + server bundle
 *   node scripts/watch.mjs --link   # strapi-plugin watch:link + server bundle + yalc push
 *
 * `strapi-plugin watch` compiles the admin correctly but writes an unbundled
 * dist/server/index.js whose relative requires do not exist in dist (STR-07).
 * This script runs the same esbuild bundle as `npm run build` in watch mode and
 * re-bundles whenever the sdk output replaces it, so a linked host always loads
 * a working server bundle.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, watchFile } from 'node:fs';
import { context } from 'esbuild';
import { BUNDLE_MARKER, buildServerBundle, serverBundleOptions } from './build-server-bundle.mjs';

const link = process.argv.includes('--link');
const BUNDLE = 'dist/server/index.js';

const contexts = await Promise.all(
  (await serverBundleOptions()).map((options) => context(options))
);
await Promise.all(contexts.map((ctx) => ctx.watch()));

const isOurBundle = () =>
  existsSync(BUNDLE) && readFileSync(BUNDLE, 'utf8').startsWith(BUNDLE_MARKER);

let rebuilding = false;
const repair = async () => {
  if (rebuilding || isOurBundle()) return;
  rebuilding = true;
  try {
    await buildServerBundle();
    if (link) {
      const result = spawnSync('yalc', ['push', '--changed'], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      if (result.status !== 0)
        console.warn('[magic-mail] yalc push failed; install yalc globally for watch:link.');
    }
  } catch (error) {
    console.error('[magic-mail] server bundle rebuild failed:', error.message);
  } finally {
    rebuilding = false;
  }
};

watchFile(BUNDLE, { interval: 500 }, repair);

const sdk = spawn('npx', ['--no-install', 'strapi-plugin', link ? 'watch:link' : 'watch'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const shutdown = async (code = 0) => {
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  process.exit(code);
};
sdk.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => sdk.kill('SIGINT'));
process.on('SIGTERM', () => sdk.kill('SIGTERM'));
