import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session } from 'electron';
import { mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_SCHEME, APP_URL, createStaticResponse, isApplicationURL } from './static.mjs';
import { readInitialData } from './initial-data.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
app.setName('Hamneshan');
app.setAppUserModelId('ir.hamneshan.directory');
const dataDirectory = process.env.HAMNESHAN_USER_DATA_DIR || join(app.getPath('appData'), 'Hamneshan');
mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', dataDirectory);

// A stable secure origin preserves IndexedDB across portable EXE replacements.
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

let mainWindow = null;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    protocol.handle(APP_SCHEME, request => createStaticResponse(request, join(appRoot, 'dist')));

    const appSession = session.defaultSession;
    // The standalone app requires no outgoing network traffic.
    appSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !(isApplicationURL(details.url) || /^(?:data|blob):/i.test(details.url)) });
    });
    appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permission === 'clipboard-sanitized-write'
        && contents === mainWindow?.webContents
        && isApplicationURL(details.requestingUrl || contents.getURL()));
    });
    appSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => (
      permission === 'clipboard-sanitized-write' && isApplicationURL(requestingOrigin)
    ));
    appSession.on('will-download', (event, item) => {
      if (!(isApplicationURL(item.getURL()) || /^(?:data|blob):/i.test(item.getURL()))) {
        event.preventDefault(); return;
      }
      const filename = basename(item.getFilename()).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'Hamneshan-export';
      item.setSaveDialogOptions({
        title: 'ذخیره فایل خروجی هم‌نشان',
        defaultPath: join(app.getPath('downloads'), filename),
      });
    });

    ipcMain.handle('hamneshan:initial-data', async event => {
      if (!mainWindow || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || !isApplicationURL(event.senderFrame.url)) throw new Error('دسترسی مجاز نیست.');
      const initialDirectory = process.env.PORTABLE_EXECUTABLE_DIR || dirname(app.getPath('exe'));
      return readInitialData(initialDirectory);
    });

    mainWindow = new BrowserWindow({
      title: 'هم‌نشان | دستیار مدرسه',
      width: 1450, height: 1000, minWidth: 850, minHeight: 650,
      show: false, backgroundColor: '#f5f6f2',
      icon: join(appRoot, 'desktop', 'icon.png'),
      webPreferences: {
        preload: join(appRoot, 'desktop', 'preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: true, allowRunningInsecureContent: false,
        devTools: !app.isPackaged,
      },
    });
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const preventExternalNavigation = (event, target) => {
      if (!isApplicationURL(target)) event.preventDefault();
    };
    mainWindow.webContents.on('will-navigate', preventExternalNavigation);
    mainWindow.webContents.on('will-redirect', preventExternalNavigation);
    mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
    await mainWindow.loadURL(APP_URL);
  }).catch(error => {
    console.error('Hamneshan startup failed:', error?.message || error);
    dialog.showErrorBox('اجرای هم‌نشان انجام نشد', 'برنامه را دوباره اجرا کنید. اگر خطا ادامه داشت، پوشهٔ اطلاعات برنامه را حذف نکنید.');
    app.quit();
  });
}
