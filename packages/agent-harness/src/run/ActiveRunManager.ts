import type { AnyHarnessEvent, HarnessEventEmitter } from "../events.js";
import { emitRunFinalization, findIncompleteEvents } from "../history/runFinalizer.js";

export interface ActiveRunIdentity {
  runId: string;
  turnId: string;
  sessionId: string;
}

export interface ActiveRunHandle extends ActiveRunIdentity {
  signal: AbortSignal;
}

interface InternalActiveRunHandle extends ActiveRunHandle {
  abortController: AbortController;
}

export interface AcceptedSteering extends ActiveRunIdentity {
  content: string;
}

export class ActiveRunManager {
  private current: InternalActiveRunHandle | null = null;
  private steeringQueue: string[] = [];
  private readonly finalizedRunIds = new Set<string>();

  begin(identity: ActiveRunIdentity): ActiveRunHandle {
    const abortController = new AbortController();
    const handle: InternalActiveRunHandle = {
      ...identity,
      abortController,
      signal: abortController.signal,
    };
    this.current = handle;
    this.steeringQueue = [];
    return handle;
  }

  isActive(): boolean {
    return this.current !== null;
  }

  isLoading(): boolean {
    return this.isActive();
  }

  currentIdentity(): ActiveRunIdentity | null {
    if (!this.current) return null;
    const { runId, turnId, sessionId } = this.current;
    return { runId, turnId, sessionId };
  }

  currentSignal(): AbortSignal | undefined {
    return this.current?.signal;
  }

  acceptSteering(input: { content: string; sessionId?: string }): AcceptedSteering | null {
    if (!this.current) return null;

    const content = input.content.trim();
    if (!content) return null;
    if (input.sessionId && input.sessionId !== this.current.sessionId) return null;

    this.steeringQueue.push(content);
    return {
      runId: this.current.runId,
      turnId: this.current.turnId,
      sessionId: this.current.sessionId,
      content,
    };
  }

  drainSteeringMessages(): string[] {
    const messages = [...this.steeringQueue];
    this.steeringQueue = [];
    return messages;
  }

  abort(): ActiveRunHandle | null {
    if (!this.current) return null;
    this.current.abortController.abort();
    return this.current;
  }

  finalizeCancelled(
    handle: ActiveRunHandle,
    events: readonly AnyHarnessEvent[],
    emit: HarnessEventEmitter,
    reason: string,
  ): void {
    const incomplete = findIncompleteEvents(events, handle.runId, handle.turnId);
    emitRunFinalization(incomplete, reason, emit);
    this.finalizedRunIds.add(handle.runId);
  }

  clear(handle: ActiveRunHandle): void {
    if (!this.isCurrent(handle)) return;
    this.current = null;
    this.steeringQueue = [];
  }

  finish(handle: ActiveRunHandle): void {
    this.clear(handle);
    this.finalizedRunIds.delete(handle.runId);
  }

  isRunFinalized(runId: string): boolean {
    return this.finalizedRunIds.has(runId);
  }

  private isCurrent(handle: ActiveRunHandle): boolean {
    return (
      this.current?.runId === handle.runId
      && this.current.turnId === handle.turnId
      && this.current.sessionId === handle.sessionId
      && this.current.signal === handle.signal
    );
  }
}
