import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/client";
import {
  approveAllHostConfirmations,
  cancelHostTurn,
  clearHostMessages,
  createHostSession,
  deleteHostSession,
  executeHostCommand,
  renameHostSession,
  respondToHostConfirmation,
  revertLastHostTurn,
  saveHostSettings,
  sendHostMessage,
  setHostMode,
  switchHostSession,
  toggleHostMode,
} from "@excelsior/client";
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
      // Re-subscribe when the workspace effect replaces storeRef.
      [workspacePath],
    ),
    useCallback(() => storeRef.current?.getSnapshot() ?? null, [workspacePath]),
  );

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
    void sendHostMessage(window.api, content, options);
  }, []);

  const cancel = useCallback(() => {
    void cancelHostTurn(window.api);
  }, []);

  const executeCommand = useCallback(
    (input: string): Promise<CommandResult> =>
      executeHostCommand(window.api, input),
    [],
  );

  const createSession = useCallback(
    async (title?: string): Promise<Session> => {
      const session = await createHostSession(window.api, title);
      if (!session) {
        throw new Error("Host did not return a session.");
      }
      return session;
    },
    [],
  );

  const switchSession = useCallback(async (sessionId: string): Promise<void> => {
    await switchHostSession(window.api, sessionId);
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await deleteHostSession(window.api, sessionId);
  }, []);

  const renameSession = useCallback(
    (sessionId: string, title: string) => {
      void renameHostSession(window.api, sessionId, title);
    },
    [],
  );

  const toggleMode = useCallback(async () => {
    return toggleHostMode(window.api);
  }, []);

  const setMode = useCallback(async (mode: AgentMode) => {
    await setHostMode(window.api, mode);
  }, []);

  const saveSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      void saveHostSettings(window.api, newSettings)
        .then(() => window.api.getCatalog())
        .then((catalog) => setSettings(catalog.settings));
    },
    [],
  );

  const respondToConfirmation = useCallback(
    (callId: string, approved: boolean) => {
      void respondToHostConfirmation(window.api, callId, approved);
    },
    [],
  );

  const approveAllConfirmations = useCallback(() => {
    void approveAllHostConfirmations(window.api);
  }, []);

  const clearMessages = useCallback(() => {
    void clearHostMessages(window.api);
  }, []);

  const revertLastTurn = useCallback(
    (): Promise<CommandResult> => revertLastHostTurn(window.api),
    [],
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
