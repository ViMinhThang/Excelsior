import type { AgentMessage } from "@excelsior/core";
import type { HarnessMessage } from "../events.js";
import { toAgentMessage } from "./utils.js";

export class AiHistory {
  private messages: AgentMessage[] = [];

  reset(): void {
    this.messages = [];
  }

  appendMessage(message: HarnessMessage): void {
    this.messages.push(toAgentMessage(message));
  }

  appendAssistant(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  appendToolCall(input: {
    toolCallId: string;
    toolName: string;
    toolArgs: string;
  }): void {
    this.messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{
        id: input.toolCallId,
        type: "function",
        function: {
          name: input.toolName,
          arguments: input.toolArgs,
        },
      }],
    });
  }

  snapshot(): AgentMessage[] {
    return [...this.messages];
  }
}
