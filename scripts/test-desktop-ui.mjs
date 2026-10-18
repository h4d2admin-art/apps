import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { _electron, expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'hamdars-desktop-ui-'));
const backupPath = join(directory, 'backup.json');
const imagePath = join(directory, 'attendance.png');
const studentName = 'دانش‌آموز آزمون نسخه ویندوز';
const output = resolve('test-results');
const errors = [];
let application;

async function launch() {
  const environment = {
    ...process.env,
    HAMDARS_USER_DATA_DIR: join(directory, 'user-data'),
    XDG_CONFIG_HOME: join(directory, 'config'),
    XDG_CACHE_HOME: join(directory, 'cache'),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  application = await _electron.launch({
    executablePath: require('electron'),
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless', '--disable-gpu'] : []),
      resolve('.'),
    ],
    env: environment,
    timeout: 15000,
  });
  const page = await application.firstWindow({ timeout: 10000 });
  await page.setViewportSize({ width: 1440, height: 1050 });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'اینجا، تلاش‌ها دیده می‌شوند.' })).toBeVisible({ timeout: 10000 });
  return page;
}

try {
  mkdirSync(output, { recursive: true });
  let page = await launch();
  assert.equal(await page.title(), 'هم‌درس | مدیریت سالن مطالعه');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      titr: document.fonts.check('18px "B Titr"'),
      koodak: document.fonts.check('16px "B Koodak"'),
    };
  });
  assert.deepEqual(fonts, { titr: true, koodak: true });

  await page.locator('nav a[href="#students"]').click();
  await expect(page.getByText('اولین دانش‌آموز این ماه را ثبت‌نام کنید')).toBeVisible();
  await page.getByRole('button', { name: 'ثبت‌نام دانش‌آموز', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام و نام خانوادگی *', { exact: true }).fill(studentName);
  await dialog.getByLabel('نام و نام خانوادگی ولی', { exact: true }).fill('ولی آزمایشی');
  await dialog.getByLabel(/شهریه ماه/).fill('1000000');
  await dialog.getByRole('button', { name: 'ثبت‌نام دانش‌آموز', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  // Exercise real Electron downloads while bypassing only the native save chooser.
  await application.evaluate(({ session }, paths) => {
    globalThis.__hamdarsTestDownloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const kind = item.getFilename().endsWith('.png') ? 'image' : 'backup';
      const result = { kind, state: 'progressing' };
      globalThis.__hamdarsTestDownloads.push(result);
      item.setSavePath(paths[kind]);
      item.once('done', (_event, state) => { result.state = state; });
    });
  }, { image: imagePath, backup: backupPath });
  async function downloadCompleted(kind) {
    await expect.poll(() => application.evaluate((_electron, wanted) => (
      globalThis.__hamdarsTestDownloads.find(item => item.kind === wanted)?.state
    ), kind), { timeout: 15000, message: `Electron must save the ${kind} download` }).toBe('completed');
  }

  await page.locator('nav a[href="#attendance"]').click();
  await page.getByRole('button', { name: 'شروع حضور و غیاب', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام و نام خانوادگی سرپرست', { exact: true }).fill('سرپرست آزمایشی');
  await dialog.getByRole('button', { name: 'ذخیره شیفت', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: `ثبت حضور ${studentName} در زنگ اول`, exact: true }).click();
  await expect(page.getByRole('button', { name: `لغو حضور ${studentName} در زنگ اول`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'خروجی تصویر', exact: true }).click();
  await downloadCompleted('image');
  const image = readFileSync(imagePath);
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(image.length > 5000, 'Downloaded attendance PNG must contain rendered content');

  await page.getByRole('link', { name: 'تنظیمات و پشتیبان', exact: true }).click();
  await page.getByRole('link', { name: 'دریافت نسخه پشتیبان', exact: true }).click();
  await downloadCompleted('backup');
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(backup.students.length, 1);
  assert.equal(backup.students[0].name, studentName);
  assert.equal(backup.students[0].parentName, 'ولی آزمایشی');
  assert.equal(backup.enrollments.length, 1);
  assert.equal(backup.sessions.length, 1);

  await application.close();
  application = undefined;
  page = await launch();
  await page.locator('nav a[href="#students"]').click();
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();
  const restored = await page.evaluate(async () => (await fetch('/api/state')).json());
  assert.deepEqual(restored, backup, 'Full data must survive quitting and reopening Electron');
  await page.screenshot({ path: join(output, 'desktop-electron.png'), fullPage: true });
  assert.deepEqual(errors, [], 'Electron renderer must not raise page errors');
  console.log('Electron GUI, Persian fonts, registration, star attendance, PNG/JSON downloads and restart persistence passed');
} finally {
  try { if (application) await application.close(); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
