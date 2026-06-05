import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { initializeAgentHostRuntime } from "@excelsior/agent-host";
import type { AgentHostIntent } from "@excelsior/client";
import { DesktopWorkspaceHost } from "./workspaceHost.js";
import { titlebarOverlayForTheme } from "./titlebarTheme.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const workspaceHost = new DesktopWorkspaceHost((state) => {
  mainWindow?.webContents.send("host:state-changed", state);
});

function createWindow() {
  const titlebarOverlay = titlebarOverlayForTheme();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      ...titlebarOverlay,
      height: 32,
    },
    backgroundColor: titlebarOverlay.color,
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

initializeAgentHostRuntime();

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    workspaceHost.dispose();
    app.quit();
  }
});

ipcMain.on("theme:changed", (_event, theme: string) => {
  if (!mainWindow) return;
  const titlebarOverlay = titlebarOverlayForTheme(theme);

  try {
    mainWindow.setTitleBarOverlay({
      ...titlebarOverlay,
      height: 32,
    });
  } catch (err) {
    console.error("Failed to set title bar overlay:", err);
  }
});


ipcMain.handle("dialog:select-workspace-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Workspace Folder for Excelsior",
  });

  return result.canceled || result.filePaths.length === 0
    ? null
    : result.filePaths[0];
});

ipcMain.handle("host:initialize-workspace", async (_event, rootPath: string) =>
  workspaceHost.initializeWorkspace(rootPath),
);
ipcMain.handle("host:get-state", () => workspaceHost.requireHost().getState());
ipcMain.handle("host:get-catalog", () => workspaceHost.requireHost().getCatalog());
ipcMain.handle("host:dispatch", (_event, intent: AgentHostIntent) =>
  workspaceHost.requireHost().dispatch(intent),
);
ipcMain.handle("workspace:get-tree", () => workspaceHost.getWorkspaceTree());
ipcMain.handle("workspace:get-environment", () => workspaceHost.getWorkspaceEnvironment());
