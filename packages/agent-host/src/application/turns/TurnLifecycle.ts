import type { AgentMode, AgentMessage, SendOptions } from "@excelsior/core";
import type { RunHandle } from "@excelsior/run-runtime";
import { createAgent } from "../../agent/agent.js";
import { createSpawnSubAgentTool } from "../../agent/spawn/spawnSubAgent.js";
import type { RunRecorder } from "../../lib/persistence/runRecorder.js";
import type { FileCheckpoint } from "../../lib/revert/fileCheckpoint.js";
import type { AgentRun } from "../../lib/runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../lib/runtime/events.js";
import type { SubAgentEventSink } from "../../lib/runtime/subAgentEventSink.js";
import { buildContextMessages } from "../context/contextBuilder.js";
import type { ProjectionService } from "../projection/ProjectionService.js";
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
}

export interface TurnLifecycleOptions {
  state: AgentStateStore;
  projection: ProjectionService;
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
  private readonly projection: ProjectionService;
  private readonly recorder: RunRecorder;
  private readonly subAgentEvents: SubAgentEventSink;
  private readonly fileCheckpoint: FileCheckpoint;
  private readonly appendFinalEvents: (events: readonly AnyAgentEvent[]) => void;
  private readonly dependencies: TurnLifecycleDependencies;
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
    const messages = buildContextMessages(
      this.buildAIHistory(),
      options.content,
    );
    const startRunSession =
      this.dependencies.createRunSession ?? createRunSession;
    const result = startRunSession({
      messages,
      createAgent: (runCtx) =>
        createAgent(
          undefined,
          {
            spawnSubAgent: createSpawnSubAgentTool(
              runCtx.run,
              runCtx.childRuns,
              options.sessionId,
              runCtx.ctx,
              runCtx.recorder,
              runCtx.subAgentEvents,
            ),
            ...this.dependencies.extraTools,
          },
          runCtx.ctx,
        ),
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
