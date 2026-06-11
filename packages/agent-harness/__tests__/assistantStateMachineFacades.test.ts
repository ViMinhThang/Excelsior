import { describe, expect, it } from "vitest";
import { Projector } from "../src/projector/Projector.js";
import { RunEventWriter } from "../src/context/RunEventWriter.js";
import {
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
  type HarnessEventType,
} from "../src/events.js";

function event<T extends HarnessEventType>(
  sequence: number,
  type: T,
  data: HarnessEventDataMap[T],
): AnyHarnessEvent {
  return makeHarnessEvent({
    workspaceId: "ws_test",
    sessionId: "ses_test",
    runId: "run_test",
    turnId: "turn_test",
    sequence,
    type,
    data,
  }) as AnyHarnessEvent;
}

function createEmitter(): { emitted: AnyHarnessEvent[]; emit: HarnessEventEmitter } {
  const emitted: AnyHarnessEvent[] = [];
  let sequence = 0;
  const emit: HarnessEventEmitter = (type, data, options) => {
    const emittedEvent = makeHarnessEvent({
      workspaceId: "ws_test",
      sessionId: "ses_test",
      runId: "run_test",
      turnId: options?.turnId ?? "turn_test",
      sequence: ++sequence,
      type,
      data,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
      causationId: options?.causationId,
      correlationId: options?.correlationId,
    });
    emitted.push(emittedEvent as AnyHarnessEvent);
    return emittedEvent;
  };
  return { emitted, emit };
}

describe("assistant state machine facades", () => {
  it("lets projector replay and read without exposing active-stream methods", () => {
    const projector = new Projector();

    const events = [
      event(1, MESSAGE_END, {
        message: { id: "msg_user", role: "user", content: "hello", modelContent: "hello model" },
      }),
    ];
    projector.project(events);

    expect(projector.project(events)).toMatchObject({
      turns: [{ id: "turn_test", status: "in-progress", blocks: [{ type: "user", content: "hello", isFrozen: true }] }],
      aiHistory: [{ role: "user", content: "hello model" }],
    });
    for (const method of [
      "startMessage",
      "updateMessage",
      "endMessage",
      "startTool",
      "updateToolInput",
      "endToolInput",
      "completeTool",
      "flushAllToolUpdates",
      "finalizeIncompleteTools",
      "emitNotice",
    ]) {
      expect(method in projector).toBe(false);
    }
  });

  it("lets active runs stream and emit without exposing projection replay/read methods", () => {
    const { emitted, emit } = createEmitter();
    const writer = new RunEventWriter(emit);

    writer.startMessage("msg_run");
    writer.updateMessage("msg_run", "hello");
    writer.endMessage("msg_run");

    expect(emitted).toMatchObject([
      { type: MESSAGE_START, data: { message: { id: "msg_run", role: "assistant", content: "" } } },
      { type: MESSAGE_UPDATE, data: { messageId: "msg_run", role: "assistant", delta: "hello" } },
      { type: MESSAGE_END, data: { message: { id: "msg_run", role: "assistant", content: "hello" } } },
    ]);
    expect("project" in writer).toBe(false);
    expect("reset" in writer).toBe(false);
  });
});
