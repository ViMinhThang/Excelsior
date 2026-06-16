import {
  ERROR,
  HISTORY_COMPACTED,
  TURN_START,
  TURN_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";

export class LifecycleHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    HISTORY_COMPACTED,
    ERROR,
    TURN_START,
    TURN_END,
  ]);

  public apply(event: AnyHarnessEvent, projection: ProjectionContext): void {
    const timestamp = event.timestamp || new Date().toISOString();
    if (event.type === TURN_START) {
      projection.lifecycle.startTurn({
        turnId: event.turnId || event.id,
        timestamp,
      });
    } else if (event.type === TURN_END) {
      projection.lifecycle.endTurn({
        turnId: event.turnId,
        cancelled: event.data.cancelled,
        timestamp,
      });
    } else if (event.type === HISTORY_COMPACTED) {
      projection.lifecycle.compactHistory({
        id: event.id,
        summary: event.data.summary,
        turnId: event.turnId,
        timestamp,
      });
    } else if (event.type === ERROR) {
      projection.lifecycle.fail({
        id: event.id,
        message: event.data.message,
        turnId: event.turnId,
        timestamp,
      });
    }
  }
}
