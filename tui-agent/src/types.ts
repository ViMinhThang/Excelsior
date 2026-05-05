export interface ToolCallInfo {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool-call";
  content: string;
  timestamp?: string;
  toolCall?: ToolCallInfo;
}

export type Screen = 'chat' | 'logs' | 'settings';

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
