import type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  SendOptions,
  Session,
} from "@excelsior/core";

export interface AgentHost {
  getState(): AgentClientState;
  subscribe(listener: () => void): () => void;

  send(content: string, options?: SendOptions): void;
  cancel(): void;

  executeCommand(input: string): Promise<CommandResult>;
  getCommands(): CommandDefinition[];

  createSession(title?: string): Session;
  switchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, title: string): void;

  getMode(): AgentMode;
  setMode(mode: AgentMode): void;
  toggleMode(): AgentMode;

  getSettings(): AppSettings;
  saveSettings(settings: Partial<AppSettings>): void;

  respondToConfirmation(callId: string, approved: boolean): void;
  approveAllConfirmations(): void;
  clearMessages(): void;
  revertLastTurn(): Promise<CommandResult>;

  dispose(): void;
}

export type {
  AgentClientState,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  SendOptions,
  Session,
};
