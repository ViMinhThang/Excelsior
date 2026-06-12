import type { AgentMessage, ProjectedTurn } from "@excelsior/core";
import type { AnyHarnessEvent, HarnessEventType } from "../events.js";
import { MessageHandler } from "./MessageHandler.js";
import { ToolHandler } from "./ToolHandler.js";
import { SubAgentHandler } from "./SubAgentHandler.js";
import { LifecycleHandler } from "./LifecycleHandler.js";
import type { ProjectionHandler } from "./types.js";
import { TranscriptProjection } from "./TranscriptProjection.js";

export class Projector {
  private handlers = new Map<HarnessEventType, ProjectionHandler>();
  private projection = new TranscriptProjection();
  private appliedCount = 0;
  private lastEventId: string | undefined;

  constructor() {
    this.reset();
    this.registerHandlers([
      new MessageHandler(),
      new ToolHandler(),
      new SubAgentHandler(),
      new LifecycleHandler(),
    ]);
  }

  private registerHandlers(handlers: ProjectionHandler[]): void {
    for (const handler of handlers) {
      for (const eventType of handler.handles) {
        this.handlers.set(eventType, handler);
      }
    }
  }

  public reset(): void {
    this.projection.reset();
    this.appliedCount = 0;
    this.lastEventId = undefined;
  }

  private canApplyIncrementally(events: readonly AnyHarnessEvent[]): boolean {
    if (this.appliedCount === 0) return true;
    if (this.appliedCount > events.length) return false;
    return events[this.appliedCount - 1]?.id === this.lastEventId;
  }

  public project(events: readonly AnyHarnessEvent[]): { turns: ProjectedTurn[]; aiHistory: AgentMessage[] } {
    if (!this.canApplyIncrementally(events)) {
      this.reset();
    }

    for (let i = this.appliedCount; i < events.length; i++) {
      const event = events[i]!;
      const handler = this.handlers.get(event.type);
      if (handler) {
        handler.apply(event, this.projection);
      }
    }

    this.appliedCount = events.length;
    this.lastEventId = events.at(-1)?.id;

    return {
      ...this.projection.snapshot(),
    };
  }
}
