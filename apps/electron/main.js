const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let engineProc = null, win = null;
const ENGINE_URL = process.env.EXCELSIOR_ENGINE || 'ws://localhost:17812/v1/ws';
const ENGINE_ADDR = process.env.EXCELSIOR_ENGINE_ADDR || ':17812';
const IS_DEV = !app.isPackaged;

function getEngineBin() {
  for (const p of [path.resolve(__dirname,'../../excelsior.exe'),path.resolve(__dirname,'../../excelsior'),path.join(process.resourcesPath,'excelsior.exe'),path.join(process.resourcesPath,'excelsior')])
    if (fs.existsSync(p)) return p;
  return null;
}
function startEngine() {
  // Desktop-only: dev (npm run dev) is frontend-only, engine must be started separately via `npm run dev:engine` or `go run`.
  // Auto-spawn only for packaged builds or when explicitly opted in.
  if (process.env.EXCELSIOR_AUTO_ENGINE==='0') return;
  if (IS_DEV && process.env.EXCELSIOR_AUTO_ENGINE!=='1') {
    console.log('[engine] dev mode: not auto-spawning (run `npm run dev:engine` separately or set EXCELSIOR_AUTO_ENGINE=1)');
    return;
  }
  const bin=getEngineBin();
  if(!bin) return console.log('[engine] no binary, expect external at',ENGINE_ADDR);
  const cwd=path.resolve(__dirname,'../../');
  console.log('[engine] spawn',bin,ENGINE_ADDR,cwd);
  engineProc=spawn(bin,['engine','--addr',ENGINE_ADDR,'--workspace',cwd],{stdio:'inherit',cwd,env:process.env});
  engineProc.on('error',e=>dialog.showErrorBox('Engine failed',String(e)));
  engineProc.on('exit',c=>{engineProc=null; if(win&&!win.isDestroyed()) win.webContents.send('engine-status',{running:false,code:c});});
}
function devUp(url,ms=600){return new Promise(r=>{const q=http.get(url,s=>r(s.statusCode<500));q.on('error',()=>r(false));q.setTimeout(ms,()=>{q.destroy();r(false);});});}
async function frontendTarget(){
  if(process.env.ELECTRON_START_URL) return {kind:'url',value:process.env.ELECTRON_START_URL};
  if(IS_DEV && await devUp('http://localhost:3000')) return {kind:'url',value:'http://localhost:3000'};
  for(const p of [path.join(process.resourcesPath,'dist/index.html'),path.resolve(__dirname,'dist/index.html'),path.resolve(__dirname,'renderer/index.html')])
    if(fs.existsSync(p)) return {kind:'file',value:p};
  return {kind:'url',value:'http://localhost:3000'};
}
async function createWindow(){
  win=new BrowserWindow({
    width:1200,height:800,minWidth:900,minHeight:600,backgroundColor:'#0d0d0d',title:'excelsior',frame:false,titleBarStyle:'hidden',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true},
    autoHideMenuBar:true,show:false
  });
  const t=await frontendTarget();
  console.log('[desktop] loading',t);
  if(t.kind==='url') await win.loadURL(t.value); else await win.loadFile(t.value);
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(({url})=>{ if(url.startsWith('http://localhost:')||url.startsWith('file://')) return {action:'allow'}; shell.openExternal(url); return {action:'deny'}; });
  win.webContents.on('before-input-event',(e,input)=>{ if(input.key==='F12'||(input.control&&input.shift&&input.key.toLowerCase()==='i')){win.webContents.toggleDevTools();e.preventDefault();} if((input.control||input.meta)&&input.key.toLowerCase()==='r') win.reload(); });
  Menu.setApplicationMenu(null);
}

if(!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance',()=>{if(win){if(win.isMinimized()) win.restore(); win.focus();}});

ipcMain.handle('get-engine-url',()=>ENGINE_URL);
ipcMain.handle('open-folder-dialog',async()=>{if(!win||win.isDestroyed()) return null; const {canceled,filePaths}=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Open Project Folder'}); return canceled||!filePaths[0]?null:filePaths[0];});
ipcMain.on('window-control',(_,a)=>{if(!win||win.isDestroyed()) return; if(a==='minimize') win.minimize(); else if(a==='maximize') win.isMaximized()?win.unmaximize():win.maximize(); else if(a==='close') win.close();});
ipcMain.on('toggle-devtools',()=>{if(win&&!win.isDestroyed()) win.webContents.toggleDevTools();});

app.whenReady().then(async()=>{startEngine();await createWindow();app.on('activate',async()=>{if(BrowserWindow.getAllWindows().length===0) await createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin'){if(engineProc) engineProc.kill();app.quit();}});
app.on('before-quit',()=>{if(engineProc) try{engineProc.kill();}catch{} engineProc=null;});
app.on('web-contents-created',(_,c)=>c.on('will-navigate',(e,url)=>{if(!url.startsWith('http://localhost:3000')&&!url.startsWith('file://')){e.preventDefault();shell.openExternal(url);}}));
