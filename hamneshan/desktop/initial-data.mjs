import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const INITIAL_DATA_FILENAME = 'school-data.hamneshan.json';
const MAX_INITIAL_DATA_BYTES = 25 * 1024 * 1024;

/** The caller supplies the trusted executable directory, never an IPC-provided path. */
export async function readInitialData(directory) {
  const filename = join(directory, INITIAL_DATA_FILENAME);
  let info;
  try { info = await lstat(filename); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw new Error('خواندن فایل اطلاعات اولیه ممکن نشد.'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_INITIAL_DATA_BYTES) {
    throw new Error('فایل اطلاعات اولیه معتبر نیست یا حجم آن از ۲۵ مگابایت بیشتر است.');
  }
  let value;
  try {
    const bytes = await readFile(filename);
    if (bytes.byteLength > MAX_INITIAL_DATA_BYTES) throw new Error('too large');
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch { throw new Error('قالب فایل اطلاعات اولیه معتبر نیست.'); }
  if (!value || value.format !== 'hamneshan-backup' || value.version !== 1
    || !Array.isArray(value.records) || value.records.length > 100000
    || value.records.some(record => !record || typeof record !== 'object' || Array.isArray(record)
      || typeof record.name !== 'string' || !record.name.trim()
      || !['student', 'teacher'].includes(record.type))
    || (value.settings != null && (typeof value.settings !== 'object' || Array.isArray(value.settings)))) {
    throw new Error('ساختار فایل اطلاعات اولیه با هم‌نشان سازگار نیست.');
  }
  return value;
}
