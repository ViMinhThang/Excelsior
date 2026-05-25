import { type RunHandle } from "@excelsior/run-runtime";
import { AgentRun } from "../runtime/agentRun.js";
import { AgentEventDataMap, AnyAgentEvent } from "../runtime/events.js";
import { createToolContext, ToolContext } from "../tooling/context.js";
import type { AgentMode, AgentMessage } from "@excelsior/core";
import { confirmBus } from "../runtime/confirmBus.js";
import {
  defaultRunRecorder,
  type RunRecorder,
} from "../persistence/runRecorder.js";
import { createSubAgentEventSink, SubAgentEventSink } from "../runtime/subAgentEventSink.js";
import { ERROR, PERSISTENCE_ERROR, RUN_START } from "../runtime/eventNames.js";
import {
  streamAgentResponse as defaultStreamAgentResponse,
  type StreamCapableAgent,
} from "../runtime/agentStream.js";
import type { FileCheckpoint } from "../revert/fileCheckpoint.js";

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

export class RunSession {
  readonly run: AgentRun;
  readonly childRuns = new Map<string, AgentRun>();
  readonly sessionId: string;
  private readonly recorder: RunRecorder;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly config: RunSessionConfig;
  private handle!: RunHandle<AgentEventDataMap>;
  private checkpointPromise: Promise<void> | null = null;

  constructor(config: RunSessionConfig) {
    this.config = config;
    this.sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.run = new AgentRun({ sessionId: this.sessionId, parentSignal: config.signal });
    this.recorder = config.recorder ?? defaultRunRecorder;
    this.subAgentEvents = config.subAgentEvents ?? createSubAgentEventSink();
  }

  start(): RunSessionResult {
    this.config.fileCheckpoint?.beginTurn(this.sessionId, this.run.id);

    const ctx = createToolContext({
      abortSignal: this.run.abortSignal,
      confirmBus,
      mode: this.config.mode,
      workspaceRoot: this.config.workspaceRoot,
      revert: this.config.fileCheckpoint
        ? { fileCheckpoint: this.config.fileCheckpoint }
        : undefined,
    });
    const runCtx: RunContext = {
      ctx,
      run: this.run,
      childRuns: this.childRuns,
      recorder: this.recorder,
      subAgentEvents: this.subAgentEvents,
    };

    const baseHandle = this.run.start({
      execute: async ({ signal, emit }) => {
        await (this.config.streamAgentResponse ?? defaultStreamAgentResponse)({
          agent: this.config.createAgent(runCtx),
          messages: this.config.messages,
          signal,
          emit,
        });
      },
      persist: {
        filter: (event) =>
          event.type !== RUN_START && event.type !== PERSISTENCE_ERROR,
        write: (event) => this.recorder.recordEvent(this.sessionId, event),
        onError: (error, event) => {
          this.run.emit(PERSISTENCE_ERROR, {
            message: `Failed to persist run event: ${formatError(error)}`,
            failedEventType: event.type,
          });
        },
      },
      onError: (error) => {
        this.run.emit(ERROR, { message: formatError(error) });
      },
    });

    const completion = baseHandle.completion.then(
      async (result) => {
        if (result.status === "completed" || result.status === "failed") {
          await this.recordTurnCompleteOnce();
          this.config.fileCheckpoint?.completeTurn(this.sessionId, this.run.id);
        } else {
          this.config.fileCheckpoint?.discardActiveTurn(this.run.id);
        }
        return result;
      },
      (error: unknown) => {
        this.config.fileCheckpoint?.discardActiveTurn(this.run.id);
        throw error;
      },
    );

    this.handle = {
      ...baseHandle,
      completion,
    };

    return {
      run: this.run,
      childRuns: this.childRuns,
      handle: this.handle,
      sessionId: this.sessionId,
    };
  }

  cancel(): void {
    this.handle?.cancel();
  }

  private recordTurnCompleteOnce(): Promise<void> {
    this.checkpointPromise ??= this.recorder
      .recordTurnComplete(this.sessionId, this.run.id, getNextSequence(this.run.getSnapshot()))
      .catch((error: unknown) => {
        this.run.emit(PERSISTENCE_ERROR, {
          message: `Failed to persist turn checkpoint: ${formatError(error)}`,
          failedEventType: "turn-complete",
        });
      });
    return this.checkpointPromise;
  }
}

export function createRunSession(config: RunSessionConfig): RunSessionResult {
  return new RunSession(config).start();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getNextSequence(events: readonly AnyAgentEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.sequence), -1) + 1;
}
