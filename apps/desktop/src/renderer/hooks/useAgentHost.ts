import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  AgentMode,
  AskQuestionResponse,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/client";
import { AgentHostClient } from "@excelsior/client";
import type { ExcelsiorApi } from "../../main/preload";
import type { WorkspaceEnvironmentInfo } from "../../main/preload";
import type { WorkspaceTreeNode } from "../../main/preload";
import {
  createDesktopHostAdapter,
  createIpcStateStore,
  type IpcStateStore,
} from "./desktopHostStore.js";
import { selectWorkspaceFolder } from "./workspaceSelection.js";

// Extend global window type
declare global {
  interface Window {
    api: ExcelsiorApi;
  }
}

export function useAgentHost() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [workspaceEnvironment, setWorkspaceEnvironment] = useState<WorkspaceEnvironmentInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const storeRef = useRef<IpcStateStore | null>(null);

  useEffect(() => {
    if (!workspacePath) return;

    const store = createIpcStateStore(window.api);
    storeRef.current = store;

    store.init();
    window.api.getCatalog().then((catalog) => {
      setCommands(catalog.commands);
      setSettings(catalog.settings);
    });
    window.api.getWorkspaceTree().then(setWorkspaceTree);
    window.api.getWorkspaceEnvironment().then(setWorkspaceEnvironment);

    return () => {
      store.dispose();
      storeRef.current = null;
    };
  }, [workspacePath]);

  const state = useSyncExternalStore(
    useCallback(
      (cb: () => void) => {
        const store = storeRef.current;
        return store ? store.subscribe(cb) : () => {};
      },
      // Re-subscribe when the workspace effect replaces storeRef.
      [workspacePath],
    ),
    useCallback(() => storeRef.current?.getSnapshot() ?? null, [workspacePath]),
  );

  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (!workspacePath) {
      wasLoadingRef.current = false;
      return;
    }

    const isLoading = state?.isLoading ?? false;
    if (wasLoadingRef.current && !isLoading) {
      window.api.getWorkspaceEnvironment().then(setWorkspaceEnvironment);
    }
    wasLoadingRef.current = isLoading;
  }, [state?.isLoading, workspacePath]);

  const client = useMemo(() => {
    const hostAdapter = createDesktopHostAdapter({
      api: window.api,
      commands,
      getStore: () => storeRef.current,
      settings,
    });
    return new AgentHostClient(hostAdapter);
  }, [commands, settings]);


  const selectWorkspace = useCallback(async () => {
    setIsInitializing(true);
    setWorkspaceError(null);
    try {
      const result = await selectWorkspaceFolder(window.api);
      if (result.workspacePath) {
        setWorkspacePath(result.workspacePath);
        setWorkspaceTree(result.workspaceTree);
        setWorkspaceEnvironment(await window.api.getWorkspaceEnvironment());
      }
    } catch (err) {
      console.error("Workspace selection failed:", err);
      setWorkspaceError(
        err instanceof Error ? err.message : "Workspace selection failed.",
      );
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const send = useCallback((content: string, options?: SendOptions) => {
    void client.send(content, options);
  }, [client]);

  const cancel = useCallback(() => {
    void client.cancel();
  }, [client]);

  const cancelReflection = useCallback(() => {
    void client.cancelReflection();
  }, [client]);

  const executeCommand = useCallback(
    (input: string): Promise<CommandResult> =>
      client.executeCommand(input),
    [client],
  );

  const createSession = useCallback(
    async (title?: string): Promise<Session> => {
      const session = await client.createSession(title);
      if (!session) {
        throw new Error("Host did not return a session.");
      }
      return session;
    },
    [client],
  );

  const switchSession = useCallback(async (sessionId: string): Promise<void> => {
    await client.switchSession(sessionId);
  }, [client]);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await client.deleteSession(sessionId);
  }, [client]);

  const renameSession = useCallback(
    (sessionId: string, title: string) => {
      void client.renameSession(sessionId, title);
    },
    [client],
  );

  const toggleMode = useCallback(async () => {
    return client.toggleMode();
  }, [client]);

  const setMode = useCallback(async (mode: AgentMode) => {
    await client.setMode(mode);
  }, [client]);

  const saveSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      void client.saveSettings(newSettings)
        .then(() => window.api.getCatalog())
        .then((catalog) => setSettings(catalog.settings));
    },
    [client],
  );

  const respondToConfirmation = useCallback(
    (callId: string, approved: boolean) => {
      void client.respondToConfirmation(callId, approved);
    },
    [client],
  );

  const respondToQuestion = useCallback(
    (response: AskQuestionResponse) => {
      void client.respondToQuestion(response);
    },
    [client],
  );

  const approveAllConfirmations = useCallback(() => {
    void client.approveAllConfirmations();
  }, [client]);

  const clearMessages = useCallback(() => {
    void client.clear();
  }, [client]);

  const switchWorkspace = useCallback(async (path: string) => {
    setIsInitializing(true);
    setWorkspaceError(null);
    try {
      await window.api.initializeWorkspace(path);
      const tree = await window.api.getWorkspaceTree();
      const environment = await window.api.getWorkspaceEnvironment();
      setWorkspacePath(path);
      setWorkspaceTree(tree);
      setWorkspaceEnvironment(environment);
    } catch (err) {
      console.error("Failed to switch workspace:", err);
      setWorkspaceError(
        err instanceof Error ? err.message : "Failed to switch workspace.",
      );
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const revertLastTurn = useCallback(
    (): Promise<CommandResult> => client.revertLastTurn(),
    [client],
  );

  return {
    workspacePath,
    state,
    commands,
    settings,
    workspaceTree,
    workspaceEnvironment,
    isInitializing,
    workspaceError,
    selectWorkspace,
    switchWorkspace,
    send,
    cancel,
    cancelReflection,
    executeCommand,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    toggleMode,
    setMode,
    saveSettings,
    respondToConfirmation,
    respondToQuestion,
    approveAllConfirmations,
    clearMessages,
    revertLastTurn,
  };
}
