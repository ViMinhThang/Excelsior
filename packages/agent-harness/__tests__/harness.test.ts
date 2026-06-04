import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import {
  createAgentHarness,
  createBuiltInTools,
  type ToolExecutionContext,
} from "@excelsior/agent-harness";
import {
  AGENT_START,
  TOOL_EXECUTION_START,
  TURN_START,
} from "../src/events.js";

const tempDirs: string[] = [];
const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-harness-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  if (originalDeepSeekApiKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("AgentHarness", () => {
  it("starts a fresh session for each harness run in the same workspace", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();

    const firstHarness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    const firstSessionId = firstHarness.getSnapshot().currentSessionId;
    firstHarness.dispose();

    const secondHarness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    const secondState = secondHarness.getSnapshot();
    const secondSessionId = secondState.currentSessionId;

    expect(firstSessionId).toBeTruthy();
    expect(secondSessionId).toBeTruthy();
    expect(secondSessionId).not.toBe(firstSessionId);
    expect(secondState.sessions.map((session) => session.id)).toEqual(
      expect.arrayContaining([firstSessionId, secondSessionId]),
    );
  });

  it("executes core commands and projects session state", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });

    const modeResult = await harness.executeCommand("/mode plan");
    const sessionResult = await harness.executeCommand("/session new Migration Notes");
    const state = harness.getSnapshot();

    expect(modeResult.message).toBe("Mode set to plan.");
    expect(sessionResult.message).toBe('Created session: "Migration Notes".');
    expect(state.mode).toBe("plan");
    expect(state.sessions[0]?.title).toBe("Migration Notes");

    const help = await harness.executeCommand("/help");
    expect(help.message).toContain("/session");
  });

  it("finalizes an active partial tool call immediately on cancel", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    const sessionId = harness.getSnapshot().currentSessionId;
    expect(sessionId).toBeTruthy();

    const store = harness as any;
    const runId = "run_cancel";
    const turnId = "turn_cancel";
    store.activeRunId = runId;
    store.activeTurnId = turnId;
    store.activeSessionId = sessionId;
    store.abortController = new AbortController();
    store.eventBus.emit(runId, AGENT_START, {}, { sessionId, turnId });
    store.eventBus.emit(runId, TURN_START, {}, { sessionId, turnId });
    store.eventBus.emit(runId, TOOL_EXECUTION_START, {
      toolCallId: "call_write",
      toolName: "write",
      toolArgs: "{\"filePath\":\"report.html\",\"content\":\"<html>",
    }, { sessionId, turnId, relatedToolCallId: "call_write" });

    harness.cancel();

    const snapshot = harness.getSnapshot();
    const events = harness.inspectCurrentSession().events;
    const replay = harness.replayCurrentSession();

    expect(snapshot.isLoading).toBe(false);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "tool_execution_end",
        data: expect.objectContaining({
          toolCallId: "call_write",
          isError: true,
        }),
      }),
      expect.objectContaining({
        type: "turn_end",
        data: { cancelled: true },
      }),
      expect.objectContaining({
        type: "agent_end",
        data: { cancelled: true },
      }),
    ]));
    expect(replay.ok).toBe(true);
  });

  it("blocks write-like built-in tools in Plan mode before confirmation", async () => {
    const workspaceRoot = await makeTempDir();
    const confirm = vi.fn();
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "plan",
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const tools = createBuiltInTools();
    const writeFile = tools.find((tool) => tool.name === "writeFile");
    const editFile = tools.find((tool) => tool.name === "editFile");
    const runCommand = tools.find((tool) => tool.name === "runCommand");

    expect(writeFile).toBeDefined();
    expect(editFile).toBeDefined();
    expect(runCommand).toBeDefined();

    const writeResult = await writeFile?.execute({ filePath: "new.txt", content: "x" }, ctx);
    const editResult = await editFile?.execute({ filePath: "new.txt", oldText: "x", newText: "y" }, ctx);
    const runResult = await runCommand?.execute({ command: "mkdir", args: ["new-dir"] }, ctx);

    expect(writeResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(editResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(runResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("propagates causationId and correlationId correctly through events", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });

    // Create session to generate events
    harness.createSession("Causal Test");

    const events = (harness as any).eventStore.events;
    expect(events.length).toBeGreaterThan(0);

    // First event should have empty causationId and correlationId matching runId
    const firstEvent = events[0];
    expect(firstEvent.causationId).toBe("");
    expect(firstEvent.correlationId).toBe(firstEvent.runId);

    // Subsequent events should have causationId chained to the preceding event's ID
    if (events.length > 1) {
      const secondEvent = events[1];
      expect(secondEvent.causationId).toBe(firstEvent.id);
      expect(secondEvent.correlationId).toBe(secondEvent.runId);
    }
  });

  it("executes trace and replay commands without mutating events", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });

    await harness.send({ content: "inspect this", mode: "act" });
    const before = harness.inspectCurrentSession().events;
    const turnId = before.find((event) => event.turnId)?.turnId;

    const trace = await harness.executeCommand("/trace");
    const traceAll = await harness.executeCommand("/trace all");
    const traceTurn = await harness.executeCommand(`/trace ${turnId?.slice(0, 12) ?? ""}`);
    const replay = await harness.executeCommand("/replay");
    const after = harness.inspectCurrentSession().events;

    expect(trace.message).toContain("Trace:");
    expect(trace.message).toContain("Turn");
    expect(traceAll.message).toContain("events=");
    expect(traceTurn.message).toContain(turnId);
    expect(replay.message).toContain("Replay: OK");
    expect(after).toEqual(before);
  });
});
