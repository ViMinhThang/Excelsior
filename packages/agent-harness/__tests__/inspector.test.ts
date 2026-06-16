import { describe, expect, it } from "vitest";
import type { Session, Workspace } from "@excelsior/core";
import {
  ERROR,
  MESSAGE_END,
  MESSAGE_START,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TURN_END,
  TURN_START,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventType,
} from "../src/events.js";
import {
  formatHarnessTrace,
  replayHarnessEvents,
  type HarnessInspectionSnapshot,
} from "@excelsior/agent-harness";
import { projectHarnessState } from "../src/projection.js";

const workspace: Workspace = {
  id: "ws_test",
  name: "Test",
  rootPath: "C:/repo",
};

const session: Session = {
  id: "ses_test",
  startedAt: "2026-06-04T00:00:00.000Z",
  updatedAt: "2026-06-04T00:00:00.000Z",
  metadata: { userInput: "" },
  workspaceId: workspace.id,
  title: "Trace Test",
};

function event<T extends HarnessEventType>(
  sequence: number,
  type: T,
  data: HarnessEventDataMap[T],
  options: { turnId?: string; runId?: string; workspaceId?: string; sessionId?: string } = {},
): AnyHarnessEvent {
  return makeHarnessEvent({
    workspaceId: options.workspaceId ?? workspace.id,
    sessionId: options.sessionId ?? session.id,
    runId: options.runId ?? "run_1",
    turnId: options.turnId ?? "turn_alpha",
    sequence,
    type,
    data,
  }) as AnyHarnessEvent;
}

function inspection(events: AnyHarnessEvent[], isLoading = false): HarnessInspectionSnapshot {
  return {
    session,
    events,
    snapshot: projectHarnessState({
      events,
      isLoading,
      sessions: [session],
      currentSessionId: session.id,
      workspace,
      llm: { providerName: "DeepSeek", modelName: "deepseek-v4-flash" },
      mode: "act",
      pendingConfirmation: null,
      pendingQuestion: null,
      reflection: {
        status: "idle",
        memoryRoot: "",
        lastRunAt: undefined,
        lastSummary: undefined,
        touchedFiles: [],
      },
    }),
  };
}

function cleanTurn(turnId = "turn_alpha", startSequence = 1): AnyHarnessEvent[] {
  return [
    event(startSequence, TURN_START, {}, { turnId }),
    event(startSequence + 1, MESSAGE_END, {
      message: { id: `msg_${turnId}`, role: "user", content: `hello ${turnId}` },
    }, { turnId }),
    event(startSequence + 2, TOOL_EXECUTION_START, {
      toolCallId: `tool_${turnId}`,
      toolName: "runCommand",
      toolArgs: "{\"command\":\"npm\"}",
    }, { turnId }),
    event(startSequence + 3, TOOL_EXECUTION_END, {
      toolCallId: `tool_${turnId}`,
      toolName: "runCommand",
      toolArgs: "{\"command\":\"npm\"}",
      result: "ok",
      isError: false,
    }, { turnId }),
    event(startSequence + 4, TURN_END, { cancelled: false }, { turnId }),
  ];
}

describe("harness inspector", () => {
  it("formats the latest turn trace", () => {
    const output = formatHarnessTrace(inspection(cleanTurn()));

    expect(output).toContain("Trace: Trace Test");
    expect(output).toContain("Turn turn_alpha");
    expect(output).toContain("tool_execution_start runCommand");
    expect(output).toContain("status=complete");
  });

  it("formats all turns compactly and supports turn prefix matching", () => {
    const events = [
      ...cleanTurn("turn_alpha", 1),
      ...cleanTurn("turn_beta", 6),
    ];

    const all = formatHarnessTrace(inspection(events), { mode: "all" });
    const beta = formatHarnessTrace(inspection(events), { mode: "turn", turnIdPrefix: "turn_beta" });

    expect(all).toContain("turn_alpha");
    expect(all).toContain("turn_beta");
    expect(beta).toContain("Turn turn_beta");
    expect(beta).not.toContain("Turn turn_alpha");
  });

  it("handles empty sessions and caps long output", () => {
    const empty = formatHarnessTrace(inspection([]));
    const capped = formatHarnessTrace(inspection(cleanTurn()), { maxChars: 80 });

    expect(empty).toContain("No events in current session");
    expect(capped).toContain("trace output truncated");
  });

  it("validates a clean replay", () => {
    const report = replayHarnessEvents(inspection(cleanTurn()));

    expect(report.ok).toBe(true);
    expect(report.partial).toBe(false);
    expect(report.eventCount).toBe(5);
    expect(report.turnCount).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it("detects duplicate IDs, sequence gaps, wrong ownership, and projection mismatch", () => {
    const first = event(1, ERROR, { message: "first" });
    const duplicate = {
      ...event(3, ERROR, { message: "second" }, { workspaceId: "ws_wrong", sessionId: "ses_wrong" }),
      id: first.id,
    };
    const snapshot = inspection([first, duplicate]);
    snapshot.snapshot = { ...snapshot.snapshot, turns: [] };

    const report = replayHarnessEvents(snapshot);

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate event id"),
        expect.stringContaining("Sequence gap"),
        expect.stringContaining("Wrong workspace"),
        expect.stringContaining("Wrong session"),
        expect.stringContaining("Projection mismatch"),
      ]),
    );
  });

  it("reports unbalanced active runs as partial", () => {
    const events = [
      event(1, TURN_START, {}),
      event(2, MESSAGE_START, {
        message: { id: "msg_assistant", role: "assistant", content: "" },
      }),
      event(3, TOOL_EXECUTION_START, {
        toolCallId: "tool_open",
        toolName: "runCommand",
        toolArgs: "{}",
      }),
    ];

    const report = replayHarnessEvents(inspection(events, true));

    expect(report.ok).toBe(true);
    expect(report.partial).toBe(true);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Partial: Missing turn_end"),
        expect.stringContaining("Partial: Missing tool_execution_end"),
        expect.stringContaining("Partial: Missing assistant message_end"),
      ]),
    );
  });
});
