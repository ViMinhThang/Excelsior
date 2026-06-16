import type { ReactElement } from "react";
import { act, create } from "react-test-renderer";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ChatPanelProps = {
  onInputChange: (value: string) => void;
  onToggleToolCall: (id: string) => void;
} & Record<string, unknown>;

const chatPanelProps: ChatPanelProps[] = [];
let App: () => ReactElement;

vi.mock("../src/renderer/hooks/useAgentHost.ts", () => ({
  useAgentHost: () => ({
    workspacePath: "C:/repo",
    state: {
      turns: [],
      isLoading: false,
      sessions: [],
      currentSessionId: null,
      workspace: { id: "ws", name: "Workspace", rootPath: "C:/repo" },
      llm: { providerName: "DeepSeek", modelName: "deepseek-v4-flash" },
      mode: "act",
      pendingConfirmation: null,
      pendingQuestion: null,
      reflection: {
        status: "idle",
        memoryRoot: "",
        touchedFiles: [],
      },
    },
    settings: null,
    workspaceEnvironment: null,
    isInitializing: false,
    workspaceError: null,
    selectWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
    cancelReflection: vi.fn(),
    executeCommand: vi.fn(),
    createSession: vi.fn(),
    switchSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    setMode: vi.fn(),
    saveSettings: vi.fn(),
    respondToConfirmation: vi.fn(),
    respondToQuestion: vi.fn(),
  }),
}));

vi.mock("../src/renderer/hooks/desktopWorkspaceController.js", () => ({
  useDesktopWorkspaceController: () => ({
    workspaces: [],
    sessionsCache: {},
    createSessionInWorkspace: vi.fn(),
    deleteSessionInWorkspace: vi.fn(),
    renameSessionInWorkspace: vi.fn(),
    switchWorkspaceAndSession: vi.fn(),
  }),
}));

vi.mock("../src/renderer/hooks/useDesktopContextRail.js", () => ({
  useDesktopContextRail: () => ({
    notes: "",
    setNotes: vi.fn(),
  }),
}));

vi.mock("../src/renderer/components/ChatPanel.tsx", () => ({
  ChatPanel: (props: ChatPanelProps) => {
    chatPanelProps.push(props);
    return null;
  },
}));

vi.mock("../src/renderer/components/ContextRail.tsx", () => ({
  ContextRail: () => null,
}));

vi.mock("../src/renderer/components/SettingsDialog.tsx", () => ({
  SettingsDialog: () => null,
}));

vi.mock("../src/renderer/components/WorkspaceGate.tsx", () => ({
  WorkspaceGate: () => null,
}));

vi.mock("../src/renderer/components/WorkspaceSidebar.tsx", () => ({
  WorkspaceSidebar: () => null,
}));

describe("desktop chat renderer", () => {
  beforeAll(async () => {
    const appModulePath = ["../src/renderer/App", "js"].join(".");
    App = (await import(appModulePath) as { default: () => ReactElement }).default;
  });

  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      clear: () => storage.clear(),
    });
    vi.stubGlobal("document", {
      documentElement: {
        dataset: {},
        style: { setProperty: vi.fn() },
        removeAttribute: vi.fn(),
      },
    });
    vi.stubGlobal("window", {
      api: { changeTheme: vi.fn() },
    });
    chatPanelProps.length = 0;
  });

  it("keeps the tool toggle callback stable across composer edits", () => {
    act(() => {
      create(<App />);
    });

    const firstToggle = chatPanelProps.at(-1)?.onToggleToolCall;

    act(() => {
      chatPanelProps.at(-1)?.onInputChange("hello");
    });

    expect(chatPanelProps.at(-1)?.onToggleToolCall).toBe(firstToggle);
  });
});
