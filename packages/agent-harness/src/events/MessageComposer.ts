import { randomUUID } from "node:crypto";
import {
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  type HarnessEventEmitter,
  type HarnessMessage,
} from "../events.js";

export class MessageComposer {
  constructor(private readonly emit: HarnessEventEmitter) {}

  startMessage(id: string, message: Omit<HarnessMessage, "id">): void {
    this.emit(MESSAGE_START, { message: { id, ...message } });
  }

  updateMessage(messageId: string, delta: string): void {
    this.emit(MESSAGE_UPDATE, { messageId, role: "assistant", delta });
  }

  endMessage(message: HarnessMessage): void {
    this.emit(MESSAGE_END, { message });
  }

  userMessage(input: { content: string; displayContent: string }): void {
    const message: HarnessMessage = {
      id: `msg_${randomUUID()}`,
      role: "user",
      content: input.displayContent,
      modelContent: input.content,
    };
    this.startMessage(message.id, message);
    this.endMessage(message);
  }

  assistantMessage(content: string): void {
    const message: HarnessMessage = {
      id: `msg_${randomUUID()}`,
      role: "assistant",
      content,
    };
    this.startMessage(message.id, message);
    this.updateMessage(message.id, content);
    this.endMessage(message);
  }

  toolMessage(input: {
    id: string;
    toolCallId: string;
    toolName: string;
    toolArgs: string;
    content: string;
    isError: boolean;
  }): void {
    const message: HarnessMessage = {
      ...input,
      role: "tool",
      modelContent: `[Tool result: ${input.toolName}]\n${input.content}`,
    };
    this.startMessage(message.id, message);
    this.endMessage(message);
  }
}
