import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";

// Define the API exposed to the renderer process
const excelsiorApi = {
  // Subscriptions to state changes
  onStateChanged: (callback: (state: AgentClientState) => void) => {
    const subscription = (_event: any, state: AgentClientState) => callback(state);
    ipcRenderer.on("host:state-changed", subscription);
    return () => {
      ipcRenderer.removeListener("host:state-changed", subscription);
    };
  },

  // Actions
  getState: (): Promise<AgentClientState> => ipcRenderer.invoke("host:get-state"),
  send: (content: string, options?: SendOptions) => ipcRenderer.send("host:send", content, options),
  cancel: () => ipcRenderer.send("host:cancel"),
  executeCommand: (input: string): Promise<CommandResult> => ipcRenderer.invoke("host:execute-command", input),
  getCommands: (): Promise<CommandDefinition[]> => ipcRenderer.invoke("host:get-commands"),
  createSession: (title?: string): Promise<Session> => ipcRenderer.invoke("host:create-session", title),
  switchSession: (sessionId: string): Promise<void> => ipcRenderer.invoke("host:switch-session", sessionId),
  deleteSession: (sessionId: string): Promise<void> => ipcRenderer.invoke("host:delete-session", sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.send("host:rename-session", sessionId, title),
  getMode: (): Promise<AgentMode> => ipcRenderer.invoke("host:get-mode"),
  setMode: (mode: AgentMode) => ipcRenderer.send("host:set-mode", mode),
  toggleMode: (): Promise<AgentMode> => ipcRenderer.invoke("host:toggle-mode"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("host:get-settings"),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.send("host:save-settings", settings),
  respondToConfirmation: (callId: string, approved: boolean) => ipcRenderer.send("host:respond-to-confirmation", callId, approved),
  approveAllConfirmations: () => ipcRenderer.send("host:approve-all-confirmations"),
  clearMessages: () => ipcRenderer.send("host:clear-messages"),
  revertLastTurn: (): Promise<CommandResult> => ipcRenderer.invoke("host:revert-last-turn"),
  
  // Custom workspace dialog API
  selectWorkspaceFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-workspace-folder"),
  initializeWorkspace: (path: string): Promise<void> => ipcRenderer.invoke("host:initialize-workspace", path),
};

contextBridge.exposeInMainWorld("api", excelsiorApi);

export type ExcelsiorApi = typeof excelsiorApi;
