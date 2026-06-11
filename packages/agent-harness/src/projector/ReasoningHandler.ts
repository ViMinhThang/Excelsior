import {
  REASONING_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";

export class ReasoningHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    REASONING_END,
  ]);

  public apply(event: AnyHarnessEvent, projection: ProjectionContext): void {
    if (event.type === REASONING_END) {
      projection.reasoning.finish({
        id: event.data.messageId,
        content: event.data.content,
        turnId: event.turnId,
        timestamp: event.timestamp || new Date().toISOString(),
      });
    }
  }
}
