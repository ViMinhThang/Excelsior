export type {
  AgentClientState,
  AgentMode,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  ConfirmResponse,
  AskQuestionOption,
  AskQuestionRequest,
  AskQuestionResponse,
  SendOptions,
  Session,
  AgentHost,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";
export { HarnessAgentHost } from "./host/HarnessAgentHost.js";
export {
  getDefaultAgentHost,
  resetDefaultAgentHost,
} from "./host/defaultHost.js";

export function initializeAgentHostRuntime(): void {
  // Harness storage is initialized lazily by HarnessAgentHost.
}

export function logAgentHostError(message: string, stack?: string): void {
  console.error(stack ? `${message}\n${stack}` : message);
}
