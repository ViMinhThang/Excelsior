import { describe, expect, it } from "vitest";
import { ActiveRunManager, type ActiveRunIdentity } from "../src/activeRun.js";
import {
  AGENT_END,
  makeHarnessEvent,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TURN_END,
  TURN_START,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
  type HarnessEventType,
} from "../src/events.js";

function event<T extends HarnessEventType>(
  identity: ActiveRunIdentity,
  sequence: number,
  type: T,
  data: HarnessEventDataMap[T],
): AnyHarnessEvent {
  return makeHarnessEvent({
    workspaceId: "ws_test",
    sessionId: identity.sessionId,
    runId: identity.runId,
    turnId: identity.turnId,
    sequence,
    type,
    data,
  }) as AnyHarnessEvent;
}

function createCapturingEmitter(identity: ActiveRunIdentity): {
  emitted: AnyHarnessEvent[];
  emit: HarnessEventEmitter;
} {
  const emitted: AnyHarnessEvent[] = [];
  let sequence = 100;
  const emit: HarnessEventEmitter = (type, data, options) => {
    const harnessEvent = makeHarnessEvent({
      workspaceId: "ws_test",
      sessionId: identity.sessionId,
      runId: identity.runId,
      turnId: options?.turnId ?? identity.turnId,
      sequence: ++sequence,
      type,
      data,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
      causationId: options?.causationId,
      correlationId: options?.correlationId,
    });
    emitted.push(harnessEvent as AnyHarnessEvent);
    return harnessEvent;
  };

  return { emitted, emit };
}

describe("ActiveRunManager", () => {
  it("begins an active run with identity and loading state", () => {
    const activeRun = new ActiveRunManager();

    const handle = activeRun.begin({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "session_1",
    });

    expect(activeRun.isActive()).toBe(true);
    expect(activeRun.isLoading()).toBe(true);
    expect(activeRun.currentIdentity()).toEqual({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "session_1",
    });
    expect(activeRun.currentSignal()).toBe(handle.signal);
  });

  it("finishes only the matching handle and ignores stale handles", () => {
    const activeRun = new ActiveRunManager();
    const stale = activeRun.begin({
      runId: "run_stale",
      turnId: "turn_stale",
      sessionId: "session_1",
    });
    const current = activeRun.begin({
      runId: "run_current",
      turnId: "turn_current",
      sessionId: "session_1",
    });

    activeRun.finish(stale);

    expect(activeRun.isLoading()).toBe(true);
    expect(activeRun.currentIdentity()).toEqual({
      runId: "run_current",
      turnId: "turn_current",
      sessionId: "session_1",
    });

    activeRun.finish(current);

    expect(activeRun.isLoading()).toBe(false);
    expect(activeRun.currentIdentity()).toBeNull();
  });

  it("accepts valid steering, rejects blank or wrong-session input, and drains once", () => {
    const activeRun = new ActiveRunManager();
    activeRun.begin({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "session_1",
    });

    expect(activeRun.acceptSteering({ content: "   " })).toBeNull();
    expect(activeRun.acceptSteering({ content: "wrong", sessionId: "session_2" })).toBeNull();
    expect(activeRun.acceptSteering({ content: "  keep going  " })).toEqual({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "session_1",
      content: "keep going",
    });
    expect(activeRun.acceptSteering({ content: "same session", sessionId: "session_1" })).toEqual({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "session_1",
      content: "same session",
    });

    expect(activeRun.drainSteeringMessages()).toEqual(["keep going", "same session"]);
    expect(activeRun.drainSteeringMessages()).toEqual([]);
  });

  it("aborts and clears the active handle", () => {
    const activeRun = new ActiveRunManager();
    const handle = activeRun.begin({
      runId: "run_1",
      turnId: "turn_1",
      sessionId: "session_1",
    });

    expect(activeRun.abort()).toBe(handle);
    expect(handle.signal.aborted).toBe(true);

    activeRun.clear(handle);

    expect(activeRun.isLoading()).toBe(false);
    expect(activeRun.currentIdentity()).toBeNull();
  });

  it("finalizes cancelled open messages, tools, and turns through the run finalizer", () => {
    const activeRun = new ActiveRunManager();
    const handle = activeRun.begin({
      runId: "run_cancel",
      turnId: "turn_cancel",
      sessionId: "session_1",
    });
    const identity = activeRun.currentIdentity();
    expect(identity).not.toBeNull();
    const activeIdentity = identity as ActiveRunIdentity;
    const events = [
      event(activeIdentity, 1, TURN_START, {}),
      event(activeIdentity, 2, MESSAGE_START, {
        message: { id: "msg_1", role: "assistant", content: "Partial" },
      }),
      event(activeIdentity, 3, MESSAGE_UPDATE, {
        messageId: "msg_1",
        role: "assistant",
        delta: " response",
      }),
      event(activeIdentity, 4, TOOL_EXECUTION_START, {
        toolCallId: "call_write",
        toolName: "write",
        toolArgs: "{\"filePath\":\"report.html\"",
      }),
      event(activeIdentity, 5, TOOL_EXECUTION_UPDATE, {
        toolCallId: "call_write",
        toolName: "write",
        delta: ",\"content\":\"draft",
      }),
    ];
    const { emitted, emit } = createCapturingEmitter(activeIdentity);

    activeRun.finalizeCancelled(handle, events, emit, "Cancelled by user.");

    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: MESSAGE_END,
        data: {
          message: {
            id: "msg_1",
            role: "assistant",
            content: "Partial response",
            isError: true,
          },
        },
      }),
      expect.objectContaining({
        type: TOOL_EXECUTION_END,
        data: expect.objectContaining({
          toolCallId: "call_write",
          toolName: "write",
          toolArgs: "{\"filePath\":\"report.html\",\"content\":\"draft",
          result: "Cancelled by user. Tool input did not complete.",
          isError: true,
        }),
        relatedToolCallId: "call_write",
      }),
      expect.objectContaining({
        type: TURN_END,
        data: { cancelled: true },
      }),
      expect.objectContaining({
        type: AGENT_END,
        data: { cancelled: true },
      }),
    ]));
    expect(activeRun.isRunFinalized("run_cancel")).toBe(true);

    activeRun.clear(handle);

    expect(activeRun.isLoading()).toBe(false);
    expect(activeRun.isRunFinalized("run_cancel")).toBe(true);

    activeRun.finish(handle);

    expect(activeRun.isRunFinalized("run_cancel")).toBe(false);
  });
});
