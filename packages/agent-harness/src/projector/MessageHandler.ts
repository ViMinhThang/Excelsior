import {
  MESSAGE_START,
  MESSAGE_UPDATE,
  MESSAGE_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";

export class MessageHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    MESSAGE_START,
    MESSAGE_UPDATE,
    MESSAGE_END,
  ]);

  public apply(event: AnyHarnessEvent, projection: ProjectionContext): void {
    const timestamp = event.timestamp || new Date().toISOString();
    if (event.type === MESSAGE_START) {
      const message = event.data.message;
      if (message.role === "assistant") {
        projection.messages.startAssistant({
          id: message.id,
          content: message.content,
          turnId: event.turnId,
          timestamp,
        });
      }
    } else if (event.type === MESSAGE_UPDATE) {
      projection.messages.updateAssistant({
        id: event.data.messageId,
        delta: event.data.delta,
        turnId: event.turnId,
        timestamp,
      });
    } else if (event.type === MESSAGE_END) {
      const message = event.data.message;
      if (message.role === "user") {
        projection.messages.finishUser({
          message,
          turnId: event.turnId,
          timestamp,
        });
      } else if (message.role === "assistant") {
        projection.messages.finishAssistant({
          message,
          turnId: event.turnId,
          timestamp,
        });
      } else if (message.role === "tool") {
        projection.messages.finishToolMessage({ message });
      }
    }
  }
}
