import type {
  AgentMode,
  CommandDefinition,
  CommandResult,
  SendOptions,
} from "@excelsior/core";

export interface AgentCommandHost {
  send(content: string, options?: SendOptions): void;
  clearMessages(): void;
  deleteAllSessions(): void | Promise<void>;
  createSession(title?: string): unknown;
  switchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): void | Promise<void>;
  renameSession(sessionId: string, title: string): void;
  getMode(): AgentMode;
  setMode(mode: AgentMode): void;
  revertLastTurn(): Promise<CommandResult>;
}

export interface ReviewCommandServices {
  fetchPRDiff(prNumber: number): Promise<string>;
  postPRComment(prNumber: number, body: string): Promise<string>;
}

export interface AgentCommand {
  definition: CommandDefinition;
  execute(args: string[], host: AgentCommandHost): CommandResult | Promise<CommandResult>;
}
