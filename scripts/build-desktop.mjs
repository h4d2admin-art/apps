import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

await rm('desktop-build', { recursive: true, force: true });
await mkdir('desktop-build', { recursive: true });
await build({
  entryPoints: { main: 'desktop/main.ts', runtime: 'desktop/runtime.ts' },
  outdir: 'desktop-build', outExtension: { '.js': '.mjs' },
  bundle: true, splitting: false, platform: 'node', format: 'esm', target: 'node24',
  external: ['electron'], sourcemap: false, legalComments: 'eof',
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});
console.log('Desktop entry and self-contained local server built.');
