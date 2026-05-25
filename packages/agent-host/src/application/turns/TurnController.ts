import type { AgentRun } from "../../lib/runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../lib/runtime/events.js";
import type { RunHandle } from "@excelsior/run-runtime";
import type { AgentStateStore } from "../state/AgentStateStore.js";
import type { ChatTurnService, TurnStartOptions } from "../types.js";

export class TurnController {
  private handle: RunHandle<AgentEventDataMap> | null = null;
  private unsubscribeLive: (() => void) | null = null;

  constructor(
    private readonly service: ChatTurnService,
    private readonly state: AgentStateStore,
    private readonly appendFinalEvents: (events: readonly AnyAgentEvent[]) => void,
  ) {}

  get run(): AgentRun | null {
    return this.state.activeRun;
  }

  startTurn(content: string, options: TurnStartOptions): void {
    const result = this.service.submitUserTurn(content, {
      history: { current: options.history },
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      workspaceRoot: options.workspaceRoot,
      subAgentEvents: options.subAgentEvents,
      fileCheckpoint: options.fileCheckpoint,
      displayContent: options.displayContent,
      silent: options.silent,
      mode: options.mode,
      recorder: options.recorder,
    });

    this.attachRun(result.run, result.childRuns, result.handle);
  }

  cancel(): void {
    this.handle?.cancel();
    this.clearRun();
  }

  dispose(): void {
    this.cancel();
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
