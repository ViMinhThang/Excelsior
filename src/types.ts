export type StreamPart =
  | {
      type: "text-delta";
      text: string;
      textDelta?: string;
      [key: string]: unknown;
    }
  | {
      type: "tool-call";
      toolName?: string;
      name?: string;
      toolCallId: string;
      input?: unknown;
      [key: string]: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      output?: { type: string; value: unknown };
      [key: string]: unknown;
    }
  | {
      type: "tool-error";
      toolCallId: string;
      toolName?: string;
      error?: unknown;
      [key: string]: unknown;
    };

export type ConfirmEvents = {
  request: { callId: string; toolName: string; args: string };
  response: { callId: string; approved: boolean };
};

export interface ConfirmBus {
  getListenerCount(event: "request"): number;
  on(
    event: "response",
    handler: (resp: { callId: string; approved: boolean }) => void,
  ): () => void;
  emit(
    event: "request",
    data: { callId: string; toolName: string; args: string },
  ): void;
}

export function getTextDelta(part: StreamPart): string {
  if (part.type === "text-delta") {
    return part.text;
  }
  return "";
}

export function getToolName(part: StreamPart): string {
  if (part.type === "tool-call") {
    return part.toolName ?? part.name ?? "unknown";
  }
  return "unknown";
}

export function getToolArgs(part: StreamPart): string {
  if (part.type === "tool-call") {
    return JSON.stringify(part.input ?? {});
  }
  return "{}";
}

export function getToolResult(part: StreamPart): string {
  if (part.type === "tool-result") {
    const output = part.output;
    if (!output) return "No result returned";
    return output.type === "text"
      ? String(output.value)
      : JSON.stringify(output);
  }
  if (part.type === "tool-error") {
    const error = part.error;
    return `[Error] ${typeof error === "string" ? error : JSON.stringify(error ?? "Unknown tool error")}`;
  }
  return "";
}

export interface ToolCallInfo {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
}

export type Screen = "chat" | "settings" | "review";

export type ReviewScreenMode = "browser" | "review" | "results";

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  createdAt: string;
}

export const PAGE_SIZE = 50;

export interface CommandContext {
  navigate: (screen: Screen) => void;
  goBack: () => void;
  appendMessage: (
    role: "user" | "assistant" | "system",
    content: string,
  ) => void;
  clearMessages: () => void;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string[], context: CommandContext) => Promise<void> | void;
}
