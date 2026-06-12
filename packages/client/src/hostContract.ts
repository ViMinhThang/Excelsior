import type {
  AgentClientState,
  AgentMode,
  AskQuestionResponse,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";

export interface AgentHostCatalog {
  commands: CommandDefinition[];
  settings: AppSettings;
}

export type AgentHostIntent =
  | { type: "send"; content: string; options?: SendOptions }
  | { type: "cancel" }
  | { type: "cancel-reflection" }
  | { type: "execute-command"; input: string }
  | { type: "create-session"; title?: string }
  | { type: "switch-session"; sessionId: string }
  | { type: "delete-session"; sessionId: string }
  | { type: "rename-session"; sessionId: string; title: string }
  | { type: "set-mode"; mode: AgentMode }
  | { type: "toggle-mode" }
  | { type: "save-settings"; settings: Partial<AppSettings> }
  | { type: "respond-to-confirmation"; callId: string; approved: boolean }
  | { type: "approve-all-confirmations" }
  | { type: "respond-to-question"; response: AskQuestionResponse }
  | { type: "clear-messages" }
  | { type: "delete-all-sessions" }
  | { type: "revert-last-turn" };

export type AgentHostDispatchResult =
  | { type: "none" }
  | { type: "command-result"; result: CommandResult }
  | { type: "session"; session: Session }
  | { type: "mode"; mode: AgentMode };

export interface IntentHandler<T extends AgentHostIntent["type"] = AgentHostIntent["type"]> {
  readonly type: T;
  handle(intent: Extract<AgentHostIntent, { type: T }>): Promise<AgentHostDispatchResult> | AgentHostDispatchResult;
}

export type IntentMiddleware = (
  intent: AgentHostIntent,
  next: () => Promise<AgentHostDispatchResult>,
) => Promise<AgentHostDispatchResult>;

export interface AgentHost {
  getState(): AgentClientState;
  subscribe(listener: () => void): () => void;
  getCatalog(): AgentHostCatalog;
  dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult>;
  dispose(): void;
}

export type AgentHostDispatcher = Pick<AgentHost, "dispatch">;
export type AgentHostCatalogReader = Pick<AgentHost, "getCatalog">;
export type AgentHostStateReader = Pick<AgentHost, "getState">;
