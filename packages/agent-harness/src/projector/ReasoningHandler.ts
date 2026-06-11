import {
  REASONING_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionHandler, ProjectionState } from "./types.js";
import {
  flushAll,
  upsertReasoningBlock,
} from "./utils.js";

export class ReasoningHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    REASONING_END,
  ]);

  public apply(event: AnyHarnessEvent, state: ProjectionState): void {
    if (event.type === REASONING_END) {
      flushAll(state, true, event.turnId);
      upsertReasoningBlock(state, {
        id: event.data.messageId,
        content: event.data.content,
        timestamp: event.timestamp || new Date().toISOString(),
        frozen: true,
      }, true, event.turnId);
    }
  }
}
