const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hamneshanDesktop', Object.freeze({
  loadInitialData: () => ipcRenderer.invoke('hamneshan:initial-data'),
}));
