import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
      // storeRef is stable per workspacePath, re-subscribe on path change
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [workspacePath],
    ),
    useCallback(() => storeRef.current?.getSnapshot() ?? null, [workspacePath]),
  );

  // Workspace actions
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
        // The IPC store subscription will push further state changes.
        // For the initial state after workspace init, we set it directly
        // since the subscribe may not fire synchronously.
        const store = storeRef.current;
        if (store) {
          // store.init() is already called in the effect above
        }
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

  // Send turn
  const send = useCallback((content: string, options?: SendOptions) => {
    void window.api.dispatch({ type: "send", content, options });
  }, []);

  // Cancel turn
  const cancel = useCallback(() => {
    void window.api.dispatch({ type: "cancel" });
  }, []);

  // Command executor
  const executeCommand = useCallback(
    async (input: string): Promise<CommandResult> => {
      const result = await window.api.dispatch({ type: "execute-command", input });
      return result.type === "command-result" ? result.result : { handled: false };
    },
    [],
  );

  // Session actions — no manual getState() after mutation,
  // the IPC push subscription updates the store.
  const createSession = useCallback(
    async (title?: string): Promise<Session> => {
      const result = await window.api.dispatch({ type: "create-session", title });
      if (result.type !== "session") {
        throw new Error("Host did not return a session.");
      }
      return result.session;
    },
    [],
  );

  const switchSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.api.dispatch({ type: "switch-session", sessionId });
    // State is updated via host:state-changed subscription
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await window.api.dispatch({ type: "delete-session", sessionId });
    // State is updated via host:state-changed subscription
  }, []);

  const renameSession = useCallback(
    (sessionId: string, title: string) => {
      void window.api.dispatch({ type: "rename-session", sessionId, title });
    },
    [],
  );

  // Mode settings
  const toggleMode = useCallback(async () => {
    const result = await window.api.dispatch({ type: "toggle-mode" });
    // State is updated via host:state-changed subscription
    return result.type === "mode" ? result.mode : undefined;
  }, []);

  const setMode = useCallback(async (mode: AgentMode) => {
    await window.api.dispatch({ type: "set-mode", mode });
    // State is updated via host:state-changed subscription
  }, []);

  // Settings
  const saveSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      void window.api.dispatch({ type: "save-settings", settings: newSettings })
        .then(() => window.api.getCatalog())
        .then((catalog) => setSettings(catalog.settings));
    },
    [],
  );

  // Confirmations
  const respondToConfirmation = useCallback(
    (callId: string, approved: boolean) => {
      void window.api.dispatch({ type: "respond-to-confirmation", callId, approved });
    },
    [],
  );

  const approveAllConfirmations = useCallback(() => {
    void window.api.dispatch({ type: "approve-all-confirmations" });
  }, []);

  const clearMessages = useCallback(() => {
    void window.api.dispatch({ type: "clear-messages" });
  }, []);

  const revertLastTurn = useCallback(async (): Promise<CommandResult> => {
    const result = await window.api.dispatch({ type: "revert-last-turn" });
    return result.type === "command-result" ? result.result : { handled: false };
    // State is updated via host:state-changed subscription
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
