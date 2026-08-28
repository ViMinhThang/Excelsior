const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('excelsior', {
  getEngineUrl: () => ipcRenderer.invoke('get-engine-url')
});
