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
import type { AgentHostIntent } from "@excelsior/agent-host";

type WorkspaceTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let agentHost: LocalAgentHost | null = null;
let stateChangeUnsubscribe: (() => void) | null = null;
let currentWorkspaceRoot: string | null = null;

const IGNORED_TREE_NAMES = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage"]);
const MAX_TREE_DEPTH = 4;
const MAX_TREE_ENTRIES_PER_DIR = 80;

function buildWorkspaceTree(rootPath: string, dirPath = rootPath, depth = 0): WorkspaceTreeNode[] {
  if (depth > MAX_TREE_DEPTH) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !IGNORED_TREE_NAMES.has(entry.name) && !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_TREE_ENTRIES_PER_DIR);

  return entries.map((entry) => {
    const absolutePath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");
    const isDirectory = entry.isDirectory();

    return {
      name: entry.name,
      path: relativePath,
      type: isDirectory ? "directory" : "file",
      ...(isDirectory ? { children: buildWorkspaceTree(rootPath, absolutePath, depth + 1) } : {}),
    };
  });
}

function createWindow() {
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
    titleBarStyle: "hidden", // Sleek custom titlebar support
    titleBarOverlay: {
      color: "#1e2227",
      symbolColor: "#5c6370",
      height: 32
    },
    backgroundColor: "#282c34",
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

ipcMain.on("theme:changed", (_event, theme: string) => {
  if (!mainWindow) return;

  let color = "#1e2227"; // Default One Dark Pro bg
  let symbolColor = "#5c6370"; // Default One Dark Pro text

  if (theme === "tokyo-night") {
    color = "#13131a";
    symbolColor = "#565f89";
  } else if (theme === "gruvbox") {
    color = "#ebdbb2";
    symbolColor = "#928374";
  } else if (theme === "tokyo-night-light") {
    color = "#c8c9d1";
    symbolColor = "#9699a3";
  }

  try {
    mainWindow.setTitleBarOverlay({
      color,
      symbolColor,
      height: 32
    });
  } catch (err) {
    console.error("Failed to set title bar overlay:", err);
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
  currentWorkspaceRoot = rootPath;
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
ipcMain.handle("host:get-catalog", () => ensureHost().getCatalog());
ipcMain.handle("host:dispatch", (_event, intent: AgentHostIntent) =>
  ensureHost().dispatch(intent),
);
ipcMain.handle("workspace:get-tree", () => {
  if (!currentWorkspaceRoot) return [];
  return buildWorkspaceTree(currentWorkspaceRoot);
});
