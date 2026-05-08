export type StreamPart =
  | { type: "text-delta"; text?: string; textDelta?: string; [key: string]: unknown }
  | { type: "tool-call"; toolName?: string; name?: string; toolCallId: string; input?: unknown; [key: string]: unknown }
  | { type: "tool-result"; toolCallId: string; output?: { type: string; value: unknown }; [key: string]: unknown }
  | { type: "tool-error"; toolCallId: string; toolName?: string; error?: unknown; [key: string]: unknown }
  | { type: "finish-step"; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; [key: string]: unknown }
  | { type: "finish"; totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; [key: string]: unknown };

export function getTextDelta(part: StreamPart): string {
  if (part.type === "text-delta") {
    return part.text ?? part.textDelta ?? "";
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
    return output.type === "text" ? String(output.value) : JSON.stringify(output);
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

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StreamCallbacks {
  onTextDelta: (fullText: string) => void;
  onToolCall: (toolName: string, args: string, toolCallId: string) => void;
  onToolResult: (toolCallId: string, result: string) => void;
  onUsage?: (usage: UsageInfo) => void;
  onFinish: (fullText: string, cancelled: boolean) => void;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool-call";
  content: string;
  timestamp?: string;
  toolCall?: ToolCallInfo;
  toolCalls?: any[]; // For AI SDK compatibility
}

export type Screen = 'chat' | 'settings' | 'review';

export type ReviewScreenMode = "browser" | "review" | "results";

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  createdAt: string;
}

export type SubAgentOutputPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; toolArgs: string; toolCallId: string; status: "pending" | "completed" | "error" };

export interface SubAgentState {
  toolCallId: string;
  role: string;
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  outputParts: SubAgentOutputPart[];
  toolCalls: ToolCallInfo[];
}

export const PAGE_SIZE = 50;

export interface CommandContext {
  navigate: (screen: Screen) => void;
  goBack: () => void;
  appendMessage: (role: "user" | "assistant" | "system", content: string) => void;
  clearMessages: () => void;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string[], context: CommandContext) => Promise<void> | void;
}
