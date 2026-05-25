import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentClientState,
} from "@excelsior/core";
import type {
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/agent-host";

export type WorkspaceTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
};

// Define the API exposed to the renderer process
const excelsiorApi = {
  // Subscriptions to state changes
  onStateChanged: (callback: (state: AgentClientState) => void) => {
    const subscription = (_event: unknown, state: AgentClientState) => callback(state);
    ipcRenderer.on("host:state-changed", subscription);
    return () => {
      ipcRenderer.removeListener("host:state-changed", subscription);
    };
  },

  // Actions
  getState: (): Promise<AgentClientState> => ipcRenderer.invoke("host:get-state"),
  getCatalog: (): Promise<AgentHostCatalog> => ipcRenderer.invoke("host:get-catalog"),
  dispatch: (intent: AgentHostIntent): Promise<AgentHostDispatchResult> =>
    ipcRenderer.invoke("host:dispatch", intent),
  
  // Custom workspace dialog API
  selectWorkspaceFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-workspace-folder"),
  initializeWorkspace: (path: string): Promise<AgentClientState> => ipcRenderer.invoke("host:initialize-workspace", path),
  getWorkspaceTree: (): Promise<WorkspaceTreeNode[]> => ipcRenderer.invoke("workspace:get-tree"),
  changeTheme: (theme: string) => ipcRenderer.send("theme:changed", theme),
};

contextBridge.exposeInMainWorld("api", excelsiorApi);

export type ExcelsiorApi = typeof excelsiorApi;
