import type { ModelMessage } from "ai";
import type { AgentMessage } from "@excelsior/protocol";

export function normalizeMessageContent(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => ("text" in part ? part.text : "")).join("\n");
}

export function parseToolArgs(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson);
  } catch {
    return {};
  }
}

function findToolCall(toolCallId: string, messages: readonly AgentMessage[]) {
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;
    const found = message.tool_calls.find((call) => call.id === toolCallId);
    if (found) return found;
  }
  return undefined;
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
        for (const call of message.tool_calls) {
          parts.push({
            type: "tool-call",
            toolCallId: call.id,
            toolName: call.function.name,
            input: parseToolArgs(call.function.arguments),
          });
        }
        return { role: "assistant", content: parts };
      }
      return { role: "assistant", content };
    }

    if (message.role === "tool") {
      const toolCallId = message.tool_call_id ?? "";
      const call = findToolCall(toolCallId, messages);
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId,
            toolName: call?.function.name ?? "unknown",
            output: { type: "text", value: content },
          },
        ],
      };
    }

    return { role: "user", content };
  });
}