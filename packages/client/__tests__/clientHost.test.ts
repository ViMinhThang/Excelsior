import { describe, expect, it, vi } from "vitest";
import type { AgentHost, AgentHostDispatchResult } from "@excelsior/client";
import { AgentHostClient } from "@excelsior/client";

function createHost(result: AgentHostDispatchResult): AgentHost {
  return {
    getState: () => ({
      turns: [],
      isLoading: false,
      sessions: [],
      currentSessionId: null,
      workspace: {
        id: "ws_test",
        name: "Test workspace",
        rootPath: "/tmp/workspace",
      },
      llm: {
        providerName: "DeepSeek",
        modelName: "deepseek-v4-flash",
      },
      mode: "plan",
      pendingConfirmation: null,
      pendingQuestion: null,
      reflection: {
        status: "idle",
        touchedFiles: [],
        memoryRoot: "/tmp/memory",
      },
    }),
    subscribe: () => () => {},
    getCatalog: () => ({
      commands: [{ name: "help", description: "List commands" }],
      settings: {
        deepseekApiKey: "",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
      },
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
      agentToolLoopSteps: "unlimited",
      autoReflectionEnabled: false,
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

  it("dispatches question responses through the host contract", async () => {
    const host = createHost({ type: "none" });
    const client = new AgentHostClient(host);

    await client.respondToQuestion({
      callId: "question_1",
      answer: "Manual answer",
      isManual: true,
    });

    expect(host.dispatch).toHaveBeenCalledWith({
      type: "respond-to-question",
      response: {
        callId: "question_1",
        answer: "Manual answer",
        isManual: true,
      },
    });
  });
});
