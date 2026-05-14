import { describe, expect, it, vi } from "vitest";
import type { AnyAgentEvent } from "../lib/runtime/events.js";
import type { RunRecorder } from "../lib/persistence/runRecorder.js";

vi.mock("../lib/runtime/agentStream.js", () => ({
  streamAgentResponse: vi.fn(async (_agent, _messages, run) => {
    run.emit("text-delta", { delta: "hello" });
  }),
}));

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
    async deleteSessionEvents() {},
    async deleteAllSessionEvents() {},
  };
  return { recorder, events, checkpoints };
}

describe("run recorder integration", () => {
  it("records parent run events and checkpoint through RunRecorder", async () => {
    const { startRun } = await import("../application/runSession.js");
    const { recorder, events, checkpoints } = fakeRecorder();

    const result = startRun({
      sessionId: "ses_test",
      messages: [{ role: "user", content: "hello" }],
      createAgent: () => ({} as any),
      recorder,
    });

    await result.handle.done;

    expect(events.map((event) => event.type)).toEqual(["text-delta"]);
    expect(checkpoints).toEqual([
      { sessionId: "ses_test", runId: result.run.id, sequence: 2 },
    ]);
  });
});
