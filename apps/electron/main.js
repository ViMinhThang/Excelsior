const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let engineProc = null;
let mainWindow = null;

const ENGINE_URL = process.env.EXCELSIOR_ENGINE || 'ws://localhost:17812/v1/ws';
const ENGINE_ADDR = process.env.EXCELSIOR_ENGINE_ADDR || ':17812';
const IS_DEV = !app.isPackaged;

function getEngineBinary() {
  const candidates = [
    path.resolve(__dirname, '../../excelsior.exe'),
    path.resolve(__dirname, '../../excelsior'),
    path.join(process.resourcesPath, 'excelsior.exe'),
    path.join(process.resourcesPath, 'excelsior'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function startEngineIfNeeded() {
  if (process.env.EXCELSIOR_AUTO_ENGINE === '0') return;
  const bin = getEngineBinary();
  if (!bin) {
    console.log('[engine] binary not found, expecting external engine at', ENGINE_ADDR);
    return;
  }
  console.log('[engine] spawning', bin, 'engine --addr', ENGINE_ADDR);
  engineProc = spawn(bin, ['engine', '--addr', ENGINE_ADDR], {
    stdio: 'inherit',
    env: process.env,
    detached: false
  });
  engineProc.on('error', (err) => dialog.showErrorBox('Engine failed to start', String(err)));
  engineProc.on('exit', (code) => {
    console.log('[engine] exited', code);
    engineProc = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('engine-status', { running: false, code });
    }
  });
}

function getFrontendURL() {
  // In dev, Next.js runs on 3000; in prod, load static export from apps/web/dist
  if (IS_DEV && process.env.ELECTRON_START_URL) return process.env.ELECTRON_START_URL;
  const prodPaths = [
    path.join(__dirname, '../web/dist/index.html'),
    path.join(__dirname, '../gui/index.html'),
    path.join(__dirname, 'index.html'),
  ];
  for (const p of prodPaths) if (fs.existsSync(p)) return `file://${p}`;
  // Fallback to Next.js dev server
  return 'http://localhost:3000';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    title: 'Excelsior',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    autoHideMenuBar: true,
    show: false
  });

  const url = getFrontendURL();
  console.log('[desktop] loading', url);
  if (url.startsWith('file://')) mainWindow.loadFile(url.replace('file://', ''));
  else mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Menu
  const menu = Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { label: 'Engine', submenu: [
      { label: `Engine: ${ENGINE_URL}`, enabled: false },
      { label: 'Restart Engine', click: () => { if (engineProc) engineProc.kill(); startEngineIfNeeded(); } },
      { label: 'Open DevTools', click: () => mainWindow.webContents.openDevTools() }
    ]}
  ]);
  Menu.setApplicationMenu(menu);
}

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
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

app.on('before-quit', () => {
  if (engineProc) try { engineProc.kill(); } catch {}
});

ipcMain.handle('get-engine-url', () => ENGINE_URL);
ipcMain.handle('get-versions', () => ({
  app: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node
}));
