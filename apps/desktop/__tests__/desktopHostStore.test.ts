import { describe, expect, it, vi } from "vitest";
import type {
  AgentClientState,
  AgentHostIntent,
} from "@excelsior/client";
import type { ExcelsiorApi } from "../src/main/preload.js";
import {
  createDesktopHostAdapter,
  createIpcStateStore,
} from "../src/renderer/hooks/desktopHostStore.js";

function state(id: string): AgentClientState {
  return {
    turns: [],
    isLoading: false,
    sessions: [],
    currentSessionId: null,
    workspace: { id, name: id, rootPath: "" },
    llm: { providerName: "DeepSeek", modelName: "deepseek-v4-flash" },
    mode: "plan",
    pendingConfirmation: null,
    pendingQuestion: null,
  };
}

function apiWithState(initialState: AgentClientState): {
  api: ExcelsiorApi;
  pushState: (nextState: AgentClientState) => void;
  removed: () => boolean;
} {
  let listener: ((nextState: AgentClientState) => void) | null = null;
  let removed = false;

  return {
    api: {
      onStateChanged: (callback) => {
        listener = callback;
        return () => {
          removed = true;
        };
      },
      getState: async () => initialState,
      getCatalog: async () => ({
        commands: [],
        settings: {
          deepseekApiKey: "",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
        },
      }),
      dispatch: async (_intent: AgentHostIntent) => ({ type: "none" }),
      selectWorkspaceFolder: async () => null,
      initializeWorkspace: async () => initialState,
      getWorkspaceTree: async () => [],
      getWorkspaceEnvironment: async () => ({
        rootPath: null,
        branchName: null,
        changeCount: null,
        hasGit: false,
      }),
      changeTheme: () => {},
    },
    pushState: (nextState) => listener?.(nextState),
    removed: () => removed,
  };
}

describe("desktop host store", () => {
  it("initializes from IPC state and notifies subscribers on pushed updates", async () => {
    const { api, pushState, removed } = apiWithState(state("initial"));
    const store = createIpcStateStore(api);
    const listener = vi.fn();
    store.subscribe(listener);

    await store.init();
    pushState(state("next"));
    store.dispose();

    expect(store.getSnapshot()?.workspace.id).toBe("next");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(removed()).toBe(true);
  });

  it("adapts the current store and catalog to the client host interface", async () => {
    const { api } = apiWithState(state("from-store"));
    const store = createIpcStateStore(api);
    await store.init();

    const host = createDesktopHostAdapter({
      api,
      commands: [],
      getStore: () => store,
      settings: {
        deepseekApiKey: "key",
        githubToken: "token",
        agentToolLoopSteps: "200",
      },
    });

    await expect(host.dispatch({ type: "cancel" })).resolves.toEqual({ type: "none" });
    expect(host.getState().workspace.id).toBe("from-store");
    expect(host.getCatalog().settings.githubToken).toBe("token");
  });
});
