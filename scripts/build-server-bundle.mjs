import { builtinModules } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/**
 * Marker written at the top of both server bundles. scripts/watch.mjs uses it to
 * detect when `strapi-plugin watch` has replaced the bundle with its unbundled
 * CommonJS output (which requires ./register etc. that do not exist in dist).
 */
export const BUNDLE_MARKER = '/* magic-mail: esbuild server bundle */';

/**
 * Returns the esbuild option sets for the CJS and ESM server bundles.
 * @returns {Promise<Array<import('esbuild').BuildOptions>>}
 */
export async function serverBundleOptions() {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  const externals = new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]);

  const commonOptions = {
    entryPoints: ['server/src/index.js'],
    bundle: true,
    platform: 'node',
    // Strapi 5.61 and sanitize-html 2.18 require Node 22 or later.
    target: ['node22'],
    sourcemap: false,
    minify: false,
    external: [...externals],
    logLevel: 'info',
  };

  return [
    {
      ...commonOptions,
      format: 'cjs',
      outfile: 'dist/server/index.js',
      banner: { js: BUNDLE_MARKER },
    },
    {
      ...commonOptions,
      format: 'esm',
      outfile: 'dist/server/index.mjs',
      banner: {
        js: `${BUNDLE_MARKER}\nimport { createRequire } from 'node:module';const require = createRequire(import.meta.url);`,
      },
    },
  ];
}

/** Builds both server bundles once. */
export async function buildServerBundle() {
  for (const options of await serverBundleOptions()) {
    await build(options);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await buildServerBundle();
}
