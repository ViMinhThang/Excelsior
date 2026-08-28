const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
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
  const workspaceRoot = path.resolve(__dirname, '../../');
  console.log('[engine] spawning', bin, 'engine --addr', ENGINE_ADDR, 'in', workspaceRoot);
  engineProc = spawn(bin, ['engine', '--addr', ENGINE_ADDR, '--workspace', workspaceRoot], {
    stdio: 'inherit',
    cwd: workspaceRoot,
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

async function getFrontendURL() {
  if (process.env.ELECTRON_START_URL) return process.env.ELECTRON_START_URL;

  // In dev mode, probe for active Next.js hot-reload dev server at :3000
  if (IS_DEV) {
    const isDevRunning = await new Promise((resolve) => {
      const req = http.get('http://localhost:3000', (res) => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (isDevRunning) {
      console.log('[desktop] Active Next.js dev server found at http://localhost:3000 (hot reload active)');
      return 'http://localhost:3000';
    }
  }

  const prodPaths = [
    path.resolve(__dirname, '../web/dist/index.html'),
    path.resolve(__dirname, '../gui/index.html'),
    path.resolve(__dirname, 'index.html'),
  ];
  for (const p of prodPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'http://localhost:3000';
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    title: 'excelsior',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    autoHideMenuBar: true,
    show: false
  });

  const target = await getFrontendURL();
  console.log('[desktop] loading', target);
  if (target.startsWith('http://') || target.startsWith('https://')) {
    mainWindow.loadURL(target);
  } else {
    mainWindow.loadFile(target);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  Menu.setApplicationMenu(null);
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

// IPC Handlers
ipcMain.handle('get-engine-url', () => ENGINE_URL);
ipcMain.handle('open-folder-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Project Folder'
  });
  if (canceled || !filePaths || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.on('window-control', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === 'close') {
    mainWindow.close();
  }
});

ipcMain.on('toggle-devtools', () => {
  if (mainWindow) {
    mainWindow.webContents.toggleDevTools();
  }
});


app.whenReady().then(async () => {
  startEngineIfNeeded();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (engineProc) engineProc.kill();
    app.quit();
  }
});
