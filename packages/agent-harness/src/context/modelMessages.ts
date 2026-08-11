import type { ModelMessage } from "ai";
import type { AgentMessage } from "@excelsior/core";
import { parseModelToolArgs } from "@excelsior/core";

export function normalizeMessageContent(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => part.text).join("\n");
}

function findToolName(toolCallId: string, messages: readonly AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && msg.tool_calls) {
      const found = msg.tool_calls.find((tc) => tc.id === toolCallId);
      if (found) return found.function.name;
    }
  }
  return "unknown";
}

export function toModelMessages(messages: readonly AgentMessage[]): ModelMessage[] {
  return messages.map((message) => {
    const content = normalizeMessageContent(message.content);

    if (message.role === "system") {
      return { role: "system", content };
    }

    if (message.role === "assistant") {
      if (message.tool_calls && message.tool_calls.length > 0) {
        const parts: Array<
          | { type: "text"; text: string }
          | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
        > = [];
        if (content.trim()) {
          parts.push({ type: "text", text: content });
        }
        for (const tc of message.tool_calls) {
          parts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: parseModelToolArgs(tc.function.arguments),
          });
        }
        return {
          role: "assistant",
          content: parts,
        };
      }
      return { role: "assistant", content };
    }

    if (message.role === "tool") {
      const toolCallId = message.tool_call_id || "";
      const toolName = findToolName(toolCallId, messages);
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId,
            toolName,
            output: {
              type: "text",
              value: content,
            },
          },
        ],
      };
    }

    return { role: "user", content };
  });
}
