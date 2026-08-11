import type { ReactElement } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentClientState, AppSettings, CommandResult, SendOptions } from "@excelsior/core";
import { useChatSubmission } from "../src/renderer/hooks/useChatSubmission.js";
import { useDesktopPreferences } from "../src/renderer/hooks/useDesktopPreferences.js";
import type { DesktopTheme } from "../src/renderer/components/settingsDialog/themeOptions.js";

function state(overrides: Partial<AgentClientState> = {}): AgentClientState {
  return {
    turns: [],
    isLoading: false,
    sessions: [],
    currentSessionId: null,
    workspace: { id: "ws", name: "Workspace", rootPath: "C:/repo" },
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

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("desktop composition hooks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends visible text while injecting desktop context into the hidden prompt", () => {
    let hook: ReturnType<typeof useChatSubmission> | null = null;
    const send = vi.fn<(content: string, options?: SendOptions) => void>();
    const executeCommand = vi.fn<(command: string) => Promise<CommandResult>>();

    function Harness(): ReactElement | null {
      hook = useChatSubmission({
        executeCommand,
        notes: "Prefer renderer locality.",
        send,
        state: state(),
        workspaceEnvironment: {
          rootPath: "C:/repo",
          branchName: "codex/refactor",
          changeCount: 3,
          hasGit: true,
        },
      });
      return null;
    }

    act(() => {
      create(<Harness />);
    });
    act(() => {
      hook?.setInputValue("Make the panel calm");
    });
    act(() => {
      hook?.submit();
    });

    expect(send).toHaveBeenCalledWith(
      expect.stringContaining("## Desktop Context"),
      { displayContent: "Make the panel calm" },
    );
    expect(send.mock.calls[0][0]).toContain("Branch: codex/refactor");
    expect(send.mock.calls[0][0]).toContain("Prefer renderer locality.");
    expect(hook!.inputValue).toBe("");
  });

  it("routes slash commands to the command adapter and stores the command result", async () => {
    let hook: ReturnType<typeof useChatSubmission> | null = null;
    const send = vi.fn<(content: string, options?: SendOptions) => void>();
    const executeCommand = vi.fn<(command: string) => Promise<CommandResult>>()
      .mockResolvedValue({ handled: true, message: "Command done" });

    function Harness(): ReactElement | null {
      hook = useChatSubmission({
        executeCommand,
        notes: "",
        send,
        state: state(),
        workspaceEnvironment: null,
      });
      return null;
    }

    act(() => {
      create(<Harness />);
    });
    act(() => {
      hook?.setInputValue("/status");
    });
    await act(async () => {
      hook?.submit();
      await Promise.resolve();
    });

    expect(executeCommand).toHaveBeenCalledWith("/status");
    expect(send).not.toHaveBeenCalled();
    expect(hook!.commandResult).toBe("Command done");
  });

  it("persists theme/font preferences and applies theme side effects", () => {
    let hook: ReturnType<typeof useDesktopPreferences> | null = null;
    const storage = memoryStorage({ "excelsior-theme": "nordic-blue" });
    const changeTheme = vi.fn<(theme: DesktopTheme) => void>();
    const saveSettings = vi.fn<(settings: Partial<AppSettings>) => void>();
    const setProperty = vi.fn();
    const documentElement = {
      dataset: {} as Record<string, string>,
      style: { setProperty },
    };
    vi.stubGlobal("document", { documentElement });

    function Harness(): ReactElement | null {
      hook = useDesktopPreferences({
        changeTheme,
        saveSettings,
        storage,
      });
      return null;
    }

    act(() => {
      create(<Harness />);
    });
    expect(hook!.theme).toBe("nordic-blue");
    expect(changeTheme).toHaveBeenLastCalledWith("nordic-blue");

    act(() => {
      hook?.savePreferences({ agentToolLoopSteps: "200" }, "excelsior", "JetBrains Mono");
    });

    expect(saveSettings).toHaveBeenCalledWith({ agentToolLoopSteps: "200" });
    expect(storage.getItem("excelsior-theme")).toBe("excelsior");
    expect(storage.getItem("excelsior-font")).toBe("JetBrains Mono");
    expect(setProperty).toHaveBeenLastCalledWith("--font-brand", "JetBrains Mono");
    expect(hook!.showSettings).toBe(false);
  });
});
