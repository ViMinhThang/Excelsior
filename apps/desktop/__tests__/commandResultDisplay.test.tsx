import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentClientState } from "@excelsior/core";
import { ChatPanel } from "../src/renderer/components/ChatPanel.js";

function state(): AgentClientState {
  return {
    turns: [],
    isLoading: false,
    sessions: [],
    currentSessionId: null,
    workspace: { id: "ws", name: "Workspace", rootPath: "C:/repo" },
    llm: { providerName: "DeepSeek", modelName: "deepseek-v4-flash" },
    mode: "act",
    pendingConfirmation: null,
    pendingQuestion: null,
  };
}

describe("desktop command result display", () => {
  it("renders command output above the composer", () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      commandResult: "Replay: OK\nevents=3",
      inputValue: "",
      openToolCalls: {},
      state: state(),
      onCancel: vi.fn(),
      onInputChange: vi.fn(),
      onModeChange: vi.fn(),
      onRespondToConfirmation: vi.fn(),
      onRespondToQuestion: vi.fn(),
      onSend: vi.fn(),
      onToggleToolCall: vi.fn(),
    }));

    expect(html).toContain("data-testid=\"command-result\"");
    expect(html).toContain("Replay: OK");
    expect(html).toContain("events=3");
  });
});
