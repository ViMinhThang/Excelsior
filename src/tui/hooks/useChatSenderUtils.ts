import { Message } from "../../types.js";

export function mapMessagesToAIHistory(messages: Message[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "user") {
        return { role: "user" as const, content: m.content };
      }
      if (m.role === "assistant") {
        return {
          role: "assistant" as const,
          content: m.content,
          tool_calls: m.toolCalls?.map((tc) => ({
            id: tc.toolCallId,
            type: "function" as const,
            function: { name: tc.toolName, arguments: tc.toolArgs },
          })),
        };
      }
      if (m.role === "tool-call" && m.toolCall) {
        return {
          role: "tool" as const,
          tool_call_id: m.toolCall.toolCallId,
          content: m.content,
        };
      }
      return { role: "user" as const, content: m.content };
    });
}

export function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatErrorMessage(error: any): string {
  let displayError = error.message;
  if (error.message.includes("401") || error.message.includes("API key")) {
    return "Invalid or missing API key. Please check your settings (ctrl+s).";
  } else if (error.message.includes("fetch")) {
    return "Connection error. Please check your internet.";
  }
  return displayError;
}
