import { describe, expect, it, vi } from "vitest";
import type { AgentHost, AgentHostDispatchResult } from "@excelsior/client";
import {
  commandResultOrDefault,
  createHostSession,
  executeHostCommand,
  getHostCommands,
  modeResultOrUndefined,
  sessionResultOrUndefined,
  toggleHostMode,
} from "@excelsior/client";

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

describe("@excelsior/client host helpers", () => {
  it("unwraps dispatch result variants", () => {
    const session = {
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: { userInput: "" },
      workspaceId: "ws_test",
    };

    expect(commandResultOrDefault({ type: "none" })).toEqual({ handled: false });
    expect(commandResultOrDefault({
      type: "command-result",
      result: { handled: true, message: "ok" },
    })).toEqual({ handled: true, message: "ok" });
    expect(sessionResultOrUndefined({ type: "session", session })).toBe(session);
    expect(modeResultOrUndefined({ type: "mode", mode: "act" })).toBe("act");
  });

  it("normalizes host commands, sessions, and modes", async () => {
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

    expect(getHostCommands(commandHost)).toEqual([
      { name: "help", description: "List commands" },
    ]);
    await expect(executeHostCommand(commandHost, "/help")).resolves.toEqual({
      handled: true,
    });
    await expect(createHostSession(sessionHost, "Draft")).resolves.toBe(session);
    await expect(toggleHostMode(modeHost)).resolves.toBe("act");
  });
});
