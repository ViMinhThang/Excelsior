import type { Config } from "../config.js";
import type { MemoryManager } from "../mem/memory-manager.js";
import type { ReviewMode } from "../review/types.js";
import type { View, NotificationType } from "../context/ui-types.js";

export interface DataContext {
  config: Config;
  workspace: string;
  memory: MemoryManager;
}

export interface UIFacade {
  setView(view: View): void;
  setChatResponse(response: string | null): void;
  setMode(mode: ReviewMode): void;
  notify(message: string, type?: NotificationType, duration?: number): void;
}

export interface TaskFacilitator {
  startTask(id: string, message: string): void;
  endTask(id: string): void;
}

export interface ActionExecutor {
  loadPullRequests(): Promise<void>;
  runReview(prNumber: number): Promise<void>;
  handlePrompt(text: string): Promise<void>;
  getHelpText(): string;
}

export interface CommandDeps {
  data: DataContext;
  ui: UIFacade;
  tasks: TaskFacilitator;
  actions: ActionExecutor;
}