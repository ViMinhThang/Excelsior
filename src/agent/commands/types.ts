import { Screen } from '../../types.js';

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
