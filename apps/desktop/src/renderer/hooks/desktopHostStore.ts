import type {
  AgentClientState,
  AgentHost,
  AppSettings,
  CommandDefinition,
} from "@excelsior/client";
import type { ExcelsiorApi } from "../../main/preload.js";

const emptyState: AgentClientState = {
  displayBlocks: [],
  isLoading: false,
  sessions: [],
  currentSessionId: null,
  workspace: { id: "", name: "", rootPath: "" },
  mode: "plan",
  pendingConfirmation: null,
  pendingQuestion: null,
};

const emptySettings: AppSettings = {
  deepseekApiKey: "",
  githubToken: "",
  agentToolLoopSteps: "unlimited",
};

export interface IpcStateStore {
  getSnapshot: () => AgentClientState | null;
  subscribe: (cb: () => void) => () => void;
  init: () => Promise<void>;
  dispose: () => void;
}

export function createIpcStateStore(api: ExcelsiorApi): IpcStateStore {
  let snapshot: AgentClientState | null = null;
  const listeners = new Set<() => void>();

  const unsub = api.onStateChanged((newState) => {
    snapshot = newState;
    listeners.forEach((fn) => fn());
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    init: async () => {
      snapshot = await api.getState();
      listeners.forEach((fn) => fn());
    },
    dispose: unsub,
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
