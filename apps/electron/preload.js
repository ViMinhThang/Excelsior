const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getEngineUrl: () => ipcRenderer.invoke('get-engine-url'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  windowControl: (action) => ipcRenderer.send('window-control', action),
  toggleDevTools: () => ipcRenderer.send('toggle-devtools')
});
