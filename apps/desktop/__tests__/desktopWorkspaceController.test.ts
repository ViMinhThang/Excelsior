import { describe, expect, it, vi } from "vitest";
import type { Session } from "@excelsior/core";
import {
  deleteCurrentDesktopWorkspaceSession,
  dispatchDesktopWorkspaceAction,
  persistCurrentDesktopWorkspace,
  persistWorkspaceSessions,
  readDesktopWorkspaceControllerState,
  renameCurrentDesktopWorkspaceSession,
  runDesktopWorkspacePendingAction,
  sessionsStorageKey,
  shouldRunDesktopWorkspacePendingAction,
  workspaceNameFromPath,
  type DesktopWorkspacePendingAction,
} from "../src/renderer/hooks/desktopWorkspaceController.js";

class MemoryStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function session(id: string): Session {
  return {
    id,
    startedAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    metadata: { userInput: "" },
  };
}

function actionHandlers() {
  return {
    createSession: vi.fn(async () => session("created")),
    switchSession: vi.fn(async (_sessionId: string) => {}),
    switchWorkspace: vi.fn(async (_path: string) => {}),
    setPendingAction: vi.fn((_action: DesktopWorkspacePendingAction) => {}),
  };
}

describe("desktop workspace controller", () => {
  it("loads Workspace list and per-Workspace Session cache from existing storage keys", () => {
    const storage = new MemoryStorage();
    storage.setItem("excelsior-workspaces", JSON.stringify([
      { path: "C:/one", name: "One" },
      { path: "C:/two", name: "Two" },
    ]));
    storage.setItem(sessionsStorageKey("C:/one"), JSON.stringify([session("one")]));
    storage.setItem(sessionsStorageKey("C:/two"), JSON.stringify([session("two")]));
    storage.setItem("excelsior-workspace-path", "C:/two");

    expect(readDesktopWorkspaceControllerState(storage)).toEqual({
      workspaces: [
        { path: "C:/one", name: "One" },
        { path: "C:/two", name: "Two" },
      ],
      sessionsCache: {
        "C:/one": [session("one")],
        "C:/two": [session("two")],
      },
      lastWorkspacePath: "C:/two",
    });
  });

  it("upserts the current Workspace name and persists the last active Workspace path", () => {
    const storage = new MemoryStorage();
    const next = persistCurrentDesktopWorkspace(storage, [
      { path: "C:/repo", name: "Old" },
    ], {
      path: "C:/repo",
      name: "Excelsior",
    });

    expect(next).toEqual([{ path: "C:/repo", name: "Excelsior" }]);
    expect(JSON.parse(storage.getItem("excelsior-workspaces") ?? "[]")).toEqual(next);
    expect(storage.getItem("excelsior-workspace-path")).toBe("C:/repo");
    expect(workspaceNameFromPath("C:/repo/subproject", null)).toBe("subproject");
  });

  it("caches Sessions for the active Workspace without dropping inactive Workspaces", () => {
    const storage = new MemoryStorage();
    const inactive = [session("inactive")];

    const next = persistWorkspaceSessions(storage, {
      "C:/inactive": inactive,
    }, "C:/active", [session("active")]);

    expect(next).toEqual({
      "C:/inactive": inactive,
      "C:/active": [session("active")],
    });
    expect(JSON.parse(storage.getItem(sessionsStorageKey("C:/active")) ?? "[]")).toEqual([
      session("active"),
    ]);
  });

  it("executes same-Workspace Session actions immediately", async () => {
    const handlers = actionHandlers();

    await dispatchDesktopWorkspaceAction({
      currentWorkspacePath: "C:/repo",
      action: {
        type: "switch-session",
        workspacePath: "C:/repo",
        sessionId: "ses_1",
      },
      ...handlers,
    });

    expect(handlers.switchSession).toHaveBeenCalledWith("ses_1");
    expect(handlers.switchWorkspace).not.toHaveBeenCalled();
    expect(handlers.setPendingAction).not.toHaveBeenCalled();
  });

  it("defers cross-Workspace create and switch actions until the target Workspace is active", async () => {
    const handlers = actionHandlers();
    const createAction: DesktopWorkspacePendingAction = {
      type: "create-session",
      workspacePath: "C:/next",
    };

    await dispatchDesktopWorkspaceAction({
      currentWorkspacePath: "C:/current",
      action: createAction,
      ...handlers,
    });

    expect(handlers.setPendingAction).toHaveBeenCalledWith(createAction);
    expect(handlers.switchWorkspace).toHaveBeenCalledWith("C:/next");
    expect(handlers.createSession).not.toHaveBeenCalled();
    expect(shouldRunDesktopWorkspacePendingAction({
      pendingAction: createAction,
      currentWorkspacePath: "C:/next",
      isInitializing: true,
    })).toBe(false);
    expect(shouldRunDesktopWorkspacePendingAction({
      pendingAction: createAction,
      currentWorkspacePath: "C:/next",
      isInitializing: false,
    })).toBe(true);

    await runDesktopWorkspacePendingAction(createAction, handlers);
    expect(handlers.createSession).toHaveBeenCalledTimes(1);

    const switchAction: DesktopWorkspacePendingAction = {
      type: "switch-session",
      workspacePath: "C:/next",
      sessionId: "ses_next",
    };
    await runDesktopWorkspacePendingAction(switchAction, handlers);
    expect(handlers.switchSession).toHaveBeenCalledWith("ses_next");
  });

  it("keeps delete and rename for inactive Workspace Sessions as no-ops", async () => {
    const deleteSession = vi.fn(async (_sessionId: string) => {});
    const renameSession = vi.fn((_sessionId: string, _title: string) => {});

    await deleteCurrentDesktopWorkspaceSession({
      currentWorkspacePath: "C:/active",
      workspacePath: "C:/inactive",
      sessionId: "ses_inactive",
      deleteSession,
    });
    renameCurrentDesktopWorkspaceSession({
      currentWorkspacePath: "C:/active",
      workspacePath: "C:/inactive",
      sessionId: "ses_inactive",
      title: "Renamed",
      renameSession,
    });

    expect(deleteSession).not.toHaveBeenCalled();
    expect(renameSession).not.toHaveBeenCalled();

    await deleteCurrentDesktopWorkspaceSession({
      currentWorkspacePath: "C:/active",
      workspacePath: "C:/active",
      sessionId: "ses_active",
      deleteSession,
    });
    renameCurrentDesktopWorkspaceSession({
      currentWorkspacePath: "C:/active",
      workspacePath: "C:/active",
      sessionId: "ses_active",
      title: "Renamed",
      renameSession,
    });

    expect(deleteSession).toHaveBeenCalledWith("ses_active");
    expect(renameSession).toHaveBeenCalledWith("ses_active", "Renamed");
  });
});
