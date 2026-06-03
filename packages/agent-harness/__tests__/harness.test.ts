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

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-harness-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("AgentHarness", () => {
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

    const events = (harness as any).events;
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
});
