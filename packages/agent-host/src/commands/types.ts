import type {
  AgentMode,
  CommandDefinition,
  CommandResult,
  Session,
  SendOptions,
} from "@excelsior/core";

export interface AgentCommandApplication {
  readonly workspaceRoot?: string;
  send(content: string, options?: SendOptions): void;
  clear(): void;
  deleteAllSessions(): void | Promise<void>;
  createSession(title?: string): Session;
  switchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): void | Promise<void>;
  renameSession(sessionId: string, title: string): void;
  getSnapshot(): { mode: AgentMode };
  setMode(mode: AgentMode): void;
  revertLastTurn(): Promise<CommandResult>;
  compactCurrentSession(triggerMode?: "manual" | "auto"): Promise<void>;
}

export interface ReviewCommandServices {
  fetchPRDiff(prNumber: number): Promise<string>;
  postPRComment(prNumber: number, body: string): Promise<string>;
}

export type CommandHandler<Context, Args = any> = (
  args: Args,
  context: Context,
  rawArgs: string[]
) => CommandResult | Promise<CommandResult>;

export interface AgentCommand {
  definition: CommandDefinition;
  execute(args: string[], application: AgentCommandApplication): CommandResult | Promise<CommandResult>;
}
