export interface ToolCallInfo {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
}

export interface StreamCallbacks {
  onTextDelta: (fullText: string) => void;
  onToolCall: (toolName: string, args: string, toolCallId: string) => void;
  onToolResult: (toolCallId: string, result: string) => void;
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

export type Screen = 'chat' | 'logs' | 'settings' | 'review';

export type ReviewScreenMode = "browser" | "review" | "results";

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  createdAt: string;
}

export interface SubAgentState {
  toolCallId: string;
  role: string;
  status: "running" | "done";
  latestLine: string;
  fullOutput: string;
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
