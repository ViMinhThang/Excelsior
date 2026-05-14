import { describe, expect, it, vi } from "vitest";
import { AgentRun } from "../lib/runtime/agentRun.js";
import type { ToolContext } from "../lib/tool/context.js";
import { createWriteTool } from "../agent/tools/fs/write.js";
import { createEditTool } from "../agent/tools/fs/edit.js";
import { createRunCommandTool } from "../agent/tools/runCommand/runCommand.js";
import type { AnyAgentEvent } from "../lib/runtime/events.js";
import type { RunRecorder } from "../lib/persistence/runRecorder.js";
import { createSubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";

const captured = vi.hoisted(() => ({
  ctx: undefined as ToolContext | undefined,
  signal: undefined as AbortSignal | undefined,
  waitForAbort: false,
  emitText: false,
}));

vi.mock("../agent/agent.js", () => ({
  createAgent: vi.fn((_instructions, _extraTools, ctx) => {
    captured.ctx = ctx;
    return {};
  }),
}));

vi.mock("../lib/runtime/agentStream.js", () => ({
  streamAgentResponse: vi.fn(async (_agent, _messages, run, signal: AbortSignal) => {
    captured.signal = signal;
    if (captured.emitText) {
      run.emit("text-delta", { delta: "child output" });
    }
    if (!captured.waitForAbort) return;
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }),
}));

describe("spawnSubAgent tool safety context", () => {
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
    const { createSpawnSubAgentTool } = await import("../agent/spawn/spawnSubAgent.js");
    const request = vi.fn(async () => false);
    const parentRun = new AgentRun("ses_test");
    const ctx: ToolContext = {
      capabilities: new Set(["fs:read", "fs:write", "shell"]),
      workspaceRoot: process.cwd(),
      confirm: { getListenerCount: () => 1, request },
    };

    const tool = createSpawnSubAgentTool(parentRun, new Map(), "ses_test", ctx);
    await (tool as any).execute({ role: "Reviewer", instruction: "check" }, { toolCallId: "tc1" });

    expect(captured.ctx?.confirm).toBe(ctx.confirm);
    await (createWriteTool(captured.ctx) as any).execute({ filePath: "child.txt", content: "x" });
    await (createEditTool(captured.ctx) as any).execute({ filePath: "child.txt", oldText: "x", newText: "y" });
    await (createRunCommandTool(captured.ctx) as any).execute({ command: "npm", args: ["install"] });

    expect(request).toHaveBeenCalledTimes(3);
  });

  it("aborts the child stream when the parent context aborts", async () => {
    const { createSpawnSubAgentTool } = await import("../agent/spawn/spawnSubAgent.js");
    captured.waitForAbort = true;
    const parentRun = new AgentRun("ses_test");
    const abortController = new AbortController();
    const ctx: ToolContext = {
      capabilities: new Set(["fs:read", "fs:write", "shell"]),
      abortSignal: abortController.signal,
      workspaceRoot: process.cwd(),
    };
    const tool = createSpawnSubAgentTool(parentRun, new Map(), "ses_test", ctx);

    const pending = (tool as any).execute({ role: "Reviewer", instruction: "check" }, { toolCallId: "tc1" });
    abortController.abort();
    await pending;

    expect(captured.signal?.aborted).toBe(true);
    captured.waitForAbort = false;
  });

  it("records child events and notifies only the provided sub-agent sink", async () => {
    const { createSpawnSubAgentTool } = await import("../agent/spawn/spawnSubAgent.js");
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

    const tool = createSpawnSubAgentTool(parentRun, new Map(), "ses_test", ctx, recorder, ownedSink);
    await (tool as any).execute({ role: "Reviewer", instruction: "check" }, { toolCallId: "tc1" });

    expect(events.map((event) => event.type)).toEqual(["text-delta"]);
    expect(ownedOutput).toHaveBeenCalledTimes(1);
    expect(otherOutput).not.toHaveBeenCalled();
    captured.emitText = false;
  });
});
