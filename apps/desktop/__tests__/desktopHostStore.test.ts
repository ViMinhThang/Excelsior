import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentClientState,
  AgentHostIntent,
} from "@excelsior/client";
import type { ExcelsiorApi } from "../src/shared/bridge.js";
import {
  createDesktopHostAdapter,
  createIpcStateStore,
} from "../src/renderer/hooks/desktopHostStore.js";

function state(id: string, overrides: Partial<AgentClientState> = {}): AgentClientState {
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
    reflection: {
      status: "idle",
      touchedFiles: [],
      memoryRoot: "C:/memory",
    },
    ...overrides,
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
          autoReflectionEnabled: false,
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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

  it("coalesces loading state pushes into the next animation frame", async () => {
    let animationFrameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.useFakeTimers();
    const { api, pushState } = apiWithState(state("initial"));
    const store = createIpcStateStore(api);
    const listener = vi.fn();
    store.subscribe(listener);

    await store.init();
    listener.mockClear();

    pushState(state("stream-1", { isLoading: true }));
    pushState(state("stream-2", { isLoading: true }));
    pushState(state("stream-3", { isLoading: true }));

    expect(listener).not.toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()?.workspace.id).toBe("stream-3");

    animationFrameCallback!(16);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()?.workspace.id).toBe("stream-3");
  });

  it("flushes the final non-loading state immediately", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { api, pushState } = apiWithState(state("initial"));
    const store = createIpcStateStore(api);
    const listener = vi.fn();
    store.subscribe(listener);

    await store.init();
    listener.mockClear();

    pushState(state("stream", { isLoading: true }));
    pushState(state("done", { isLoading: false }));

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()?.workspace.id).toBe("done");
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
        autoReflectionEnabled: false,
      },
    });

    await expect(host.dispatch({ type: "cancel" })).resolves.toEqual({ type: "none" });
    expect(host.getState().workspace.id).toBe("from-store");
    expect(host.getCatalog().settings.githubToken).toBe("token");
  });
});
