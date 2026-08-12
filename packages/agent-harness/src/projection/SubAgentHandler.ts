import {
  SUB_AGENT_EVENT,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";

export class SubAgentHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    SUB_AGENT_EVENT,
  ]);

  public apply(event: AnyHarnessEvent, projection: ProjectionContext): void {
    if (event.type === SUB_AGENT_EVENT) {
      projection.subAgents.apply({
        id: `${event.turnId ?? event.runId}:${event.data.parentToolCallId}`,
        event: event.data.event,
        turnId: event.turnId,
        timestamp: event.timestamp || new Date().toISOString(),
      });
    }
  }
}
