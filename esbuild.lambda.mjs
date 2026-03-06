import { build } from 'esbuild';

await build({
  entryPoints: ['src/handlers/lambda.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/lambda/handler.mjs',
  banner: {
    // Node.js ESM needs this for dynamic requires used by some deps
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  external: [],
  minify: true,
  sourcemap: true,
});

console.log('Lambda bundle built → dist/lambda/handler.mjs');
