import type { ModelMessage } from "ai";
import type { AgentMessage } from "@excelsior/core";

export function toModelMessages(messages: readonly AgentMessage[]): ModelMessage[] {
  return messages.map((message) => {
    const content = normalizeMessageContent(message.content);
    if (message.role === "system") return { role: "system", content };
    if (message.role === "assistant") return { role: "assistant", content };
    if (message.role === "tool") {
      return {
        role: "user",
        content: `[Tool]\n${content}`,
      };
    }
    return { role: "user", content };
  });
}

export function normalizeMessageContent(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => part.text).join("\n");
}
