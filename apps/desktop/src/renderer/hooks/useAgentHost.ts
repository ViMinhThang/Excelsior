import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
  AgentHost,
} from "@excelsior/client";
import { AgentHostClient } from "@excelsior/client";
import type { ExcelsiorApi } from "../../main/preload";
import type { WorkspaceTreeNode } from "../../main/preload";

// Extend global window type
declare global {
  interface Window {
    api: ExcelsiorApi;
  }
}

/**
 * A store that wraps the IPC subscription + getState into a
 * subscribe/getSnapshot interface compatible with useSyncExternalStore.
 *
 * The store is updated ONLY from the push subscription (host:state-changed),
 * never from manual getState() calls. This eliminates race conditions.
 */
function createIpcStateStore() {
  let snapshot: AgentClientState | null = null;
  const listeners = new Set<() => void>();

  const unsub = window.api.onStateChanged((newState) => {
    snapshot = newState;
    listeners.forEach((fn) => fn());
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    /** Fetch initial state from main process. Call once on creation. */
    init: async () => {
      snapshot = await window.api.getState();
      listeners.forEach((fn) => fn());
    },
    dispose: unsub,
  };
}

export function useAgentHost() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Created once per workspacePath; disposed on cleanup
  const storeRef = useRef<ReturnType<typeof createIpcStateStore> | null>(null);

  useEffect(() => {
    if (!workspacePath) return;

    const store = createIpcStateStore();
    storeRef.current = store;

    store.init();
    window.api.getCatalog().then((catalog) => {
      setCommands(catalog.commands);
      setSettings(catalog.settings);
    });
    window.api.getWorkspaceTree().then(setWorkspaceTree);

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

  const client = useMemo(() => {
    const dummyState: AgentClientState = {
      displayBlocks: [],
      isLoading: false,
      sessions: [],
      currentSessionId: null,
      workspace: { id: "", name: "", rootPath: "" },
      mode: "plan",
      pendingConfirmation: null,
    };

    const dummySettings: AppSettings = {
      deepseekApiKey: "",
      githubToken: "",
    };

    const hostAdapter: AgentHost = {
      getState: () => storeRef.current?.getSnapshot() ?? dummyState,
      subscribe: (cb) => storeRef.current?.subscribe(cb) ?? (() => {}),
      getCatalog: () => ({ commands, settings: settings ?? dummySettings }),
      dispatch: (intent) => window.api.dispatch(intent),
      dispose: () => {},
    };
    return new AgentHostClient(hostAdapter);
  }, [commands, settings]);


  const selectWorkspace = useCallback(async () => {
    setIsInitializing(true);
    setWorkspaceError(null);
    try {
      if (!window.api?.selectWorkspaceFolder) {
        throw new Error(
          "Desktop bridge is unavailable. Please run the Electron desktop app, not the browser preview.",
        );
      }

      const folderPath = await window.api.selectWorkspaceFolder();
      if (folderPath) {
        setWorkspacePath(folderPath);
        await window.api.initializeWorkspace(folderPath);
        setWorkspaceTree(await window.api.getWorkspaceTree());
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

