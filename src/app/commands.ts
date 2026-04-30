import type { Config } from "../config.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import type { ReviewMode, ReviewReport } from "../review/types.js";
import type { View, NotificationType } from "../context/UIContext.js";

export interface CommandContext {
  config: Config;
  workspace: string;
  memory: MemoryManager;
  setView(view: View): void;
  notify(msg: string, type?: NotificationType, duration?: number): void;
  startTask(id: string, message: string): void;
  endTask(id: string): void;
  setChatResponse(r: string | null): void;
  setMode(mode: ReviewMode): void;
  loadPullRequests(): Promise<void>;
  runReview(prNumber: number): Promise<void>;
  handlePrompt(text: string): Promise<void>;
  getHelpText(): string;
}

export interface CommandDefinition<T extends Record<string, any> = {}> {
  name: string;
  syntax: string;
  description: string;
  parse(args: string): T | null;
  execute(args: T, ctx: CommandContext): Promise<void>;
}
