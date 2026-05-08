import { Message } from "../../types.js";
import { createToolDisplay } from "../lib/toolDisplay.js";

function formatToolHistoryMessage(message: Message): string {
  const display = createToolDisplay({
    toolName: message.toolCall?.toolName,
    toolArgs: message.toolCall?.toolArgs,
    status: message.toolCall?.status,
    content: message.content,
  });

  const preview = display.resultPreview?.length
    ? `\n${display.resultPreview.map((line) => `  ${line}`).join("\n")}`
    : "";
  const omitted = display.omittedResultLines
    ? `\n  ... ${display.omittedResultLines} more line${display.omittedResultLines === 1 ? "" : "s"}`
    : "";
  const detail = display.detail ? ` (${display.detail})` : "";

  return `[Tool ${display.tone}: ${display.label} - ${display.summary}${detail}]${preview}${omitted}`;
}

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
        };
      }
      if (m.role === "tool-call" && m.toolCall) {
        return {
          role: "assistant" as const,
          content: formatToolHistoryMessage(m),
        };
      }
      return { role: "user" as const, content: m.content };
    });
}

export function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatErrorMessage(error: Error & { message: string }): string {
  let displayError = error.message;
  if (error.message.includes("401") || error.message.includes("API key")) {
    return "Invalid or missing API key. Please check your settings (ctrl+s).";
  } else if (error.message.includes("fetch")) {
    return "Connection error. Please check your internet.";
  }
  return displayError;
}
