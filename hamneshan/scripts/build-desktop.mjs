import assert from 'node:assert/strict';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'dist/index.html', 'dist/app.js', 'dist/data.js', 'dist/card.js',
  'dist/assets/xlsx.full.min.js', 'dist/assets/lucide.min.js',
  'dist/assets/fonts/BTitrBold.woff', 'dist/assets/fonts/BKoodakBold.woff',
  'desktop/main.mjs', 'desktop/static.mjs', 'desktop/initial-data.mjs', 'desktop/preload.cjs',
  'desktop/icon.png', 'desktop/icon.ico',
];
for (const name of required) {
  const path = join(root, name);
  await access(path);
  assert.ok((await stat(path)).size > 0, `${name} must not be empty`);
}
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(pkg.main, 'desktop/main.mjs', 'Desktop entry must be configured');
const html = await readFile(join(root, 'dist/index.html'), 'utf8');
assert.ok(/lang=["']fa["']/.test(html) && /dir=["']rtl["']/.test(html), 'Persian RTL interface must be bundled');
async function checkAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.notEqual(entry.name, 'school-data.hamneshan.json', 'Private initial records must stay outside bundled source assets');
    if (entry.isDirectory()) await checkAssets(join(directory, entry.name));
  }
}
await checkAssets(join(root, 'dist'));
console.log('Hamneshan desktop source, Persian fonts, offline assets and private-data boundary verified.');
