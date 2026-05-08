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

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
];

function sanitizeMessage(msg: string): string {
  let sanitized = msg;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export function formatErrorMessage(error: Error & { message: string }): string {
  const msg = sanitizeMessage(error.message);
  if (msg.includes("401") || msg.includes("API key") || msg.includes("api key") || msg.includes("apikey")) {
    return "Invalid or missing API key. Please check your settings (ctrl+s).";
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) {
    return "Connection error. Please check your internet.";
  }
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Rate limit exceeded. Please wait before retrying.";
  }
  if (msg.includes("402") || msg.includes("insufficient") || msg.includes("quota") || msg.includes("balance")) {
    return "API quota or balance insufficient.";
  }
  return "An unexpected error occurred. Please try again.";
}
