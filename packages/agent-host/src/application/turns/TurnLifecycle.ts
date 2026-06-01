import type { AgentMode, AgentMessage, SendOptions, CommandResult } from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import { type AgentFactory } from "./AgentFactory.js";
import { DefaultAgentFactory } from "../../agent/DefaultAgentFactory.js";
import { type RunRecorder } from "@excelsior/agent-storage";
import type { AgentRun } from "../../runtime/agentRun.js";
import {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../runtime/events.js";
import type { SubAgentEventSink } from "../../runtime/subAgentEventSink.js";
import {
  maybeAutoCompactConversation,
  type CompactionTriggerMode,
} from "../context/compactionPolicy.js";
import { ProjectionPolicy } from "../projection/ProjectionPolicy.js";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import { TurnTransactionCoordinator } from "./TurnTransaction.js";
import type { ConfirmPromptBus, QuestionPromptBus } from "../../runtime/blockingPrompt.js";
import type { AgentSessionStorage } from "../../sessionManager.js";
import {
  createManagedRunSession,
  type RunSessionResult,
} from "./runSession.js";

export interface TurnLifecycleDependencies {
  extraTools?: Record<string, unknown>;
  agentFactory?: AgentFactory;
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
  compactCurrentSession?: (triggerMode: CompactionTriggerMode) => Promise<void>;
}

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
  private readonly agentFactory: AgentFactory;
  private readonly confirmBus?: ConfirmPromptBus;
  private readonly questionBus?: QuestionPromptBus;
  private readonly compactCurrentSessionCallback?: (triggerMode: CompactionTriggerMode) => Promise<void>;
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
    this.agentFactory = this.dependencies.agentFactory ?? new DefaultAgentFactory(this.dependencies.extraTools);
    this.confirmBus = options.confirmBus;
    this.questionBus = options.questionBus;
    this.compactCurrentSessionCallback = options.compactCurrentSession;
  }

  get run(): AgentRun | null {
    return this.state.activeRun;
  }

  async startUserTurn(options: StartUserTurnOptions): Promise<void> {
    await this.maybeAutoCompact();
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

  revertLastTurn(
    state: AgentStateStore,
    sessionStorage: AgentSessionStorage,
  ): Promise<CommandResult> {
    return this.turnTransactions.revertLastTurn(state, sessionStorage);
  }

  private createTurnRun(
    options: StartUserTurnOptions,
  ): RunSessionResult {
    const messages: AgentMessage[] = [
      ...this.buildAIHistory(),
      { role: "user", content: options.content },
    ];
    const result = createManagedRunSession(
      {
        messages,
        createAgent: (runCtx) =>
          this.agentFactory.create({
            runContext: runCtx,
            mode: options.mode,
          }),
        sessionId: options.sessionId,
        recorder: this.recorder,
        subAgentEvents: this.subAgentEvents,
        mode: options.mode,
        workspaceRoot: options.workspaceRoot,
        confirmBus: this.confirmBus,
        questionBus: this.questionBus,
      },
      this.turnTransactions,
    );

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

  private async maybeAutoCompact(): Promise<void> {
    await maybeAutoCompactConversation({
      getHistory: () => this.buildAIHistory(),
      setLoading: (isLoading) => this.state.setLoading(isLoading),
      compactCurrentSession: this.compactCurrentSessionCallback,
    });
  }
}
