import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
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
  vi.useRealTimers();
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
  it("does not create a session until the first prompt is sent", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();

    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });

    expect(harness.getSnapshot().currentSessionId).toBeNull();
    expect(harness.getSnapshot().sessions).toEqual([]);

    await harness.send({ content: "hello", mode: "act" });

    expect(harness.getSnapshot().currentSessionId).toBeTruthy();
    expect(harness.getSnapshot().sessions).toHaveLength(1);
  });

  it("starts with no current session (empty history) even if previous sessions exist on disk", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const firstHarness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });

    await firstHarness.send({ content: "remember this", mode: "act" });
    const firstState = firstHarness.getSnapshot();
    const firstSessionId = firstState.currentSessionId;
    firstHarness.dispose();

    const secondHarness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    const secondState = secondHarness.getSnapshot();

    // No auto-reopen: start blank (TUI shows no history). A session is created
    // only when the user types and submits (via ensureSession in send).
    expect(secondState.currentSessionId).toBeNull();
    expect(secondState.sessions.map((session) => session.id)).toEqual([firstSessionId]);
    expect(secondState.displayBlocks).toEqual([]);
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

  it("coalesces rapid event notifications while keeping snapshots flushable", async () => {
    vi.useFakeTimers();
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    harness.createSession("Notify Test");
    const sessionId = harness.getSnapshot().currentSessionId;
    expect(sessionId).toBeTruthy();
    const listener = vi.fn();
    harness.subscribe(listener);

    const store = harness as any;
    store.eventBus.emit("run_notify", AGENT_START, {}, { sessionId, turnId: "turn_notify" });
    store.eventBus.emit("run_notify", TURN_START, {}, { sessionId, turnId: "turn_notify" });
    store.eventBus.emit("run_notify", TOOL_EXECUTION_START, {
      toolCallId: "call_notify",
      toolName: "view",
      toolArgs: "{\"filePath\":\"package.json\"}",
    }, { sessionId, turnId: "turn_notify", relatedToolCallId: "call_notify" });

    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(listener).toHaveBeenCalledTimes(1);

    store.eventBus.emit("run_notify", TOOL_EXECUTION_START, {
      toolCallId: "call_notify_2",
      toolName: "view",
      toolArgs: "{\"filePath\":\"packages/core/package.json\"}",
    }, { sessionId, turnId: "turn_notify", relatedToolCallId: "call_notify_2" });

    expect(harness.getSnapshot().displayBlocks).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("persists streaming message deltas without repeated session headers", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();
    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    harness.createSession("Storage Test");
    const sessionId = harness.getSnapshot().currentSessionId;
    expect(sessionId).toBeTruthy();

    const store = harness as any;
    const runId = "run_storage";
    const turnId = "turn_storage";
    const message = { id: "msg_storage", role: "assistant" as const, content: "" };
    store.eventBus.emit(runId, MESSAGE_START, { message }, { sessionId, turnId });
    store.eventBus.emit(runId, MESSAGE_UPDATE, {
      messageId: message.id,
      role: "assistant",
      delta: "Hello ",
    }, { sessionId, turnId });
    store.eventBus.emit(runId, MESSAGE_UPDATE, {
      messageId: message.id,
      role: "assistant",
      delta: "world",
    }, { sessionId, turnId });
    store.eventBus.emit(runId, MESSAGE_END, {
      message: { ...message, content: "Hello world" },
    }, { sessionId, turnId });

    const raw = await readFile(join(dataDir, "sessions", "ws_test", `${sessionId}.jsonl`), "utf-8");
    const records = raw.trim().split(/\r?\n/).map((line) => JSON.parse(line) as any);
    const sessionRecords = records.filter((record) => record.kind === "session");
    const messageUpdates = records
      .filter((record) => record.kind === "event")
      .map((record) => record.event)
      .filter((event) => event.type === MESSAGE_UPDATE);

    expect(sessionRecords).toHaveLength(1);
    expect(messageUpdates).toHaveLength(2);
    expect(messageUpdates.every((event) => !("content" in event.data))).toBe(true);
    expect(harness.getSnapshot().displayBlocks).toMatchObject([
      { type: "assistant", content: "Hello world" },
    ]);
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

  it("reverts file modifications and creations when reverting a turn", async () => {
    const dataDir = await makeTempDir();
    const workspaceRoot = await makeTempDir();

    const existingFile = join(workspaceRoot, "existing.txt");
    await writeFile(existingFile, "original content", "utf-8");

    const harness = createAgentHarness({ dataDir, workspaceRoot, workspaceId: "ws_test" });
    const sessionId = "ses_test";
    const turnId = "turn_test";

    // Mock ToolExecutionContext
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      confirm: async () => ({ callId: "1", approved: true }),
      askQuestion: async () => ({ callId: "1", answer: "", isManual: true, cancelled: true }),
      sendSubAgent: async () => "",
      backupDir: join(dataDir, "backups", "ws_test", sessionId, turnId),
    };

    const tools = createBuiltInTools();
    const writeFileTool = tools.find((tool) => tool.name === "writeFile")!;

    // Modify existing file
    await writeFileTool.execute({ filePath: "existing.txt", content: "modified content" }, ctx);

    // Create new file
    await writeFileTool.execute({ filePath: "new.txt", content: "new content" }, ctx);

    // Verify files were written
    expect(await readFile(existingFile, "utf-8")).toBe("modified content");
    expect(await readFile(join(workspaceRoot, "new.txt"), "utf-8")).toBe("new content");

    // Perform restore backups
    await (harness as any).restoreBackups(sessionId, turnId);

    // Verify files were reverted
    expect(await readFile(existingFile, "utf-8")).toBe("original content");
    expect(existsSync(join(workspaceRoot, "new.txt"))).toBe(false);
  });
});
