import type { ModelMessage } from "ai";
import {
  parseToolInput,
  type AgentMessage,
} from "@excelsior/core";
import { normalizeMessageContent } from "../application/context/messageUtils.js";

export function toModelMessages(messages: readonly AgentMessage[]): ModelMessage[] {
  return messages.map(toModelMessage);
}

function toModelMessage(message: AgentMessage): ModelMessage {
  switch (message.role) {
    case "system":
      return { role: "system", content: normalizeMessageContent(message.content) };
    case "user":
      return {
        role: "user",
        content: toTextContent(message.content),
      };
    case "assistant": {
      const textContent = toTextContent(message.content);
      const toolCalls =
        message.tool_calls?.map((toolCall) => ({
          type: "tool-call" as const,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: parseToolInput(toolCall.function.arguments),
        })) ?? [];

      if (toolCalls.length === 0) {
        return { role: "assistant", content: textContent };
      }

      return {
        role: "assistant",
        content: [
          ...(typeof textContent === "string" && textContent.length > 0
            ? [{ type: "text" as const, text: textContent }]
            : Array.isArray(textContent)
              ? textContent
              : []),
          ...toolCalls,
        ],
      };
    }
    case "tool":
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.tool_call_id ?? "tool-call",
            toolName: "tool",
            output: {
              type: "text",
              value: normalizeMessageContent(message.content),
            },
          },
        ],
      };
  }
}

function toTextContent(
  content: AgentMessage["content"],
): string | Array<{ type: "text"; text: string }> {
  if (typeof content === "string") return content;
  return content.map((part) => ({ type: "text", text: part.text }));
}
