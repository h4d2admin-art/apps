import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, type Download } from '@playwright/test';
import { createApp } from '../server/app';
import { reportFor, today } from '../shared/utils';
import type { AppState } from '../shared/types';

const temp = mkdtempSync(join(tmpdir(), 'hamdars-browser-'));
const output = resolve('test-results');
mkdirSync(output, { recursive: true });
const app = createApp(join(temp, 'test.sqlite'));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], env: { ...process.env, XDG_CONFIG_HOME: temp, XDG_CACHE_HOME: temp } });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const state = async (): Promise<AppState> => (await fetch(`${base}/api/state`)).json();
async function png(download: Download, filename: string) {
  await download.saveAs(join(output, filename));
  const bytes = readFileSync(join(output, filename));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(bytes.length > 5000, 'PNG must contain real rendered form content');
  assert.ok(bytes.readUInt32BE(16) >= 1000, 'PNG must be large enough to share');
  console.log(`${filename}: ${bytes.readUInt32BE(16)}×${bytes.readUInt32BE(20)}, ${bytes.length} bytes`);
}
try {
  await page.goto(`${base}/#students`);
  await expect(page.getByText('اولین دانش‌آموز این ماه را ثبت‌نام کنید')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({ titr: document.fonts.check('18px "B Titr"'), koodak: document.fonts.check('16px "B Koodak"') }));
  assert.deepEqual(fonts, { titr: true, koodak: true });
  assert.equal((await state()).students.length, 0);
  await page.getByRole('button', { name: 'ثبت‌نام دانش‌آموز', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام و نام خانوادگی *', { exact: true }).fill('علی رضایی');
  await dialog.getByLabel('شماره تماس دانش‌آموز', { exact: true }).fill('09120000001');
  await dialog.getByLabel('نام و نام خانوادگی ولی', { exact: true }).fill('رضا رضایی');
  await dialog.getByLabel('شماره تماس ولی', { exact: true }).fill('09120000002');
  await dialog.getByLabel(/شهریه ماه/).fill('1000000');
  await dialog.getByRole('button', { name: 'ثبت‌نام دانش‌آموز', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  assert.equal((await state()).enrollments.length, 1);
  assert.equal((await state()).students[0].parentName, 'رضا رضایی');
  console.log('Monthly enrollment, guardian data and desk assignment passed');

  await page.goto(`${base}/#attendance`);
  await page.getByRole('button', { name: 'شروع حضور و غیاب', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام و نام خانوادگی سرپرست', { exact: true }).fill('محمد احمدی');
  await dialog.getByLabel('شماره تماس سرپرست').fill('09120000003');
  await dialog.getByRole('button', { name: 'ذخیره شیفت', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  for (const bell of ['زنگ اول', 'زنگ دوم']) {
    await page.getByRole('button', { name: `ثبت حضور علی رضایی در ${bell}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `لغو حضور علی رضایی در ${bell}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: /عصر.*۴ زنگ/ }).click();
  await page.getByRole('button', { name: 'شروع حضور و غیاب', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام و نام خانوادگی سرپرست', { exact: true }).fill('حسین محمدی');
  await dialog.getByRole('button', { name: 'ذخیره شیفت', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'ثبت حضور علی رضایی در زنگ اول', exact: true }).click();
  await expect(page.getByRole('button', { name: 'لغو حضور علی رضایی در زنگ اول', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const afterAttendance = await state();
  assert.equal(afterAttendance.sessions.length, 2);
  assert.equal(afterAttendance.sessions[1].date, today());
  assert.equal(reportFor(afterAttendance, afterAttendance.enrollments[0]).hours, 4.5);
  const attendanceDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی تصویر', exact: true }).click();
  await png(await attendanceDownload, 'attendance.png');
  await page.screenshot({ path: join(output, 'attendance-desktop.png'), fullPage: true, animations: 'disabled' });
  console.log('Four morning and evening periods, stars, exact 4.5 hours and roster PNG passed');

  await page.goto(`${base}/#payments`);
  await page.getByRole('button', { name: 'ثبت پرداخت', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('مبلغ پرداختی (تومان) *').fill('400000');
  await dialog.getByLabel('یادداشت پرداخت', { exact: true }).fill('قسط اول');
  await dialog.getByRole('button', { name: 'ثبت پرداخت', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody').getByText('پرداخت بخشی', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ثبت پرداخت', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('مبلغ پرداختی (تومان) *')).toHaveValue('600000');
  await dialog.getByRole('button', { name: 'ثبت پرداخت', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody').getByText('تسویه‌شده', { exact: true })).toBeVisible();
  assert.equal((await state()).payments.reduce((sum, p) => sum + p.amount, 0), 1000000);
  console.log('Partial payment and full settlement passed');

  await page.goto(`${base}/#conduct`);
  for (const kind of ['negative', 'positive']) {
    await page.getByRole('button', { name: 'ثبت مورد جدید', exact: true }).click();
    dialog = page.getByRole('dialog');
    if (kind === 'positive') await dialog.getByRole('button', { name: 'امتیاز مثبت', exact: true }).click();
    await dialog.getByRole('button', { name: 'ثبت مورد', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  assert.equal((await state()).records.length, 2);
  await page.goto(`${base}/#reports`);
  await expect(page.locator('tbody tr').first()).toContainText('۴٫۵');
  await page.getByRole('button', { name: 'گزارش', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('.report-metrics')).toContainText('۴٫۵');
  assert.equal(reportFor(await state(), (await state()).enrollments[0]).score, 3);
  const reportDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'دریافت تصویر کارنامه', exact: true }).click();
  await png(await reportDownload, 'report.png');
  await dialog.getByRole('button', { name: 'بستن', exact: true }).last().click();
  console.log('Positive/negative records, exact monthly grade and report PNG passed');

  const backupResponse = await fetch(`${base}/api/backup`);
  const backup = await backupResponse.text();
  assert.deepEqual(JSON.parse(backup), await state());
  await page.goto(`${base}/#settings`);
  await page.getByLabel('نام سالن مطالعه', { exact: true }).fill('نام موقت سالن');
  await page.getByRole('button', { name: 'ذخیره تنظیمات', exact: true }).click();
  await expect.poll(async () => (await state()).settings.hallName).toBe('نام موقت سالن');
  page.once('dialog', d => d.accept());
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect.poll(async () => (await state()).settings.hallName).toBe(JSON.parse(backup).settings.hallName);
  await page.reload();
  assert.deepEqual(await state(), JSON.parse(backup));
  console.log('Backup download, validated restore and persistence across reload passed');

  await page.goto(`${base}/#dashboard`);
  await page.screenshot({ path: join(output, 'dashboard-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, 'dashboard-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Dashboard must fit mobile width');
  await page.getByRole('button', { name: 'باز کردن فهرست', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'حضور و غیاب', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'حضور و غیاب', exact: true })).toBeVisible();
  await page.screenshot({ path: join(output, 'attendance-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Attendance table must scroll inside its card, not the page');
  // Exercise the attached sheet's representative 75-student size without touching the real database.
  const large = await state();
  for (let i = 2; i <= 75; i++) {
    large.students.push({ id: `sample-${i}`, name: `دانش‌آموز آزمایشی ${i}`, phone: '', parentName: '', parentPhone: '', notes: '', createdAt: new Date().toISOString() });
    large.enrollments.push({ id: `sample-enrollment-${i}`, studentId: `sample-${i}`, month: large.enrollments[0].month, desk: i, fee: 1000000 });
  }
  const restoreLarge = await fetch(`${base}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'backup.restore', payload: large }) });
  assert.equal(restoreLarge.status, 200);
  await page.reload();
  await expect(page.locator('.att-export-table tbody tr')).toHaveCount(75);
  await expect(page.locator('.att-export-table')).toHaveCount(3);
  await page.getByRole('button', { name: 'ثبت حضور همه در زنگ اول', exact: true }).click();
  await expect(page.getByRole('button', { name: 'لغو حضور همه در زنگ اول', exact: true })).toBeEnabled();
  const largeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی تصویر', exact: true }).click();
  await png(await largeDownload, 'attendance-75.png');
  const fullSheet = readFileSync(join(output, 'attendance-75.png'));
  assert.ok(fullSheet.readUInt32BE(20) > 2000, 'Full roster must include all 25 rows per column');
  await page.goto(`${base}/#reports`);
  await page.locator('tbody tr').first().getByRole('button', { name: 'گزارش', exact: true }).click();
  const mobileReport = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'دریافت تصویر کارنامه', exact: true }).click();
  await png(await mobileReport, 'report-mobile.png');
  assert.equal(readFileSync(join(output, 'report-mobile.png')).readUInt32BE(16), 1640, 'Mobile report must export at full width');
  assert.deepEqual(errors, [], 'Browser must not report uncaught application errors');
  console.log('Persian fonts, RTL desktop/mobile, 75-student three-column PNG, full-width mobile report and error-free browser workflow passed');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  app.locals.closeDatabase();
  rmSync(temp, { recursive: true, force: true });
}
