import assert from 'node:assert/strict';
import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const failTimer = setTimeout(() => {
  console.error('Electron desktop smoke test timed out.');
  app.exit(1);
}, 25000);

// Do not keep Electron's entry module in top-level await: app.ready waits for it.
void (async () => { try {
  const windowLoaded = new Promise(resolve => {
    app.once('browser-window-created', (_event, window) => {
      window.webContents.once('did-finish-load', () => resolve(window));
    });
  });
  if (process.env.HAMNESHAN_SMOKE_APP_ARCHIVE) {
    await import(pathToFileURL(join(process.env.HAMNESHAN_SMOKE_APP_ARCHIVE, 'desktop/main.mjs')).href);
  } else await import('../desktop/main.mjs');
  const window = await windowLoaded;
  assert.equal(window.webContents.getURL(), 'hamneshan://app/');
  const preferences = window.webContents.getLastWebPreferences();
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.webSecurity, true);
  const phase = process.env.HAMNESHAN_SMOKE_PHASE;
  const downloadTasks = [];
  window.webContents.session.on('will-download', (_event, item) => {
    if (!['hamneshan-smoke.png', 'hamneshan-smoke.json'].includes(item.getFilename())) return;
    // Exercise the native download pipeline, bypassing only the interactive chooser.
    item.setSavePath(join(process.env.HAMNESHAN_SMOKE_DOWNLOAD_DIR, item.getFilename()));
    downloadTasks.push(new Promise((resolve, reject) => {
      item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error(`Download failed: ${state}`)));
    }));
  });
  const result = await window.webContents.executeJavaScript(`(async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    assert(document.documentElement.lang === 'fa', 'Persian page must load');
    assert(document.documentElement.dir === 'rtl', 'RTL page must load');
    assert(typeof process === 'undefined' && typeof require === 'undefined', 'Renderer must not expose Node.js');
    assert(typeof window.hamneshanDesktop?.loadInitialData === 'function', 'Isolated preload bridge must load');
    assert(Object.keys(window.hamneshanDesktop).join(',') === 'loadInitialData', 'Preload API must stay narrow');
    const initial = await window.hamneshanDesktop.loadInitialData();
    assert(initial?.format === 'hamneshan-backup' && initial.records[0].name === 'آزمون بسته‌بندی', 'Fixed local initial data must load');
    for (const font of ['BTitrBold.woff', 'BKoodakBold.woff']) {
      const response = await fetch('./assets/fonts/' + font);
      assert(response.ok && (await response.arrayBuffer()).byteLength > 20000, 'Bundled Persian font must load');
    }
    const data = await import('./data.js');
    const card = await import('./card.js');
    assert(typeof data.searchRecords === 'function' && typeof card.renderBirthdayCard === 'function', 'ES modules must load under the app scheme');
    const escaped = await fetch('hamneshan://app/..%2f..%2fpackage.json');
    assert(escaped.status === 403, 'Encoded path traversal must be blocked');
    const missing = await fetch('hamneshan://app/package.json');
    assert(missing.status === 404, 'Source package must not be exposed as a static asset');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('hamneshan-desktop-smoke', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('test');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const phase = ${JSON.stringify(phase)};
    if (phase === 'write') {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('test', 'readwrite');
        tx.objectStore('test').put('persistent-value', 'marker');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      const download = (blob, name) => {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      const canvas = document.createElement('canvas');
      await card.renderBirthdayCard(canvas, {name:'آزمون بسته‌بندی',type:'student'}, {schoolName:'مدرسهٔ نمونه',caption:'روزت پر از شادی و کشف‌های تازه!'});
      const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      assert(image && image.size > 5000, 'Birthday card must render in Electron');
      download(image, 'hamneshan-smoke.png');
      download(new Blob([JSON.stringify(initial)], {type:'application/json'}), 'hamneshan-smoke.json');
    } else {
      const marker = await new Promise((resolve, reject) => {
        const request = db.transaction('test').objectStore('test').get('marker');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      assert(marker === 'persistent-value', 'IndexedDB must persist across complete app restarts');
    }
    db.close();
    return {phase, title:document.title, origin:location.origin};
  })()`);
  if (phase === 'write') {
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(downloadTasks.length, 2, 'PNG and JSON must enter the native download pipeline');
    await Promise.all(downloadTasks);
    const image = await readFile(join(process.env.HAMNESHAN_SMOKE_DOWNLOAD_DIR, 'hamneshan-smoke.png'));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(image.length > 5000);
    const backup = JSON.parse(await readFile(join(process.env.HAMNESHAN_SMOKE_DOWNLOAD_DIR, 'hamneshan-smoke.json'), 'utf8'));
    assert.equal(backup.format, 'hamneshan-backup');
  }
  console.log('Hamneshan Electron smoke test passed:', JSON.stringify(result));
  clearTimeout(failTimer);
  app.exit(0);
} catch (error) {
  clearTimeout(failTimer);
  console.error(error?.stack || error);
  app.exit(1);
} })();
