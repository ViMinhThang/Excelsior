import { describe, expect, it } from "vitest";
import { emitStreamEvents } from "../src/agent/streamEventMapper.js";
import type { AgentEventEmitter } from "../src/runtime/events.js";
import {
  RUN_END,
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
} from "../src/runtime/eventNames.js";
import type { StreamPart } from "../src/runtime/streamTypes.js";

async function* stream(parts: StreamPart[]): AsyncIterable<unknown> {
  yield* parts;
}

describe("emitStreamEvents", () => {
  it("emits a finite budget warning when a stream ends after a tool result", async () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const emit: AgentEventEmitter = (type, data) => {
      events.push({ type, data });
    };

    await emitStreamEvents({
      fullStream: stream([
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "view",
          input: { path: "README.md" },
        },
        {
          type: "tool-result",
          toolCallId: "call_1",
          output: { type: "text", value: "ok" },
        },
      ]),
      signal: new AbortController().signal,
      emit,
      toolLoopStepLimit: 200,
    });

    expect(events.map((event) => event.type)).toEqual([
      TOOL_CALL_START,
      TOOL_CALL_END,
      TEXT_DELTA,
      RUN_END,
    ]);
    expect(events[2].data).toEqual({
      delta: expect.stringContaining("200-step tool-loop limit"),
    });
  });

  it("does not warn in unlimited mode", async () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const emit: AgentEventEmitter = (type, data) => {
      events.push({ type, data });
    };

    await emitStreamEvents({
      fullStream: stream([
        {
          type: "tool-result",
          toolCallId: "call_1",
          output: { type: "text", value: "ok" },
        },
      ]),
      signal: new AbortController().signal,
      emit,
    });

    expect(events.map((event) => event.type)).toEqual([
      TOOL_CALL_END,
      RUN_END,
    ]);
  });

  it("does not warn when assistant text follows a tool result", async () => {
    const events: Array<{ type: string; data: unknown }> = [];
    const emit: AgentEventEmitter = (type, data) => {
      events.push({ type, data });
    };

    await emitStreamEvents({
      fullStream: stream([
        {
          type: "tool-result",
          toolCallId: "call_1",
          output: { type: "text", value: "ok" },
        },
        { type: "text-delta", text: "done" },
      ]),
      signal: new AbortController().signal,
      emit,
      toolLoopStepLimit: 200,
    });

    expect(events.map((event) => event.type)).toEqual([
      TOOL_CALL_END,
      TEXT_DELTA,
      RUN_END,
    ]);
    expect(events[1].data).toEqual({ delta: "done" });
  });
});
