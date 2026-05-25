import { describe, expect, it, vi } from "vitest";
import type { AgentHost, AgentHostDispatchResult } from "@excelsior/client";
import { AgentHostClient } from "@excelsior/client";

function createHost(result: AgentHostDispatchResult): AgentHost {
  return {
    getState: () => ({
      displayBlocks: [],
      isLoading: false,
      sessions: [],
      currentSessionId: null,
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "/tmp/workspace",
      },
      mode: "plan",
      pendingConfirmation: null,
    }),
    subscribe: () => () => {},
    getCatalog: () => ({
      commands: [{ name: "help", description: "List commands" }],
      settings: { deepseekApiKey: "", githubToken: "" },
    }),
    dispatch: vi.fn(async () => result),
    dispose: () => {},
  };
}

describe("@excelsior/client AgentHostClient", () => {
  it("wraps and normalizes host state queries, commands, and settings", () => {
    const host = createHost({ type: "none" });
    const client = new AgentHostClient(host);

    expect(client.getState().mode).toBe("plan");
    expect(client.getCommands()).toEqual([
      { name: "help", description: "List commands" },
    ]);
    expect(client.getSettings()).toEqual({
      deepseekApiKey: "",
      githubToken: "",
    });
  });

  it("normalizes and routes dispatches for command, session, and mode execution", async () => {
    const session = {
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: { userInput: "" },
      workspaceId: "ws_test",
    };
    const commandHost = createHost({
      type: "command-result",
      result: { handled: true },
    });
    const sessionHost = createHost({ type: "session", session });
    const modeHost = createHost({ type: "mode", mode: "act" });

    const commandClient = new AgentHostClient(commandHost);
    const sessionClient = new AgentHostClient(sessionHost);
    const modeClient = new AgentHostClient(modeHost);

    await expect(commandClient.executeCommand("/help")).resolves.toEqual({
      handled: true,
    });
    await expect(sessionClient.createSession("Draft")).resolves.toBe(session);
    await expect(modeClient.toggleMode()).resolves.toBe("act");
  });
});

