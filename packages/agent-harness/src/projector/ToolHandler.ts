import {
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TOOL_EXECUTION_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionHandler, ProjectionState } from "./types.js";
import {
  flushAssistant,
  flushTool,
  toolDisplayBlockId,
} from "./utils.js";

export class ToolHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    TOOL_EXECUTION_START,
    TOOL_EXECUTION_UPDATE,
    TOOL_EXECUTION_END,
  ]);

  public apply(event: AnyHarnessEvent, state: ProjectionState): void {
    if (event.type === TOOL_EXECUTION_START) {
      flushAssistant(state, true, event.turnId);
      flushTool(state, true);
      const id = toolDisplayBlockId(event);
      state.tool = {
        id,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status: "pending",
        result: "",
        timestamp: event.timestamp || new Date().toISOString(),
        startTimestamp: event.timestamp || new Date().toISOString(),
      };
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      const currentTool = state.tool;
      const id = toolDisplayBlockId(event);
      if (currentTool && currentTool.id === id) {
        state.tool = {
          id: currentTool.id,
          toolName: currentTool.toolName,
          status: currentTool.status,
          result: currentTool.result,
          startTimestamp: currentTool.startTimestamp,
          endTimestamp: currentTool.endTimestamp,
          toolArgs: `${currentTool.toolArgs}${event.data.delta}`,
          timestamp: event.timestamp || new Date().toISOString(),
        };
      }
    } else if (event.type === TOOL_EXECUTION_END) {
      const status = event.data.isError ? "error" : "completed";
      const previousTool = state.tool;
      const id = toolDisplayBlockId(event);
      state.aiHistory.push({
        role: "assistant",
        content: "",
        tool_calls: [{
          id: event.data.toolCallId,
          type: "function",
          function: {
            name: event.data.toolName,
            arguments: event.data.toolArgs,
          },
        }],
      });
      state.tool = {
        id,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status,
        result: event.data.result,
        timestamp: event.timestamp || new Date().toISOString(),
        startTimestamp: previousTool?.id === id
          ? previousTool.startTimestamp
          : event.timestamp || new Date().toISOString(),
        endTimestamp: event.timestamp || new Date().toISOString(),
      };
      flushTool(state, true);
    }
  }
}
