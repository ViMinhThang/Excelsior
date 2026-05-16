import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  AgentRun,
  createSubAgentEventSink,
  type AnyAgentEvent,
  type RunRecorder,
  type StreamCapableAgent,
} from "@excelsior/agent-host/testing/runtime";
import {
  createEditTool,
  createRunCommandTool,
  createSpawnSubAgentTool,
  createWriteTool,
  executeTool,
  type ToolContext,
} from "@excelsior/agent-host/testing/tools";

const captured = {
  ctx: undefined as ToolContext | undefined,
  signal: undefined as AbortSignal | undefined,
  waitForAbort: false,
  emitText: false,
};

function createSpawnDependencies() {
  const noopAgent: StreamCapableAgent = {
    stream: async () => ({ fullStream: [] }),
  };
  return {
    createAgent: vi.fn((_instructions, _extraTools, ctx) => {
      captured.ctx = ctx;
      return noopAgent;
    }),
    streamAgentResponse: vi.fn(async ({ emit, signal }) => {
      captured.signal = signal;
      if (captured.emitText) {
        emit("text-delta", { delta: "child output" });
      }
      if (!captured.waitForAbort) return;
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    }),
  };
}

describe("spawnSubAgent tool safety context", () => {
  beforeEach(() => {
    captured.ctx = undefined;
    captured.signal = undefined;
    captured.waitForAbort = false;
    captured.emitText = false;
  });

  function fakeRecorder() {
    const events: AnyAgentEvent[] = [];
    const recorder: RunRecorder = {
      async recordEvent(_sessionId, event) {
        events.push(event);
      },
      async recordTurnComplete() {},
      async loadCompletedEvents() {
        return events;
      },
      async loadRawEvents() {
        return events;
      },
      async deleteSessionEvents() {},
      async deleteAllSessionEvents() {},
    };
    return { recorder, events };
  }

  it("passes confirmation context to child agent tools", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-child-"));
    await writeFile(join(workspaceRoot, "child.txt"), "x", "utf-8");
    const request = vi.fn(async () => false);
    const parentRun = new AgentRun("ses_test");
    const ctx: ToolContext = {
      capabilities: new Set(["fs:read", "fs:write", "shell"]),
      workspaceRoot,
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    };

    try {
      const tool = createSpawnSubAgentTool(
        parentRun,
        new Map(),
        "ses_test",
        ctx,
        undefined,
        undefined,
        createSpawnDependencies(),
      );
      await executeTool(tool, { role: "Reviewer", instruction: "check" }, { toolCallId: "tc1" });

      expect(captured.ctx?.confirm).toBe(ctx.confirm);
      await executeTool(createWriteTool(captured.ctx), { filePath: "new-child.txt", content: "x" });
      await executeTool(createEditTool(captured.ctx), {
        filePath: "child.txt",
        oldText: "x",
        newText: "y",
      });
      await executeTool(createRunCommandTool(captured.ctx), { command: "npm", args: ["install"] });

      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("aborts the child stream when the parent context aborts", async () => {
    captured.waitForAbort = true;
    const parentRun = new AgentRun("ses_test");
    const abortController = new AbortController();
    const ctx: ToolContext = {
      capabilities: new Set(["fs:read", "fs:write", "shell"]),
      abortSignal: abortController.signal,
      workspaceRoot: process.cwd(),
    };
    const childRuns = new Map<string, AgentRun>();
    const tool = createSpawnSubAgentTool(
      parentRun,
      childRuns,
      "ses_test",
      ctx,
      undefined,
      undefined,
      createSpawnDependencies(),
    );

    const pending = executeTool(tool, { role: "Reviewer", instruction: "check" }, { toolCallId: "tc1" });
    abortController.abort();
    await pending;

    expect(captured.signal?.aborted).toBe(true);
    expect([...childRuns.values()][0].isCancelled).toBe(true);
    captured.waitForAbort = false;
  });

  it("records child events and notifies only the provided sub-agent sink", async () => {
    captured.emitText = true;
    const parentRun = new AgentRun("ses_test");
    const ctx: ToolContext = {
      capabilities: new Set(["fs:read", "fs:write", "shell"]),
      workspaceRoot: process.cwd(),
    };
    const { recorder, events } = fakeRecorder();
    const ownedSink = createSubAgentEventSink();
    const otherSink = createSubAgentEventSink();
    const ownedOutput = vi.fn();
    const otherOutput = vi.fn();
    ownedSink.on("output", ownedOutput);
    otherSink.on("output", otherOutput);

    const tool = createSpawnSubAgentTool(
      parentRun,
      new Map(),
      "ses_test",
      ctx,
      recorder,
      ownedSink,
      createSpawnDependencies(),
    );
    await executeTool(tool, { role: "Reviewer", instruction: "check" }, { toolCallId: "tc1" });

    expect(events.map((event) => event.type)).toEqual(["text-delta"]);
    expect(ownedOutput).toHaveBeenCalledTimes(1);
    expect(otherOutput).not.toHaveBeenCalled();
    captured.emitText = false;
  });
});
