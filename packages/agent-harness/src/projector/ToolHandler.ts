import {
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TOOL_EXECUTION_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";
import {
  toolDisplayBlockId,
} from "./utils.js";

export class ToolHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    TOOL_EXECUTION_START,
    TOOL_EXECUTION_UPDATE,
    TOOL_EXECUTION_END,
  ]);

  public apply(event: AnyHarnessEvent, projection: ProjectionContext): void {
    const timestamp = event.timestamp || new Date().toISOString();
    if (event.type === TOOL_EXECUTION_START) {
      projection.tools.start({
        id: toolDisplayBlockId(event),
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        turnId: event.turnId,
        timestamp,
      });
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      projection.tools.update({
        id: toolDisplayBlockId(event),
        delta: event.data.delta,
        target: event.data.target,
        turnId: event.turnId,
        timestamp,
      });
    } else if (event.type === TOOL_EXECUTION_END) {
      projection.tools.finish({
        id: toolDisplayBlockId(event),
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        result: event.data.result,
        isError: event.data.isError,
        turnId: event.turnId,
        timestamp,
      });
    }
  }
}
