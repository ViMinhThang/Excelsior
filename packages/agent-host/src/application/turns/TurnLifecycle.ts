import type { AgentMode, AgentMessage, SendOptions, CommandResult } from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import { type AgentFactory } from "./AgentFactory.js";
import { DefaultAgentFactory } from "../../agent/DefaultAgentFactory.js";
import { getSetting, type RunRecorder } from "@excelsior/agent-storage";
import type { StreamCapableAgent } from "../../runtime/events.js";
import type { AgentRun } from "../../runtime/agentRun.js";
import {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../runtime/events.js";
import type { SubAgentEventSink } from "../../runtime/subAgentEventSink.js";
import { estimateTokens } from "../context/tokenizer.js";
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
  compactCurrentSession?: (triggerMode: "manual" | "auto") => Promise<void>;
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
  private readonly compactCurrentSessionCallback?: (triggerMode: "manual" | "auto") => Promise<void>;
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
    await this.maybeAutoCompact(options.sessionId);
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
    const result = createRunSession({
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

  private async maybeAutoCompact(sessionId: string): Promise<void> {
    const autoCompactEnabled = getSetting("AUTO_COMPACT_ENABLED") !== "false";
    if (!autoCompactEnabled) return;

    const limitStr = getSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT");
    const limit = limitStr ? parseInt(limitStr, 10) : 253_000;

    const scope = getSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT_SCOPE") || "Total";

    const history = this.buildAIHistory();
    if (history.length === 0) return;

    let messagesForScope = [...history];
    if (scope === "BodyAfterPrefix") {
      const firstNonSystemIndex = history.findIndex((msg) => msg.role !== "system");
      if (firstNonSystemIndex !== -1) {
        messagesForScope = history.slice(firstNonSystemIndex);
      }
    }

    const totalText = messagesForScope
      .map((msg) => typeof msg.content === "string" ? msg.content : msg.content.map(p => p.text).join("\n"))
      .join("\n");
    const estimatedTokens = estimateTokens(totalText);

    if (estimatedTokens > limit) {
      this.state.setLoading(true);
      try {
        if (this.compactCurrentSessionCallback) {
          await this.compactCurrentSessionCallback("auto");
        }
      } finally {
        this.state.setLoading(false);
      }
    }
  }
}
