import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@excelsior/core";

const WORKSPACES_STORAGE_KEY = "excelsior-workspaces";
const LAST_WORKSPACE_STORAGE_KEY = "excelsior-workspace-path";

export type DesktopWorkspaceEntry = {
  path: string;
  name: string;
};

export type DesktopWorkspacePendingAction =
  | {
      type: "switch-session";
      workspacePath: string;
      sessionId: string;
    }
  | {
      type: "create-session";
      workspacePath: string;
    };

type DesktopWorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

export function sessionsStorageKey(workspacePath: string): string {
  return `excelsior-sessions-${workspacePath}`;
}

export function workspaceNameFromPath(path: string, name?: string | null): string {
  return name || path.split(/[/\\]/).pop() || "Workspace";
}

export function readDesktopWorkspaces(
  storage: Pick<Storage, "getItem">,
): DesktopWorkspaceEntry[] {
  const raw = storage.getItem(WORKSPACES_STORAGE_KEY);
  return raw ? JSON.parse(raw) as DesktopWorkspaceEntry[] : [];
}

export function readDesktopSessionsCache(
  storage: Pick<Storage, "getItem">,
  workspaces: readonly DesktopWorkspaceEntry[],
): Record<string, Session[]> {
  const cache: Record<string, Session[]> = {};
  for (const workspace of workspaces) {
    const raw = storage.getItem(sessionsStorageKey(workspace.path));
    if (raw) {
      cache[workspace.path] = JSON.parse(raw) as Session[];
    }
  }
  return cache;
}

export function readDesktopWorkspaceControllerState(
  storage: Pick<Storage, "getItem">,
): {
  workspaces: DesktopWorkspaceEntry[];
  sessionsCache: Record<string, Session[]>;
  lastWorkspacePath: string | null;
} {
  const workspaces = readDesktopWorkspaces(storage);
  return {
    workspaces,
    sessionsCache: readDesktopSessionsCache(storage, workspaces),
    lastWorkspacePath: storage.getItem(LAST_WORKSPACE_STORAGE_KEY),
  };
}

export function upsertDesktopWorkspace(
  workspaces: readonly DesktopWorkspaceEntry[],
  workspace: DesktopWorkspaceEntry,
): DesktopWorkspaceEntry[] {
  const exists = workspaces.some((item) => item.path === workspace.path);
  if (!exists) return [...workspaces, workspace];
  return workspaces.map((item) =>
    item.path === workspace.path ? { ...item, name: workspace.name } : item
  );
}

export function persistCurrentDesktopWorkspace(
  storage: DesktopWorkspaceStorage,
  workspaces: readonly DesktopWorkspaceEntry[],
  workspace: DesktopWorkspaceEntry,
): DesktopWorkspaceEntry[] {
  const next = upsertDesktopWorkspace(workspaces, workspace);
  storage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(next));
  storage.setItem(LAST_WORKSPACE_STORAGE_KEY, workspace.path);
  return next;
}

export function persistWorkspaceSessions(
  storage: DesktopWorkspaceStorage,
  cache: Record<string, Session[]>,
  workspacePath: string,
  sessions: readonly Session[],
): Record<string, Session[]> {
  const next = {
    ...cache,
    [workspacePath]: [...sessions],
  };
  storage.setItem(sessionsStorageKey(workspacePath), JSON.stringify(sessions));
  return next;
}

export async function dispatchDesktopWorkspaceAction(input: {
  currentWorkspacePath: string | null;
  action: DesktopWorkspacePendingAction;
  setPendingAction: (action: DesktopWorkspacePendingAction) => void;
  switchWorkspace: (path: string) => Promise<void>;
  createSession: () => Promise<Session>;
  switchSession: (sessionId: string) => Promise<void>;
}): Promise<void> {
  if (input.currentWorkspacePath === input.action.workspacePath) {
    await runDesktopWorkspacePendingAction(input.action, {
      createSession: input.createSession,
      switchSession: input.switchSession,
    });
    return;
  }

  input.setPendingAction(input.action);
  await input.switchWorkspace(input.action.workspacePath);
}

export function shouldRunDesktopWorkspacePendingAction(input: {
  pendingAction: DesktopWorkspacePendingAction | null;
  currentWorkspacePath: string | null;
  isInitializing: boolean;
}): boolean {
  return Boolean(
    input.pendingAction &&
      input.currentWorkspacePath === input.pendingAction.workspacePath &&
      !input.isInitializing,
  );
}

export async function runDesktopWorkspacePendingAction(
  action: DesktopWorkspacePendingAction,
  handlers: {
    createSession: () => Promise<Session>;
    switchSession: (sessionId: string) => Promise<void>;
  },
): Promise<void> {
  if (action.type === "switch-session") {
    await handlers.switchSession(action.sessionId);
  } else {
    await handlers.createSession();
  }
}

export async function deleteCurrentDesktopWorkspaceSession(input: {
  currentWorkspacePath: string | null;
  workspacePath: string;
  sessionId: string;
  deleteSession: (sessionId: string) => Promise<void>;
}): Promise<void> {
  if (input.currentWorkspacePath === input.workspacePath) {
    await input.deleteSession(input.sessionId);
  }
}

export function renameCurrentDesktopWorkspaceSession(input: {
  currentWorkspacePath: string | null;
  workspacePath: string;
  sessionId: string;
  title: string;
  renameSession: (sessionId: string, title: string) => void;
}): void {
  if (input.currentWorkspacePath === input.workspacePath) {
    input.renameSession(input.sessionId, input.title);
  }
}

export function useDesktopWorkspaceController({
  currentWorkspacePath,
  currentWorkspaceName,
  sessions,
  isInitializing,
  switchWorkspace,
  createSession,
  switchSession,
  deleteSession,
  renameSession,
  storage = localStorage,
}: {
  currentWorkspacePath: string | null;
  currentWorkspaceName?: string | null;
  sessions?: Session[];
  isInitializing: boolean;
  switchWorkspace: (path: string) => Promise<void>;
  createSession: () => Promise<Session>;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => void;
  storage?: DesktopWorkspaceStorage;
}) {
  const initialState = useMemo(
    () => readDesktopWorkspaceControllerState(storage),
    [storage],
  );
  const restoreWorkspacePathRef = useRef(initialState.lastWorkspacePath);
  const restoreAttemptRef = useRef<string | null>(null);
  const [workspaces, setWorkspaces] = useState(initialState.workspaces);
  const [sessionsCache, setSessionsCache] = useState(initialState.sessionsCache);
  const [pendingAction, setPendingAction] = useState<DesktopWorkspacePendingAction | null>(null);

  useEffect(() => {
    const path = restoreWorkspacePathRef.current;
    if (!path || currentWorkspacePath || isInitializing) return;
    if (restoreAttemptRef.current === path) return;

    restoreAttemptRef.current = path;
    void switchWorkspace(path);
  }, [currentWorkspacePath, isInitializing, switchWorkspace]);

  useEffect(() => {
    if (!currentWorkspacePath) return;
    const workspace = {
      path: currentWorkspacePath,
      name: workspaceNameFromPath(currentWorkspacePath, currentWorkspaceName),
    };

    setWorkspaces((prev) =>
      persistCurrentDesktopWorkspace(storage, prev, workspace)
    );
  }, [currentWorkspaceName, currentWorkspacePath, storage]);

  useEffect(() => {
    if (!currentWorkspacePath || !sessions) return;
    setSessionsCache((prev) =>
      persistWorkspaceSessions(storage, prev, currentWorkspacePath, sessions)
    );
  }, [currentWorkspacePath, sessions, storage]);

  useEffect(() => {
    if (!shouldRunDesktopWorkspacePendingAction({
      pendingAction,
      currentWorkspacePath,
      isInitializing,
    }) || !pendingAction) {
      return;
    }

    void runDesktopWorkspacePendingAction(pendingAction, {
      createSession,
      switchSession,
    });
    setPendingAction(null);
  }, [
    createSession,
    currentWorkspacePath,
    isInitializing,
    pendingAction,
    switchSession,
  ]);

  const switchWorkspaceAndSession = useCallback(
    async (workspacePath: string, sessionId: string) => {
      await dispatchDesktopWorkspaceAction({
        currentWorkspacePath,
        action: {
          type: "switch-session",
          workspacePath,
          sessionId,
        },
        setPendingAction,
        switchWorkspace,
        createSession,
        switchSession,
      });
    },
    [createSession, currentWorkspacePath, switchSession, switchWorkspace],
  );

  const createSessionInWorkspace = useCallback(
    async (workspacePath: string) => {
      await dispatchDesktopWorkspaceAction({
        currentWorkspacePath,
        action: {
          type: "create-session",
          workspacePath,
        },
        setPendingAction,
        switchWorkspace,
        createSession,
        switchSession,
      });
    },
    [createSession, currentWorkspacePath, switchSession, switchWorkspace],
  );

  const deleteSessionInWorkspace = useCallback(
    async (workspacePath: string, sessionId: string) => {
      await deleteCurrentDesktopWorkspaceSession({
        currentWorkspacePath,
        workspacePath,
        sessionId,
        deleteSession,
      });
    },
    [currentWorkspacePath, deleteSession],
  );

  const renameSessionInWorkspace = useCallback(
    (workspacePath: string, sessionId: string, title: string) => {
      renameCurrentDesktopWorkspaceSession({
        currentWorkspacePath,
        workspacePath,
        sessionId,
        title,
        renameSession,
      });
    },
    [currentWorkspacePath, renameSession],
  );

  return {
    workspaces,
    sessionsCache,
    createSessionInWorkspace,
    deleteSessionInWorkspace,
    renameSessionInWorkspace,
    switchWorkspaceAndSession,
  };
}
