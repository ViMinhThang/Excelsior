import type { Config } from "../config.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import type { ReviewMode, ReviewReport } from "../review/types.js";
import type { View } from "../context/AppContext.js";

export interface CommandContext {
  config: Config;
  workspace: string;
  memory: MemoryManager;
  setView(view: View): void;
  setIsLoading(v: boolean): void;
  setLoadingMessage(msg: string): void;
  setChatResponse(r: string | null): void;
  setReviewReport(r: ReviewReport | null): void;
  setMode(mode: ReviewMode): void;
  loadPullRequests(): Promise<void>;
  runReview(prNumber: number): Promise<void>;
  handlePrompt(text: string): Promise<void>;
  getHelpText(): string;
}

export interface CommandDefinition<T = any> {
  name: string;
  syntax: string;
  description: string;
  parse(input: string): T | null;
  execute(args: T, ctx: CommandContext): Promise<void>;
}
