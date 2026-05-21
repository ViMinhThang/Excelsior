import { useState, useEffect, useCallback } from "react";
import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";
import type { ExcelsiorApi } from "../../../main/preload";
import type { WorkspaceTreeNode } from "../../../main/preload";

// Extend global window type
declare global {
  interface Window {
    api: ExcelsiorApi;
  }
}

export function useAgentHost() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [state, setState] = useState<AgentClientState | null>(null);
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Sync state changes from main process
  useEffect(() => {
    if (!workspacePath) return;

    // Load initial data
    window.api.getState().then(setState);
    window.api.getCommands().then(setCommands);
    window.api.getSettings().then(setSettings);
    window.api.getWorkspaceTree().then(setWorkspaceTree);

    // Subscribe to updates
    const unsubscribe = window.api.onStateChanged((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, [workspacePath]);

  // Workspace actions
  const selectWorkspace = useCallback(async () => {
    setIsInitializing(true);
    setWorkspaceError(null);
    try {
      if (!window.api?.selectWorkspaceFolder) {
        throw new Error("Desktop bridge is unavailable. Please run the Electron desktop app, not the browser preview.");
      }

      const folderPath = await window.api.selectWorkspaceFolder();
      if (folderPath) {
        setWorkspacePath(folderPath);
        const initialState = await window.api.initializeWorkspace(folderPath);
        setState(initialState);
        setWorkspaceTree(await window.api.getWorkspaceTree());
      }
    } catch (err) {
      console.error("Workspace selection failed:", err);
      setWorkspaceError(err instanceof Error ? err.message : "Workspace selection failed.");
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Send turn
  const send = useCallback((content: string, options?: SendOptions) => {
    window.api.send(content, options);
  }, []);

  // Cancel turn
  const cancel = useCallback(() => {
    window.api.cancel();
  }, []);

  // Command executor
  const executeCommand = useCallback(async (input: string): Promise<CommandResult> => {
    return window.api.executeCommand(input);
  }, []);

  // Session actions
  const createSession = useCallback(async (title?: string): Promise<Session> => {
    return window.api.createSession(title);
  }, []);

  const switchSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.api.switchSession(sessionId);
    // Reload state after switching session
    const newState = await window.api.getState();
    setState(newState);
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.api.deleteSession(sessionId);
    const newState = await window.api.getState();
    setState(newState);
  }, []);

  const renameSession = useCallback((sessionId: string, title: string) => {
    window.api.renameSession(sessionId, title);
  }, []);

  // Mode settings
  const toggleMode = useCallback(async () => {
    const nextMode = await window.api.toggleMode();
    const newState = await window.api.getState();
    setState(newState);
    return nextMode;
  }, []);

  const setMode = useCallback(async (mode: AgentMode) => {
    window.api.setMode(mode);
    const newState = await window.api.getState();
    setState(newState);
  }, []);

  // Settings
  const saveSettings = useCallback((newSettings: Partial<AppSettings>) => {
    window.api.saveSettings(newSettings);
    // Refresh settings state
    window.api.getSettings().then(setSettings);
  }, []);

  // Confirmations
  const respondToConfirmation = useCallback((callId: string, approved: boolean) => {
    window.api.respondToConfirmation(callId, approved);
  }, []);

  const approveAllConfirmations = useCallback(() => {
    window.api.approveAllConfirmations();
  }, []);

  const clearMessages = useCallback(() => {
    window.api.clearMessages();
  }, []);

  const revertLastTurn = useCallback(async (): Promise<CommandResult> => {
    const res = await window.api.revertLastTurn();
    const newState = await window.api.getState();
    setState(newState);
    return res;
  }, []);

  return {
    workspacePath,
    state,
    commands,
    settings,
    workspaceTree,
    isInitializing,
    workspaceError,
    selectWorkspace,
    send,
    cancel,
    executeCommand,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    toggleMode,
    setMode,
    saveSettings,
    respondToConfirmation,
    approveAllConfirmations,
    clearMessages,
    revertLastTurn,
  };
}
