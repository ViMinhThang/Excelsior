const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getEngineUrl: () => ipcRenderer.invoke('get-engine-url'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  windowControl: (a) => { if (['minimize','maximize','close'].includes(a)) ipcRenderer.send('window-control', a); },
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
  onEngineStatus: (cb) => { const h=(_,s)=>cb(s); ipcRenderer.on('engine-status',h); return ()=>ipcRenderer.removeListener('engine-status',h); },
});
