import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { AgentHost } from "@excelsior/client";
import { AgentHostProvider } from "../src/context/AgentHostContext.js";
import { useAgentHostClient } from "../src/hooks/useAgentHostClient.js";

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
    pendingQuestion: null,
  };

  return {
    getState: () => state,
    subscribe: () => () => {},
    getCatalog: () => ({
      commands: [{ name: "help", description: "List commands" }],
      settings: {
        deepseekApiKey: "",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
      },
    }),
    dispatch: async (intent) => {
      if (intent.type === "execute-command") {
        return { type: "command-result", result: { handled: true } };
      }
      if (intent.type === "create-session") {
        return {
          type: "session",
          session: {
            id: "ses_1",
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            metadata: { userInput: "" },
          },
        };
      }
      if (intent.type === "toggle-mode") return { type: "mode", mode: "act" };
      return { type: "none" };
    },
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
