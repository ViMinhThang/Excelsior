import { type RunHandle } from "@excelsior/run-runtime";
import { AgentRun } from "../../runtime/agentRun.js";
import { AgentEventDataMap } from "../../runtime/events.js";
import { createToolContext, ToolContext } from "../../tooling/context.js";
import type { AgentMode, AgentMessage } from "@excelsior/core";
import type { ConfirmPromptBus } from "../../runtime/confirmTypes.js";
import type { QuestionPromptBus } from "../../runtime/questionTypes.js";
import {
  defaultRunRecorder,
  type RunRecorder,
} from "../../persistence/runRecorder.js";
import { createSubAgentEventSink, SubAgentEventSink } from "../../runtime/subAgentEventSink.js";
import { ERROR, PERSISTENCE_ERROR, RUN_START } from "../../runtime/eventNames.js";
import {
  streamAgentResponse as defaultStreamAgentResponse,
  type StreamCapableAgent,
} from "../../runtime/agentStream.js";
import { TurnTransactionCoordinator } from "./TurnTransaction.js";

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
  turnTransactions?: TurnTransactionCoordinator;
  confirmBus?: ConfirmPromptBus;
  questionBus?: QuestionPromptBus;
}

export interface RunSessionResult {
  run: AgentRun;
  childRuns: Map<string, AgentRun>;
  handle: RunHandle<AgentEventDataMap>;
  sessionId: string;
}

class RunSession {
  readonly run: AgentRun;
  readonly childRuns = new Map<string, AgentRun>();
  readonly sessionId: string;
  private readonly recorder: RunRecorder;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly turnTransactions: TurnTransactionCoordinator;
  private readonly config: RunSessionConfig;

  constructor(config: RunSessionConfig) {
    this.config = config;
    this.sessionId = config.sessionId ?? `ses_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.run = new AgentRun({ sessionId: this.sessionId, parentSignal: config.signal });
    this.recorder = config.recorder ?? defaultRunRecorder;
    this.subAgentEvents = config.subAgentEvents ?? createSubAgentEventSink();
    this.turnTransactions =
      config.turnTransactions ??
      new TurnTransactionCoordinator({ recorder: this.recorder });
  }

  start(): RunSessionResult {
    const revert = this.turnTransactions.beginTurn(this.sessionId, this.run.id);

    const ctx = createToolContext({
      abortSignal: this.run.abortSignal,
      confirmBus: this.config.confirmBus,
      questionBus: this.config.questionBus,
      mode: this.config.mode,
      workspaceRoot: this.config.workspaceRoot,
      revert,
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
          await this.turnTransactions.completeTurn(this.sessionId, this.run);
        } else {
          this.turnTransactions.discardTurn(this.run.id);
        }
        return result;
      },
      (error: unknown) => {
        this.turnTransactions.discardTurn(this.run.id);
        throw error;
      },
    );

    const handle = {
      ...baseHandle,
      completion,
    };

    return {
      run: this.run,
      childRuns: this.childRuns,
      handle,
      sessionId: this.sessionId,
    };
  }
}

export function createRunSession(config: RunSessionConfig): RunSessionResult {
  return new RunSession(config).start();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
