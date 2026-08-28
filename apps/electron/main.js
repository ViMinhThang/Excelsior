const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let engineProc = null;
const ENGINE_URL = process.env.EXCELSIOR_ENGINE || 'ws://localhost:17812/v1/ws';
const ENGINE_ADDR = process.env.EXCELSIOR_ENGINE_ADDR || ':17812';

function startEngineIfNeeded() {
  // Try to connect; if fails, spawn `excelsior engine`
  // For lean, just spawn if EXCELSIOR_AUTO_ENGINE != "0"
  if (process.env.EXCELSIOR_AUTO_ENGINE === "0") return;
  const bin = path.resolve(__dirname, '../../excelsior.exe');
  const fs = require('fs');
  if (!fs.existsSync(bin)) return;
  engineProc = spawn(bin, ['engine', '--addr', ENGINE_ADDR], { stdio: 'inherit', env: process.env });
  engineProc.on('exit', () => { engineProc = null; });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    backgroundColor: '#0a0a0a',
    title: 'excelsior',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });

  // Load Next.js export (apps/web/dist) if built, else dev server, else fallback gui
  const fs = require('fs');
  const nextDist = path.join(__dirname, '../web/dist/index.html');
  const guiPath = path.join(__dirname, '../gui/index.html');
  if (fs.existsSync(nextDist)) win.loadFile(nextDist);
  else if (process.env.ELECTRON_START_URL) win.loadURL(process.env.ELECTRON_START_URL);
  else if (fs.existsSync(guiPath)) win.loadFile(guiPath);
  else win.loadURL('http://localhost:3000');

  // Inject engine URL for renderer
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`window.EXCELSIOR_ENGINE = ${JSON.stringify(ENGINE_URL)}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  startEngineIfNeeded();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (engineProc) try { engineProc.kill(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-engine-url', () => ENGINE_URL);
