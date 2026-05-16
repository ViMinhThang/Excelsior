import type { AgentRun } from "../../lib/runtime/agentRun.js";
import type {
  AgentEventDataMap,
  AnyAgentEvent,
} from "../../lib/runtime/events.js";
import type { RunHandle } from "@excelsior/run-runtime";
import type {
  FinalEventAppender,
  ChatTurnService,
  RunLifecycleStartOptions,
} from "./types.js";

export class AgentManagerRunLifecycle {
  private _run: AgentRun | null = null;
  private _childRuns = new Map<string, AgentRun>();
  private _handle: RunHandle<AgentEventDataMap> | null = null;
  private _isLoading = false;
  private _liveEvents: readonly AnyAgentEvent[] = [];
  private _unsubLive: (() => void) | null = null;

  constructor(
    private readonly service: ChatTurnService,
    private readonly notify: () => void,
    private readonly appendFinalEvents: FinalEventAppender,
  ) {}

  get run(): AgentRun | null {
    return this._run;
  }

  get childRuns(): Map<string, AgentRun> {
    return this._childRuns;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  get liveEvents(): readonly AnyAgentEvent[] {
    return this._liveEvents;
  }

  startTurn(content: string, options: RunLifecycleStartOptions): void {
    this.setLoading(true);
    this._childRuns.clear();

    const result = this.service.submitUserTurn(content, {
      history: { current: options.history },
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      workspaceRoot: options.workspaceRoot,
      subAgentEvents: options.subAgentEvents,
      displayContent: options.displayContent,
      silent: options.silent,
      mode: options.mode,
    });

    this.attachRun(result.run, result.childRuns, result.handle);
    this.notify();
  }

  cancel(): void {
    this._handle?.cancel();
    this.setLoading(false);
    this.notify();
  }

  private setLoading(loading: boolean): void {
    this._isLoading = loading;
    if (!loading) {
      this._liveEvents = [];
      this._unsubLive?.();
      this._unsubLive = null;
      this._run = null;
      this._handle = null;
    }
  }

  private attachRun(
    run: AgentRun,
    childRuns: Map<string, AgentRun>,
    handle: RunHandle<AgentEventDataMap>,
  ): void {
    this._run = run;
    this._childRuns = childRuns;
    this._handle = handle;

    this._unsubLive?.();
    this._unsubLive = run.subscribe(() => {
      this._liveEvents = run.getSnapshot();
      this.notify();
    });

    handle.completion
      .then((completion) => {
        if (this._handle !== handle) return;
        if (completion.status === "completed" || completion.status === "failed") {
          this.appendFinalEvents([...run.getSnapshot()]);
        }
        this.setLoading(false);
        this.notify();
      })
      .catch(() => {
        if (this._handle !== handle) return;
        this.setLoading(false);
        this.notify();
      });
  }
}
