import type { AgentMode, AgentMessage, SendOptions } from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import { createAgent } from "../../agent/agent.js";
import { createSpawnSubAgentTool } from "../../agent/spawn/spawnSubAgent.js";
import type { StreamCapableAgent } from "../../runtime/events.js";
import type { RunRecorder } from "../../persistence/runRecorder.js";
import type { AgentRun } from "../../runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../runtime/events.js";
import type { SubAgentEventSink } from "../../runtime/subAgentEventSink.js";
import { ProjectionPolicy } from "../projection/ProjectionPolicy.js";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import { TurnTransactionCoordinator, type TurnRevertResult } from "./TurnTransaction.js";
import type { ConfirmPromptBus, QuestionPromptBus } from "../../runtime/blockingPrompt.js";
import type { AgentSessionStorage } from "../../sessionManager.js";
import {
  createRunSession,
  type RunContext,
  type RunSessionResult,
} from "./runSession.js";

export type CreateAgentFunction = (
  runCtx: RunContext,
  options?: {
    instructions?: string;
    extraTools?: Record<string, unknown>;
  },
) => StreamCapableAgent;

export interface TurnLifecycleDependencies {
  extraTools?: Record<string, unknown>;
  createAgent?: CreateAgentFunction;
}

export interface TurnLifecycleOptions {
  state: AgentStateStore;
  projection: ProjectionPolicy;
  recorder: RunRecorder;
  subAgentEvents: SubAgentEventSink;
  sessionStorage: AgentSessionStorage;
  appendFinalEvents(events: readonly AnyAgentEvent[]): void;
  dependencies?: TurnLifecycleDependencies;
  confirmBus?: ConfirmPromptBus;
  questionBus?: QuestionPromptBus;
}

const defaultCreateAgent: CreateAgentFunction = (runCtx, options) => {
  const spawnSubAgentTool = createSpawnSubAgentTool(
    runCtx.run,
    runCtx.childRuns,
    runCtx.run.sessionId,
    runCtx.ctx,
    runCtx.recorder,
    runCtx.subAgentEvents,
    {
      createAgent: (subInstructions, extraTools, subCtx) => {
        return createAgent(subInstructions, extraTools, subCtx);
      },
    },
  );

  return createAgent(
    options?.instructions,
    {
      spawnSubAgent: spawnSubAgentTool,
      ...options?.extraTools,
    },
    runCtx.ctx,
  );
};

export interface StartUserTurnOptions extends SendOptions {
  content: string;
  sessionId: string;
  workspaceRoot: string;
  mode: AgentMode;
}

export class TurnLifecycle {
  private readonly state: AgentStateStore;
  private readonly projection: ProjectionPolicy;
  private readonly recorder: RunRecorder;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly turnTransactions: TurnTransactionCoordinator;
  private readonly appendFinalEvents: (events: readonly AnyAgentEvent[]) => void;
  private readonly dependencies: TurnLifecycleDependencies;
  private readonly createAgent: CreateAgentFunction;
  private readonly confirmBus?: ConfirmPromptBus;
  private readonly questionBus?: QuestionPromptBus;
  private handle: RunHandle<AgentEventDataMap> | null = null;
  private unsubscribeLive: (() => void) | null = null;

  constructor(options: TurnLifecycleOptions) {
    this.state = options.state;
    this.projection = options.projection;
    this.recorder = options.recorder;
    this.subAgentEvents = options.subAgentEvents;
    this.appendFinalEvents = options.appendFinalEvents;
    this.dependencies = options.dependencies ?? {};
    this.turnTransactions = new TurnTransactionCoordinator({
      sessionStorage: options.sessionStorage,
    });
    this.createAgent = this.dependencies.createAgent ?? defaultCreateAgent;
    this.confirmBus = options.confirmBus;
    this.questionBus = options.questionBus;
  }

  get run(): AgentRun | null {
    return this.state.activeRun;
  }

  startUserTurn(options: StartUserTurnOptions): void {
    const result = this.createTurnRun(options);
    this.attachRun(result.run, result.childRuns, result.handle);
    this.emitDisplayedUserInput(result.run, options);
  }

  cancel(): void {
    this.handle?.cancel();
    this.clearRun();
  }

  dispose(): void {
    this.cancel();
  }

  revertLatestTurn(sessionId: string): Promise<TurnRevertResult> {
    return this.turnTransactions.revertLatestTurn(sessionId);
  }

  private createTurnRun(
    options: StartUserTurnOptions,
  ): RunSessionResult {
    const messages: AgentMessage[] = [
      ...this.buildAIHistory(),
      { role: "user", content: options.content },
    ];
    const result = createRunSession({
      messages,
      createAgent: (runCtx) =>
        this.createAgent(runCtx, {
          extraTools: this.dependencies.extraTools,
        }),
      sessionId: options.sessionId,
      recorder: this.recorder,
      subAgentEvents: this.subAgentEvents,
      mode: options.mode,
      workspaceRoot: options.workspaceRoot,
      turnTransactions: this.turnTransactions,
      confirmBus: this.confirmBus,
      questionBus: this.questionBus,
    });

    return result;
  }

  private emitDisplayedUserInput(
    run: AgentRun,
    options: StartUserTurnOptions,
  ): void {
    if (options.silent) return;
    run.emit("user-input", {
      content: options.displayContent || options.content,
    });
    this.state.setLiveEvents(run.getSnapshot());
  }

  private buildAIHistory(): AgentMessage[] {
    return this.projection.project(this.state.getProjectionInput()).aiHistory;
  }

  private attachRun(
    run: AgentRun,
    childRuns: Map<string, AgentRun>,
    handle: RunHandle<AgentEventDataMap>,
  ): void {
    this.handle = handle;
    this.state.startRun(run, childRuns);

    this.unsubscribeLive?.();
    this.unsubscribeLive = run.subscribe(() => {
      this.state.setLiveEvents(run.getSnapshot());
    });

    handle.completion
      .then((completion) => {
        if (this.handle !== handle) return;
        if (completion.status === "completed" || completion.status === "failed") {
          this.appendFinalEvents([...run.getSnapshot()]);
        }
        this.clearRun();
      })
      .catch(() => {
        if (this.handle !== handle) return;
        this.clearRun();
      });
  }

  private clearRun(): void {
    this.unsubscribeLive?.();
    this.unsubscribeLive = null;
    this.handle = null;
    this.state.clearActiveRun();
  }
}
