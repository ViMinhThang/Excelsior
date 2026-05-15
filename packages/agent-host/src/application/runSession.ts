import { RunOrchestrator, RunHandle } from "../lib/runtime/runOrchestrator.js";
import { AgentRun } from "./../lib/runtime/agentRun.js";
import { AnyAgentEvent } from "../lib/runtime/events.js";
import { createToolContext, ToolContext } from "../lib/tool/context.js";
import type { AgentMode, AgentMessage } from "@excelsior/core";
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

export interface RunSessionConfig {
  messages: AgentMessage[];
  createAgent: (runCtx: RunContext) => ToolLoopAgent<any, any>;
  onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void;
  signal?: AbortSignal;
  sessionId?: string;
  workspaceId?: string;
  recorder?: RunRecorder;
  subAgentEvents?: SubAgentEventSink;
  mode?: AgentMode;
}

export interface RunSessionResult {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle;
  sessionId: string;
}

const orchestrator = new RunOrchestrator();

export function createRunSession(config: RunSessionConfig): RunSessionResult {
  const sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const run = new AgentRun(sessionId, undefined, undefined, config.signal);
  const childRuns = new Map<string, AgentRun>();
  const recorder = config.recorder ?? defaultRunRecorder;
  const subAgentEvents = config.subAgentEvents ?? createSubAgentEventSink();

  const ctx = createToolContext({ abortSignal: run.abortSignal, confirmBus, mode: config.mode });
  const runCtx: RunContext = { ctx, run, childRuns, recorder, subAgentEvents };

  const handle = orchestrator.startRun(run, {
    messages: config.messages,
    createAgent: () => config.createAgent(runCtx),
    signal: run.abortSignal,
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
