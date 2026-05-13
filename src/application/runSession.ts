import { RunOrchestrator, RunHandle } from "../lib/runtime/runOrchestrator.js";
import { AgentRun } from "../lib/runtime/agentRun.js";
import { AnyAgentEvent, makeEvent } from "../lib/runtime/events.js";
import { TURN_COMPLETE } from "../lib/runtime/event-names.js";
import { createToolContext, ToolContext } from "../lib/tool/context.js";
import { confirmBus } from "../lib/runtime/confirmBus.js";
import { appendEvent } from "../lib/persistence/rolloutRecorder.js";
import type { ToolLoopAgent } from "ai";

export interface RunContext {
  ctx: ToolContext;
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
}

export interface RunConfig {
  messages: Array<{ role: string; content: string }>;
  createAgent: (runCtx: RunContext) => ToolLoopAgent<any, any>;
  onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void;
  signal?: AbortSignal;
  sessionId?: string;
  workspaceId?: string;
}

export interface RunResult {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle;
  sessionId: string;
}

const orchestrator = new RunOrchestrator();

function mergeSignals(a?: AbortSignal, b?: AbortController): AbortSignal {
  if (!a) return b!.signal;
  const controller = new AbortController();
  if (a.aborted) { controller.abort(a.reason); return controller.signal; }
  a.addEventListener("abort", () => controller.abort(a.reason), { once: true });
  b?.signal.addEventListener("abort", () => controller.abort(b.signal.reason), { once: true });
  return controller.signal;
}

function withCheckpoint(
  handle: RunHandle,
  runId: string,
  sessionId: string,
): RunHandle {
  const wrappedDone = handle.done.then(async (events) => {
    const checkpoint = makeEvent(runId, TURN_COMPLETE, { runId }, events.length + 1);
    await appendEvent(sessionId, checkpoint as AnyAgentEvent);
    return events;
  });
  return { ...handle, done: wrappedDone };
}

export function startRun(config: RunConfig): RunResult {
  const sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const run = new AgentRun(sessionId);
  const childRuns = new Map<string, AgentRun>();

  const abortController = new AbortController();
  run.abortController = abortController;

  const combinedSignal = mergeSignals(config.signal, abortController);

  const ctx = createToolContext({ abortSignal: combinedSignal, confirmBus });
  const runCtx: RunContext = { ctx, run, childRuns };

  const handle = orchestrator.startRun(run, {
    messages: config.messages,
    createAgent: () => config.createAgent(runCtx),
    signal: combinedSignal,
    onEvent: config.onEvent,
    sessionId,
  });

  return { run, childRuns, handle: withCheckpoint(handle, run.id, sessionId), sessionId };
}
