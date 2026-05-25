import type { AgentMode, AgentMessage, SendOptions } from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import { type AgentFactory, DefaultAgentFactory } from "../../agent/agentFactory.js";
import type { RunRecorder } from "../../persistence/runRecorder.js";
import type { FileCheckpoint } from "../../revert/fileCheckpoint.js";
import type { AgentRun } from "../../runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../runtime/events.js";
import type { SubAgentEventSink } from "../../runtime/subAgentEventSink.js";
import { buildContextMessages } from "../context/contextBuilder.js";
import { ProjectionPolicy } from "../projection/ProjectionPolicy.js";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import {
  createRunSession,
  type RunSessionConfig,
  type RunSessionResult,
} from "../runSession.js";

export type CreateRunSession = (
  config: RunSessionConfig,
) => RunSessionResult;

export interface TurnLifecycleDependencies {
  createRunSession?: CreateRunSession;
  extraTools?: Record<string, unknown>;
  agentFactory?: AgentFactory;
}

export interface TurnLifecycleOptions {
  state: AgentStateStore;
  projection: ProjectionPolicy;
  recorder: RunRecorder;
  subAgentEvents: SubAgentEventSink;
  fileCheckpoint: FileCheckpoint;
  appendFinalEvents(events: readonly AnyAgentEvent[]): void;
  dependencies?: TurnLifecycleDependencies;
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
  private readonly fileCheckpoint: FileCheckpoint;
  private readonly appendFinalEvents: (events: readonly AnyAgentEvent[]) => void;
  private readonly dependencies: TurnLifecycleDependencies;
  private readonly agentFactory: AgentFactory;
  private handle: RunHandle<AgentEventDataMap> | null = null;
  private unsubscribeLive: (() => void) | null = null;

  constructor(options: TurnLifecycleOptions) {
    this.state = options.state;
    this.projection = options.projection;
    this.recorder = options.recorder;
    this.subAgentEvents = options.subAgentEvents;
    this.fileCheckpoint = options.fileCheckpoint;
    this.appendFinalEvents = options.appendFinalEvents;
    this.dependencies = options.dependencies ?? {};
    this.agentFactory = this.dependencies.agentFactory ?? new DefaultAgentFactory();
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

  private createTurnRun(
    options: StartUserTurnOptions,
  ): RunSessionResult {
    const messages: AgentMessage[] = [
      ...this.buildAIHistory(),
      { role: "user", content: options.content },
    ];
    const startRunSession =
      this.dependencies.createRunSession ?? createRunSession;
    const result = startRunSession({
      messages,
      createAgent: (runCtx) =>
        this.agentFactory.create(runCtx, {
          extraTools: this.dependencies.extraTools,
        }),
      sessionId: options.sessionId,
      recorder: this.recorder,
      subAgentEvents: this.subAgentEvents,
      mode: options.mode,
      workspaceRoot: options.workspaceRoot,
      fileCheckpoint: this.fileCheckpoint,
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
