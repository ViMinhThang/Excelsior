import { RunOrchestrator, RunHandle } from "../lib/runtime/runOrchestrator.js";
import { AgentRun } from "../lib/runtime/agentRun.js";
import { AnyAgentEvent } from "../lib/runtime/events.js";
import { createToolContext, ToolContext } from "../lib/tool/context.js";
import type { AgentMode } from "../lib/runtime/agentMode.js";
import { confirmBus } from "../lib/runtime/confirmBus.js";
import { defaultRunRecorder, RunRecorder } from "../lib/persistence/runRecorder.js";
import { createSubAgentEventSink, SubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import type { ToolLoopAgent } from "ai";

export interface RunContext {
  ctx: ToolContext;
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  recorder: RunRecorder;
  subAgentEvents: SubAgentEventSink;
}

export interface RunConfig {
  messages: Array<{ role: string; content: string }>;
  createAgent: (runCtx: RunContext) => ToolLoopAgent<any, any>;
  onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void;
  signal?: AbortSignal;
  sessionId?: string;
  workspaceId?: string;
  recorder?: RunRecorder;
  subAgentEvents?: SubAgentEventSink;
  mode?: AgentMode;
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

export function startRun(config: RunConfig): RunResult {
  const sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const run = new AgentRun(sessionId);
  const childRuns = new Map<string, AgentRun>();
  const recorder = config.recorder ?? defaultRunRecorder;
  const subAgentEvents = config.subAgentEvents ?? createSubAgentEventSink();

  const abortController = new AbortController();
  run.abortController = abortController;

  const combinedSignal = mergeSignals(config.signal, abortController);

  const ctx = createToolContext({ abortSignal: combinedSignal, confirmBus, mode: config.mode });
  const runCtx: RunContext = { ctx, run, childRuns, recorder, subAgentEvents };

  const handle = orchestrator.startRun(run, {
    messages: config.messages,
    createAgent: () => config.createAgent(runCtx),
    signal: combinedSignal,
    onEvent: config.onEvent,
    sessionId,
    recorder,
  });

  const checkpointedHandle: RunHandle = {
    ...handle,
    done: handle.done.then(async (events) => {
      await recorder.recordTurnComplete(sessionId, run.id, events.length + 1);
      return events;
    }),
  };

  return { run, childRuns, handle: checkpointedHandle, sessionId };
}
