import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage, Session } from "@excelsior/core";
import {
  ChatService,
  type ChatServiceDependencies,
} from "@excelsior/agent-host/testing/application";
import type { RunSessionConfig } from "@excelsior/agent-host/testing/runtime";

type CreateRunSession = NonNullable<
  ChatServiceDependencies["createRunSession"]
>;

const configs: RunSessionConfig[] = [];
const emittedUserInputs: unknown[] = [];
const createRunSession = vi.fn((config: RunSessionConfig) => {
  configs.push(config);
  const sessionId = config.sessionId ?? "ses_mock";

  return {
    run: {
      id: "run_mock",
      sessionId,
      emit: vi.fn((_type: string, data: unknown) => {
        emittedUserInputs.push(data);
      }),
      subscribe: vi.fn(() => () => {}),
      getSnapshot: vi.fn(() => []),
    },
    childRuns: new Map(),
    handle: {
      completion: new Promise(() => {}),
      cancel: vi.fn(),
    },
    sessionId,
  } as unknown as ReturnType<CreateRunSession>;
});

function makeHistory(count: number): AgentMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `history ${index + 1}`,
  }));
}

describe("ChatService context assembly", () => {
  beforeEach(() => {
    configs.length = 0;
    emittedUserInputs.length = 0;
    createRunSession.mockClear();
  });

  it("passes compacted context to run sessions while preserving metadata and run options", () => {
    const persistedSessions: Session[] = [];
    const service = new ChatService(
      {
        persist: (session) => persistedSessions.push(session),
      },
      {
        createRunSession,
      },
    );
    const subAgentEvents = {
      emit: vi.fn(),
      on: vi.fn(() => () => {}),
    } as RunSessionConfig["subAgentEvents"];
    const fileCheckpoint = {} as NonNullable<
      RunSessionConfig["fileCheckpoint"]
    >;

    const result = service.submitUserTurn("current exact", {
      history: { current: makeHistory(18) },
      sessionId: "ses_test",
      workspaceId: "ws_test",
      workspaceRoot: "C:\\workspace",
      subAgentEvents,
      displayContent: "Displayed request",
      mode: "act",
      fileCheckpoint,
    });

    const config = configs[0];
    expect(result.sessionId).toBe("ses_test");
    expect(config.messages).toHaveLength(18);
    expect(config.messages[0]).toMatchObject({ role: "system" });
    expect(config.messages[0].content).toContain("history 1");
    expect(config.messages[1]).toEqual({ role: "user", content: "history 3" });
    expect(config.messages.at(-1)).toEqual({
      role: "user",
      content: "current exact",
    });
    expect(config.mode).toBe("act");
    expect(config.workspaceRoot).toBe("C:\\workspace");
    expect(config.subAgentEvents).toBe(subAgentEvents);
    expect(config.fileCheckpoint).toBe(fileCheckpoint);
    expect(persistedSessions[0]).toMatchObject({
      id: "ses_test",
      workspaceId: "ws_test",
      metadata: { userInput: "Displayed request" },
    });
    expect(emittedUserInputs).toEqual([{ content: "Displayed request" }]);
  });
});
