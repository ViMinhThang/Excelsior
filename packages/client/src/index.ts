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

export interface AgentHostCatalog {
  commands: CommandDefinition[];
  settings: AppSettings;
}

export type AgentHostIntent =
  | { type: "send"; content: string; options?: SendOptions }
  | { type: "cancel" }
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
  | { type: "clear-messages" }
  | { type: "delete-all-sessions" }
  | { type: "revert-last-turn" };

export type AgentHostDispatchResult =
  | { type: "none" }
  | { type: "command-result"; result: CommandResult }
  | { type: "session"; session: Session }
  | { type: "mode"; mode: AgentMode };

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

const UNHANDLED_COMMAND: CommandResult = { handled: false };

export function commandResultOrDefault(
  result: AgentHostDispatchResult,
): CommandResult {
  return result.type === "command-result" ? result.result : UNHANDLED_COMMAND;
}

export function sessionResultOrUndefined(
  result: AgentHostDispatchResult,
): Session | undefined {
  return result.type === "session" ? result.session : undefined;
}

export function modeResultOrUndefined(
  result: AgentHostDispatchResult,
): AgentMode | undefined {
  return result.type === "mode" ? result.mode : undefined;
}

export function getHostCommands(host: AgentHostCatalogReader): CommandDefinition[] {
  return host.getCatalog().commands;
}

export async function sendHostMessage(
  host: AgentHostDispatcher,
  content: string,
  options?: SendOptions,
): Promise<void> {
  await host.dispatch({ type: "send", content, options });
}

export async function cancelHostTurn(host: AgentHostDispatcher): Promise<void> {
  await host.dispatch({ type: "cancel" });
}

export async function clearHostMessages(host: AgentHostDispatcher): Promise<void> {
  await host.dispatch({ type: "clear-messages" });
}

export async function executeHostCommand(
  host: AgentHostDispatcher,
  input: string,
): Promise<CommandResult> {
  return commandResultOrDefault(
    await host.dispatch({ type: "execute-command", input }),
  );
}

export async function createHostSession(
  host: AgentHostDispatcher,
  title?: string,
): Promise<Session | undefined> {
  return sessionResultOrUndefined(
    await host.dispatch({ type: "create-session", title }),
  );
}

export async function switchHostSession(
  host: AgentHostDispatcher,
  sessionId: string,
): Promise<void> {
  await host.dispatch({ type: "switch-session", sessionId });
}

export async function deleteHostSession(
  host: AgentHostDispatcher,
  sessionId: string,
): Promise<void> {
  await host.dispatch({ type: "delete-session", sessionId });
}

export async function renameHostSession(
  host: AgentHostDispatcher,
  sessionId: string,
  title: string,
): Promise<void> {
  await host.dispatch({ type: "rename-session", sessionId, title });
}

export async function setHostMode(
  host: AgentHostDispatcher,
  mode: AgentMode,
): Promise<void> {
  await host.dispatch({ type: "set-mode", mode });
}

export async function toggleHostMode(
  host: AgentHostDispatcher,
): Promise<AgentMode | undefined> {
  return modeResultOrUndefined(await host.dispatch({ type: "toggle-mode" }));
}

export async function saveHostSettings(
  host: AgentHostDispatcher,
  settings: Partial<AppSettings>,
): Promise<void> {
  await host.dispatch({ type: "save-settings", settings });
}

export async function respondToHostConfirmation(
  host: AgentHostDispatcher,
  callId: string,
  approved: boolean,
): Promise<void> {
  await host.dispatch({ type: "respond-to-confirmation", callId, approved });
}

export async function approveAllHostConfirmations(
  host: AgentHostDispatcher,
): Promise<void> {
  await host.dispatch({ type: "approve-all-confirmations" });
}

export async function revertLastHostTurn(
  host: AgentHostDispatcher,
): Promise<CommandResult> {
  return commandResultOrDefault(
    await host.dispatch({ type: "revert-last-turn" }),
  );
}

export type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  SendOptions,
  Session,
};
