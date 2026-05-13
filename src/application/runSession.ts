import { RunOrchestrator, RunHandle } from "../lib/runtime/runOrchestrator.js";
import { AgentRun } from "../lib/runtime/agentRun.js";
import { AnyAgentEvent } from "../lib/runtime/events.js";
import { createToolContext, ToolContext } from "../lib/tool/context.js";
import { confirmBus } from "../tui/lib/confirmBus.js";
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
}

export interface RunResult {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle;
  sessionId: string;
}

const _orchestrator = new RunOrchestrator();

export function startRun(config: RunConfig): RunResult {
  const sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const run = new AgentRun(sessionId);
  const childRuns = new Map<string, AgentRun>();

  const abortController = new AbortController();
  run.abortController = abortController;

  const combinedSignal = config.signal
    ? anySignal([config.signal, abortController.signal])
    : abortController.signal;

  const ctx = createToolContext({
    abortSignal: combinedSignal,
    confirmBus,
  });

  const runCtx: RunContext = { ctx, run, childRuns };

  const handle = _orchestrator.startRun(run, {
    messages: config.messages,
    createAgent: () => config.createAgent(runCtx),
    signal: combinedSignal,
    onEvent: config.onEvent,
  });

  return { run, childRuns, handle, sessionId };
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
