import { RunOrchestrator, type RunHandle } from "@excelsior/run-runtime";
import { AgentRun } from "../lib/runtime/agentRun.js";
import { AgentEventDataMap, AnyAgentEvent } from "../lib/runtime/events.js";
import { createToolContext, ToolContext } from "../lib/tool/context.js";
import type { AgentMode, AgentMessage } from "@excelsior/core";
import { confirmBus } from "../lib/runtime/confirmBus.js";
import { defaultRunRecorder, RunRecorder } from "../lib/persistence/runRecorder.js";
import { createSubAgentEventSink, SubAgentEventSink } from "../lib/runtime/subAgentEventSink.js";
import { ERROR, PERSISTENCE_ERROR, RUN_START } from "../lib/runtime/eventNames.js";
import {
  streamAgentResponse as defaultStreamAgentResponse,
  type StreamCapableAgent,
} from "../lib/runtime/agentStream.js";
import type { FileCheckpoint } from "../lib/revert/fileCheckpoint.js";

export type AgentResponseStreamer = typeof defaultStreamAgentResponse;

export interface RunContext {
  ctx: ToolContext;
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  recorder: RunRecorder;
  subAgentEvents: SubAgentEventSink;
}

export interface RunSessionConfig {
  messages: AgentMessage[];
  createAgent: (runCtx: RunContext) => StreamCapableAgent;
  signal?: AbortSignal;
  sessionId?: string;
  recorder?: RunRecorder;
  subAgentEvents?: SubAgentEventSink;
  mode?: AgentMode;
  workspaceRoot?: string;
  streamAgentResponse?: AgentResponseStreamer;
  fileCheckpoint?: FileCheckpoint;
}

export interface RunSessionResult {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle<AgentEventDataMap>;
  sessionId: string;
}

const orchestrator = new RunOrchestrator<AgentEventDataMap>();

export function createRunSession(config: RunSessionConfig): RunSessionResult {
  const sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const run = new AgentRun({ sessionId, parentSignal: config.signal });
  const childRuns = new Map<string, AgentRun>();
  const recorder = config.recorder ?? defaultRunRecorder;
  const subAgentEvents = config.subAgentEvents ?? createSubAgentEventSink();
  config.fileCheckpoint?.beginTurn(sessionId, run.id);

  const ctx = createToolContext({
    abortSignal: run.abortSignal,
    confirmBus,
    mode: config.mode,
    workspaceRoot: config.workspaceRoot,
    revert: config.fileCheckpoint
      ? { fileCheckpoint: config.fileCheckpoint }
      : undefined,
  });
  const runCtx: RunContext = { ctx, run, childRuns, recorder, subAgentEvents };

  const handle = orchestrator.start(run, {
    execute: async ({ signal, emit }) => {
      await (config.streamAgentResponse ?? defaultStreamAgentResponse)({
        agent: config.createAgent(runCtx),
        messages: config.messages,
        signal,
        emit,
      });
    },
    persist: {
      filter: (event) =>
        event.type !== RUN_START && event.type !== PERSISTENCE_ERROR,
      write: (event) => recorder.recordEvent(sessionId, event),
      onError: (error, event) => {
        run.emit(PERSISTENCE_ERROR, {
          message: `Failed to persist run event: ${formatError(error)}`,
          failedEventType: event.type,
        });
      },
    },
    onError: (error) => {
      run.emit(ERROR, { message: formatError(error) });
    },
  });

  let checkpointPromise: Promise<void> | null = null;
  const recordTurnCompleteOnce = (): Promise<void> => {
    checkpointPromise ??= recorder
      .recordTurnComplete(sessionId, run.id, getNextSequence(run.getSnapshot()))
      .catch((error: unknown) => {
        run.emit(PERSISTENCE_ERROR, {
          message: `Failed to persist turn checkpoint: ${formatError(error)}`,
          failedEventType: "turn-complete",
        });
      });
    return checkpointPromise;
  };

  const completion = handle.completion.then(
    async (result) => {
      if (result.status === "completed" || result.status === "failed") {
        await recordTurnCompleteOnce();
        config.fileCheckpoint?.completeTurn(sessionId, run.id);
      } else {
        config.fileCheckpoint?.discardActiveTurn(run.id);
      }
      return result;
    },
    (error: unknown) => {
      config.fileCheckpoint?.discardActiveTurn(run.id);
      throw error;
    },
  );

  const checkpointedHandle: RunHandle<AgentEventDataMap> = {
    ...handle,
    completion,
  };

  return { run, childRuns, handle: checkpointedHandle, sessionId };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getNextSequence(events: readonly AnyAgentEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.sequence), -1) + 1;
}
