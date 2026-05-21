import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  initializeAgentHostRuntime,
  LocalAgentHost,
  AgentApplication,
  createWorkspace,
  loadWorkspaces,
} from "@excelsior/agent-host";
import type { AgentClientState, SendOptions, AgentMode, AppSettings } from "@excelsior/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let agentHost: LocalAgentHost | null = null;
let stateChangeUnsubscribe: (() => void) | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden", // Sleek custom titlebar support
    titleBarOverlay: {
      color: "#0B0F19",
      symbolColor: "#94A3B8",
      height: 32
    },
    backgroundColor: "#0B0F19",
  });

  // In development, load the Vite dev server URL
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Initialize SQLite persistence & other Agent Host systems at boot
initializeAgentHostRuntime();

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (agentHost) {
      agentHost.dispose();
    }
    app.quit();
  }
});

// Setup IPC handlers
ipcMain.handle("dialog:select-workspace-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Workspace Folder for Excelsior",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("host:initialize-workspace", async (_event, rootPath: string) => {
  if (agentHost) {
    if (stateChangeUnsubscribe) {
      stateChangeUnsubscribe();
    }
    agentHost.dispose();
  }

  // 1. Resolve workspace record in SQLite database
  const workspaces = loadWorkspaces();
  let ws = workspaces.find((w) => path.resolve(w.rootPath) === path.resolve(rootPath));
  
  if (!ws) {
    const wsName = path.basename(rootPath) || "Excelsior Workspace";
    ws = createWorkspace(wsName, rootPath);
  }

  // 2. Instantiate LocalAgentHost with our chosen workspace id
  console.log(`🔌 Initializing Excelsior LocalAgentHost for workspace: ${ws.name} (${rootPath})`);
  const appInstance = new AgentApplication(ws.id);
  agentHost = new LocalAgentHost(appInstance);

  // 3. Register state subscription
  stateChangeUnsubscribe = agentHost.subscribe(() => {
    if (mainWindow && agentHost) {
      const state = agentHost.getState();
      mainWindow.webContents.send("host:state-changed", state);
    }
  });

  // Notify renderer of initial state immediately
  return agentHost.getState();
});

// Helper wrapper to delegate IPC invokes/sends to agentHost
function ensureHost(): LocalAgentHost {
  if (!agentHost) {
    throw new Error("Excelsior Agent Host is not yet initialized. Please select a workspace.");
  }
  return agentHost;
}

ipcMain.handle("host:get-state", () => ensureHost().getState());
ipcMain.on("host:send", (_event, content: string, options?: SendOptions) => ensureHost().send(content, options));
ipcMain.on("host:cancel", () => ensureHost().cancel());
ipcMain.handle("host:execute-command", (_event, input: string) => ensureHost().executeCommand(input));
ipcMain.handle("host:get-commands", () => ensureHost().getCommands());
ipcMain.handle("host:create-session", (_event, title?: string) => ensureHost().createSession(title));
ipcMain.handle("host:switch-session", (_event, sessionId: string) => ensureHost().switchSession(sessionId));
ipcMain.handle("host:delete-session", (_event, sessionId: string) => ensureHost().deleteSession(sessionId));
ipcMain.on("host:rename-session", (_event, sessionId: string, title: string) => ensureHost().renameSession(sessionId, title));
ipcMain.handle("host:get-mode", () => ensureHost().getMode());
ipcMain.on("host:set-mode", (_event, mode: AgentMode) => ensureHost().setMode(mode));
ipcMain.handle("host:toggle-mode", () => ensureHost().toggleMode());
ipcMain.handle("host:get-settings", () => ensureHost().getSettings());
ipcMain.on("host:save-settings", (_event, settings: Partial<AppSettings>) => ensureHost().saveSettings(settings));
ipcMain.on("host:respond-to-confirmation", (_event, callId: string, approved: boolean) => ensureHost().respondToConfirmation(callId, approved));
ipcMain.on("host:approve-all-confirmations", () => ensureHost().approveAllConfirmations());
ipcMain.on("host:clear-messages", () => ensureHost().clearMessages());
ipcMain.handle("host:revert-last-turn", () => ensureHost().revertLastTurn());
