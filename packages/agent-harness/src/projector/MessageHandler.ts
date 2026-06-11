import {
  MESSAGE_START,
  MESSAGE_UPDATE,
  MESSAGE_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionHandler, ProjectionState } from "./types.js";
import {
  flushTool,
  flushAssistant,
  flushAll,
  toAgentMessage,
  nextDisplayBlockId,
  upsertBlockInTurn,
} from "./utils.js";

export class MessageHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    MESSAGE_START,
    MESSAGE_UPDATE,
    MESSAGE_END,
  ]);

  public apply(event: AnyHarnessEvent, state: ProjectionState): void {
    if (event.type === MESSAGE_START) {
      const message = event.data.message;
      if (message.role === "assistant") {
        flushTool(state, true);
        state.assistant = {
          id: message.id,
          content: message.content,
          timestamp: event.timestamp || new Date().toISOString(),
          frozen: false,
        };
      }
    } else if (event.type === MESSAGE_UPDATE) {
      flushTool(state, true);
      const previousContent = state.assistant?.id === event.data.messageId
        ? state.assistant.content
        : "";
      state.assistant = {
        id: event.data.messageId,
        content: `${previousContent}${event.data.delta}`,
        timestamp: event.timestamp || new Date().toISOString(),
        frozen: false,
      };
    } else if (event.type === MESSAGE_END) {
      const message = event.data.message;
      if (message.role === "user") {
        flushAll(state, true, event.turnId);
        upsertBlockInTurn(state, event.turnId, {
          type: "user",
          id: nextDisplayBlockId(message.id, state.displayIdCounts),
          content: message.content,
          timestamp: event.timestamp || new Date().toISOString(),
          isFrozen: true,
        });
        state.aiHistory.push(toAgentMessage(message));
      } else if (message.role === "assistant") {
        flushTool(state, true);
        state.assistant = {
          id: message.id,
          content: message.content,
          timestamp: event.timestamp || new Date().toISOString(),
          frozen: true,
        };
        flushAssistant(state, true, event.turnId);
        if (message.content.trim()) {
          state.aiHistory.push(toAgentMessage(message));
        }
      } else if (message.role === "tool") {
        state.aiHistory.push(toAgentMessage(message));
      }
    }
  }
}
