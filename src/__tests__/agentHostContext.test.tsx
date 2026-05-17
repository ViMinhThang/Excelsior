import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { AgentHost } from "@excelsior/agent-host";
import { AgentHostProvider } from "../../apps/tui/src/context/AgentHostContext.js";
import { useAgentHostClient } from "../../apps/tui/src/hooks/useAgentHostClient.js";

function createMockHost(): AgentHost {
  const state = {
    displayBlocks: [],
    isLoading: false,
    sessions: [],
    currentSessionId: null,
    workspace: {
      id: "ws_test",
      name: "Test workspace",
      rootPath: "C:/workspace",
    },
    mode: "plan" as const,
    pendingConfirmation: null,
  };

  return {
    getState: () => state,
    subscribe: () => () => {},
    send: () => {},
    cancel: () => {},
    executeCommand: async () => ({ handled: true }),
    getCommands: () => [{ name: "help", description: "List commands" }],
    createSession: () => ({
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: { userInput: "" },
    }),
    switchSession: async () => {},
    deleteSession: () => {},
    renameSession: () => {},
    getMode: () => "plan",
    setMode: () => {},
    toggleMode: () => "act",
    getSettings: () => ({ deepseekApiKey: "", githubToken: "" }),
    saveSettings: () => {},
    respondToConfirmation: () => {},
    approveAllConfirmations: () => {},
    clearMessages: () => {},
    revertLastTurn: async () => ({ handled: true }),
    dispose: () => {},
  };
}

function Probe() {
  const { state, getCommands } = useAgentHostClient();
  return <Text>{`${state.mode}:${getCommands()[0].name}`}</Text>;
}

describe("AgentHostProvider", () => {
  it("lets TUI hooks read from a mocked AgentHost", () => {
    const screen = render(
      <AgentHostProvider host={createMockHost()}>
        <Probe />
      </AgentHostProvider>,
    );

    expect(screen.lastFrame()).toContain("plan:help");
  });
});
