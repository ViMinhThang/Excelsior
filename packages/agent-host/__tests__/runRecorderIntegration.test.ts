import { describe, expect, it } from "vitest";
import {
  PERSISTENCE_ERROR,
  streamAgentResponse,
  type AgentEventEmitter,
  type AgentResponseStreamer,
  type AnyAgentEvent,
  type RunRecorder,
  type StreamCapableAgent,
} from "@excelsior/agent-host/testing/runtime";

const streamTextDelta: AgentResponseStreamer = async ({ emit }) => {
  emit("text-delta", { delta: "hello" });
};

async function* streamParts(parts: readonly unknown[]): AsyncIterable<unknown> {
  for (const part of parts) yield part;
}

const noopAgent: StreamCapableAgent = {
  stream: async () => ({ fullStream: streamParts([]) }),
};

function fakeRecorder() {
  const events: AnyAgentEvent[] = [];
  const checkpoints: Array<{ sessionId: string; runId: string; sequence: number }> = [];
  const recorder: RunRecorder = {
    async recordEvent(_sessionId, event) {
      events.push(event);
    },
    async recordTurnComplete(sessionId, runId, sequence) {
      checkpoints.push({ sessionId, runId, sequence });
    },
    async loadCompletedEvents() {
      return events;
    },
    async loadRawEvents() {
      return events;
    },
    async getLastCompletedTurn() {
      return null;
    },
    async dropLastCompletedTurn() {
      return { dropped: false, removedEvents: 0, reason: "no-completed-turn" };
    },
    async deleteSessionEvents() {},
    async deleteAllSessionEvents() {},
  };
  return { recorder, events, checkpoints };
}

describe("run recorder integration", () => {
  it("records parent run events and checkpoint through RunRecorder", async () => {
    const { createRunSession } = await import("@excelsior/agent-host/testing/runtime");
    const { recorder, events, checkpoints } = fakeRecorder();

    const result = createRunSession({
      sessionId: "ses_test",
      messages: [{ role: "user", content: "hello" }],
      createAgent: () => noopAgent,
      recorder,
      streamAgentResponse: streamTextDelta,
    });

    await result.handle.completion;

    expect(events.map((event) => event.type)).toEqual(["text-delta"]);
    expect(checkpoints).toEqual([
      { sessionId: "ses_test", runId: result.run.id, sequence: 1 },
    ]);
  });

  it("streams through a minimal event sink without requiring AgentRun", async () => {
    const emitted: Array<{ type: string; data: unknown; relatedToolCallId?: string }> = [];
    const agent: StreamCapableAgent = {
      stream: async () => ({
        fullStream: streamParts([
          { type: "text-delta", text: "hello" },
          { type: "tool-call", toolCallId: "tc1", toolName: "view", input: { filePath: "README.md" } },
          { type: "tool-result", toolCallId: "tc1", output: { type: "text", value: "ok" } },
        ]),
      }),
    };

    await streamAgentResponse({
      agent,
      messages: [],
      signal: new AbortController().signal,
      emit: ((type, data, overrides) => {
        emitted.push({ type, data, relatedToolCallId: overrides?.relatedToolCallId });
      }) as AgentEventEmitter,
    });

    expect(emitted.map((event) => event.type)).toEqual([
      "run-start",
      "text-delta",
      "tool-call-start",
      "tool-call-end",
      "run-end",
    ]);
    expect(emitted[2]).toMatchObject({ relatedToolCallId: "tc1" });
  });

  it("surfaces recorder failures as non-recorded persistence errors", async () => {
    const { createRunSession } = await import("@excelsior/agent-host/testing/runtime");
    let recordAttempts = 0;
    const recorder: RunRecorder = {
      async recordEvent() {
        recordAttempts++;
        throw new Error("disk full");
      },
      async recordTurnComplete() {},
      async loadCompletedEvents() {
        return [];
      },
      async loadRawEvents() {
        return [];
      },
      async getLastCompletedTurn() {
        return null;
      },
      async dropLastCompletedTurn() {
        return { dropped: false, removedEvents: 0, reason: "no-completed-turn" };
      },
      async deleteSessionEvents() {},
      async deleteAllSessionEvents() {},
    };

    const result = createRunSession({
      sessionId: "ses_test",
      messages: [{ role: "user", content: "hello" }],
      createAgent: () => noopAgent,
      recorder,
      streamAgentResponse: streamTextDelta,
    });

    const completion = await result.handle.completion;
    const snapshot = result.run.getSnapshot();

    expect(snapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: PERSISTENCE_ERROR,
          data: {
            message: "Failed to persist run event: disk full",
            failedEventType: "text-delta",
          },
        }),
      ]),
    );
    expect(completion.events.map((event) => event.type)).toEqual(["text-delta"]);
    expect(recordAttempts).toBe(1);
  });

  it("keeps execution failures as generic error events", async () => {
    const { createRunSession } = await import("@excelsior/agent-host/testing/runtime");
    const { recorder, events } = fakeRecorder();

    const result = createRunSession({
      sessionId: "ses_test",
      messages: [{ role: "user", content: "hello" }],
      createAgent: () => noopAgent,
      recorder,
      streamAgentResponse: async () => {
        throw new Error("model exploded");
      },
    });

    await result.handle.completion;

    expect(result.run.getSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          data: { message: "model exploded" },
        }),
      ]),
    );
    expect(events.map((event) => event.type)).toEqual(["error"]);
  });
});
