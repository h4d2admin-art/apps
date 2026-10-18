import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');
const directory = mkdtempSync(join(tmpdir(), 'hamdars-desktop-'));
try {
  const result = spawnSync(electron, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { DatabaseSync } from 'node:sqlite';
    import { startRuntime } from './desktop-build/runtime.mjs';
    const directory = ${JSON.stringify(directory)};
    const probe = new DatabaseSync(':memory:');
    assert.equal(probe.prepare('SELECT 1 AS ok').get().ok, 1); probe.close();
    console.log('Electron', process.versions.electron, 'embedded Node', process.versions.node, 'SQLite works');
    let runtime = await startRuntime(directory);
    try {
      const health = await fetch(runtime.origin + '/api/health');
      assert.deepEqual(await health.json(), {ok:true});
      const html = await (await fetch(runtime.origin + '/')).text();
      assert.ok(html.includes('lang="fa"') && html.includes('/assets/'));
      for (const font of ['BTitrBold.woff', 'BKoodakBold.woff']) {
        const response = await fetch(runtime.origin + '/fonts/' + font);
        assert.equal(response.status, 200); assert.ok((await response.arrayBuffer()).byteLength > 20000);
      }
      const saved = await fetch(runtime.origin + '/api/actions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'student.save',payload:{name:'آزمون نسخه ویندوز',phone:'',parentName:'ولی آزمایشی',parentPhone:'',notes:''}})});
      assert.equal(saved.status, 200);
      const before = await saved.json(); assert.equal(before.students.length, 1);
      await runtime.close(); runtime = await startRuntime(directory);
      assert.deepEqual(await (await fetch(runtime.origin + '/api/state')).json(), before);
      assert.deepEqual(await (await fetch(runtime.origin + '/api/backup')).json(), before);
      console.log('Bundled desktop API, Persian UI/fonts, SQLite persistence and backup passed');
    } finally { await runtime.close(); }
  `], { cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 30000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Desktop runtime smoke test must pass');
} finally { rmSync(directory, { recursive: true, force: true }); }
