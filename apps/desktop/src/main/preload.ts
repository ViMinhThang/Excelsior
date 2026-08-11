import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentClientState,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";
import { IPC_CHANNELS, type ExcelsiorApi } from "../shared/bridge.js";

const excelsiorApi: ExcelsiorApi = {
  onStateChanged: (callback: (state: AgentClientState) => void) => {
    const subscription = (_event: unknown, state: AgentClientState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.hostStateChanged, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.hostStateChanged, subscription);
    };
  },

  getState: (): Promise<AgentClientState> => ipcRenderer.invoke(IPC_CHANNELS.hostGetState),
  getCatalog: (): Promise<AgentHostCatalog> => ipcRenderer.invoke(IPC_CHANNELS.hostGetCatalog),
  dispatch: (intent: AgentHostIntent): Promise<AgentHostDispatchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.hostDispatch, intent),

  selectWorkspaceFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.dialogSelectWorkspaceFolder),
  initializeWorkspace: (path: string): Promise<AgentClientState> =>
    ipcRenderer.invoke(IPC_CHANNELS.hostInitializeWorkspace, path),
  getWorkspaceTree: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetTree),
  getWorkspaceEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetEnvironment),
  changeTheme: (theme: string) => ipcRenderer.send(IPC_CHANNELS.themeChanged, theme),
};

contextBridge.exposeInMainWorld("api", excelsiorApi);
