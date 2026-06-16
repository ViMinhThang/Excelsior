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
import {
  createDesktopHostAdapter,
  createIpcStateStore,
  type IpcStateStore,
} from "./desktopHostStore.js";
import { useDesktopWorkspaceHost } from "./useDesktopWorkspaceHost.js";

// Extend global window type
declare global {
  interface Window {
    api: ExcelsiorApi;
  }
}

export function useAgentHost() {
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const workspaceHost = useDesktopWorkspaceHost(window.api);
  const {
    refreshWorkspaceEnvironment,
    selectWorkspace,
    switchWorkspace,
    workspaceEnvironment,
    workspaceError,
    workspacePath,
    workspaceTree,
    isInitializing,
  } = workspaceHost;
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
      void refreshWorkspaceEnvironment();
    }
    wasLoadingRef.current = isLoading;
  }, [refreshWorkspaceEnvironment, state?.isLoading, workspacePath]);

  const client = useMemo(() => {
    const hostAdapter = createDesktopHostAdapter({
      api: window.api,
      commands,
      getStore: () => storeRef.current,
      settings,
    });
    return new AgentHostClient(hostAdapter);
  }, [commands, settings]);

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
