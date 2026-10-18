import { app, BrowserWindow, dialog, Menu } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startRuntime } from './runtime';

app.setName('Hamdars');
const dataDirectory = process.env.HAMDARS_USER_DATA_DIR || join(app.getPath('appData'), 'Hamdars');
mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', dataDirectory);
app.setAppUserModelId('ir.hamdars.studyhall');

let window: BrowserWindow | null = null;
let runtime: Awaited<ReturnType<typeof startRuntime>> | undefined;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (!runtime || quitting) return;
    event.preventDefault(); quitting = true;
    void runtime.close().catch(error => console.error('Unable to close database:', error)).finally(() => app.quit());
  });
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    runtime = await startRuntime(dataDirectory);
    window = new BrowserWindow({
      title: 'هم‌درس | مدیریت سالن مطالعه', width: 1440, height: 1000,
      minWidth: 800, minHeight: 600, show: false, backgroundColor: '#f6f7f2',
      icon: join(app.getAppPath(), 'desktop', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged },
    });
    window.once('ready-to-show', () => window?.show());
    window.on('closed', () => { window = null; });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => {
      if (new URL(target).origin !== runtime?.origin) event.preventDefault();
    });
    const session = window.webContents.session;
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({
        title: 'ذخیره فایل خروجی هم‌درس',
        defaultPath: join(app.getPath('downloads'), item.getFilename()),
      });
    });
    await window.loadURL(runtime.origin);
  }).catch(async error => {
    console.error('Desktop startup failed:', error);
    dialog.showErrorBox('اجرای هم‌درس انجام نشد', 'برنامه نتوانست اطلاعات سالن را باز کند. برنامه را دوباره اجرا کنید. اگر خطا ادامه داشت، پوشه اطلاعات را حذف نکنید و با پشتیبانی تماس بگیرید.');
    if (runtime) await runtime.close().catch(() => undefined);
    app.quit();
  });
}
