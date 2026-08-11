import type {
  AgentClientState,
  AgentHost,
  AppSettings,
  CommandDefinition,
} from "@excelsior/client";
import { DEFAULT_APP_SETTINGS } from "@excelsior/core";
import type { ExcelsiorApi } from "../../shared/bridge.js";

const emptyState: AgentClientState = {
  turns: [],
  tasks: [],
  isLoading: false,
  sessions: [],
  currentSessionId: null,
  workspace: { id: "", name: "", rootPath: "" },
  llm: { providerName: "", modelName: "" },
  mode: "plan",
  pendingConfirmation: null,
  pendingQuestion: null,
  reflection: {
    status: "idle",
    touchedFiles: [],
    memoryRoot: "",
  },
};

const emptySettings: AppSettings = { ...DEFAULT_APP_SETTINGS };

export interface IpcStateStore {
  getSnapshot: () => AgentClientState | null;
  subscribe: (cb: () => void) => () => void;
  init: () => Promise<void>;
  dispose: () => void;
}

const STREAM_NOTIFY_FALLBACK_MS = 16;

export function createIpcStateStore(api: ExcelsiorApi): IpcStateStore {
  let snapshot: AgentClientState | null = null;
  const listeners = new Set<() => void>();
  let frameId: number | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const notifyListeners = () => {
    listeners.forEach((fn) => fn());
  };

  const clearScheduledNotify = () => {
    if (frameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameId);
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
    }
    frameId = null;
    fallbackTimer = null;
  };

  const flushScheduledNotify = () => {
    clearScheduledNotify();
    notifyListeners();
  };

  const scheduleStreamingNotify = () => {
    if (frameId !== null || fallbackTimer) return;

    if (typeof requestAnimationFrame === "function") {
      frameId = requestAnimationFrame(flushScheduledNotify);
      fallbackTimer = setTimeout(flushScheduledNotify, STREAM_NOTIFY_FALLBACK_MS);
      return;
    }

    fallbackTimer = setTimeout(flushScheduledNotify, 0);
  };

  const notifyNow = () => {
    clearScheduledNotify();
    notifyListeners();
  };

  const unsub = api.onStateChanged((newState) => {
    snapshot = newState;
    if (newState.isLoading) {
      scheduleStreamingNotify();
      return;
    }
    notifyNow();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    init: async () => {
      snapshot = await api.getState();
      notifyNow();
    },
    dispose: () => {
      clearScheduledNotify();
      unsub();
    },
  };
}

export function createDesktopHostAdapter({
  api,
  commands,
  getStore,
  settings,
}: {
  api: ExcelsiorApi;
  commands: CommandDefinition[];
  getStore: () => IpcStateStore | null;
  settings: AppSettings | null;
}): AgentHost {
  return {
    getState: () => getStore()?.getSnapshot() ?? emptyState,
    subscribe: (cb) => getStore()?.subscribe(cb) ?? (() => {}),
    getCatalog: () => ({ commands, settings: settings ?? emptySettings }),
    dispatch: (intent) => api.dispatch(intent),
    dispose: () => {},
  };
}
