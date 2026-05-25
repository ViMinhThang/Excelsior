import type {
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  SendOptions,
  Session,
} from "@excelsior/core";
import type {
  AgentHostCatalogReader,
  AgentHostDispatchResult,
  AgentHostDispatcher,
} from "./hostContract.js";

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
