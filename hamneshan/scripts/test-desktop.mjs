import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStaticResponse, isApplicationURL } from '../desktop/static.mjs';
import { INITIAL_DATA_FILENAME, readInitialData } from '../desktop/initial-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'hamneshan-desktop-'));
const assetDirectory = join(directory, 'assets');
const initialDirectory = join(directory, 'initial');
try {
  await mkdir(assetDirectory); await mkdir(initialDirectory);
  await writeFile(join(assetDirectory, 'index.html'), '<!doctype html><html lang="fa" dir="rtl">آزمون</html>');
  await writeFile(join(assetDirectory, 'app.js'), 'export const test = true;');
  await writeFile(join(directory, 'private.txt'), 'Must never be exposed');
  const request = (path = '/', method = 'GET') => createStaticResponse({ url: `hamneshan://app${path}`, method }, assetDirectory);
  assert.equal(isApplicationURL('hamneshan://app/'), true);
  assert.equal(isApplicationURL('hamneshan://other/'), false);
  assert.equal(isApplicationURL('https://app/'), false);
  assert.equal(isApplicationURL('hamneshan://user@app/'), false);
  const html = await request();
  assert.equal(html.status, 200);
  assert.match(html.headers.get('Content-Security-Policy'), /object-src 'none'/);
  assert.match(await html.text(), /آزمون/);
  assert.match((await request('/app.js')).headers.get('Content-Type'), /javascript/);
  assert.equal(await (await request('/', 'HEAD')).text(), '');
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/..%2fprivate.txt')).status, 403);
  assert.equal((await request('/..%5cprivate.txt')).status, 403);
  assert.equal((await request('/app.js%3Asecret')).status, 403);
  assert.equal((await request('/%00')).status, 403);
  assert.equal((await request('/%invalid')).status, 400);
  assert.equal((await request('/.hidden')).status, 403);
  assert.equal((await request('/missing')).status, 404);
  // Windows development environments can require privileges to create symlinks.
  try {
    await symlink(join(directory, 'private.txt'), join(assetDirectory, 'escape.txt'));
    assert.equal((await request('/escape.txt')).status, 403);
  } catch (error) { if (!['EPERM', 'EACCES'].includes(error?.code)) throw error; }

  assert.equal(await readInitialData(initialDirectory), null);
  const initial = { format: 'hamneshan-backup', version: 1, records: [{ id: 'smoke', name: 'آزمون بسته‌بندی', type: 'student' }], settings: {} };
  await writeFile(join(initialDirectory, INITIAL_DATA_FILENAME), JSON.stringify(initial));
  assert.deepEqual(await readInitialData(initialDirectory), initial);
  await writeFile(join(initialDirectory, INITIAL_DATA_FILENAME), JSON.stringify({ ...initial, version: 99 }));
  await assert.rejects(() => readInitialData(initialDirectory), /سازگار نیست/);
  await writeFile(join(initialDirectory, INITIAL_DATA_FILENAME), JSON.stringify(initial));
  console.log('Desktop protocol traversal, MIME, CSP and fixed initial-data validation passed.');

  const require = createRequire(import.meta.url);
  const electron = require('electron');
  const env = {
    ...process.env,
    HAMNESHAN_USER_DATA_DIR: join(directory, 'user-data'),
    PORTABLE_EXECUTABLE_DIR: initialDirectory,
    XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_CACHE_HOME: join(directory, 'cache'),
    HAMNESHAN_SMOKE_DOWNLOAD_DIR: join(directory, 'downloads'),
  };
  await mkdir(env.HAMNESHAN_SMOKE_DOWNLOAD_DIR);
  const archive = join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
  if (existsSync(archive)) {
    env.HAMNESHAN_SMOKE_APP_ARCHIVE = archive;
    console.log('Testing the actual packaged app.asar from the Windows build.');
  }
  delete env.ELECTRON_RUN_AS_NODE;
  for (const phase of ['write', 'read']) {
    const result = spawnSync(electron, [
      ...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless', '--disable-gpu'] : []),
      join(root, 'scripts/desktop-smoke-runner.mjs'),
    ], { cwd: root, env: { ...env, HAMNESHAN_SMOKE_PHASE: phase }, encoding: 'utf8', timeout: 35000 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `Real Electron ${phase} phase must pass`);
  }
  console.log('Real Electron offline modules/fonts, isolated preload, native PNG/JSON downloads and IndexedDB restart persistence passed.');
} finally { await rm(directory, { recursive: true, force: true }); }
