import { initDb, logError } from "@excelsior/agent-storage";

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
export { AgentApplication } from "./application/AgentApplication.js";
export type { AgentApplicationOptions } from "./application/AgentApplication.js";
export { LocalAgentHost } from "./host/LocalAgentHost.js";
export { HarnessAgentHost } from "./host/HarnessAgentHost.js";
export {
  createIntentDispatcher,
  type AgentHostIntentDispatcherOptions,
} from "./host/dispatcher.js";
export { IntentRegistry } from "./host/intentRegistry.js";
export {
  getDefaultAgentHost,
  resetDefaultAgentHost,
} from "./host/defaultHost.js";
export {
  createStorageEngine,
  storageEngine,
  type StorageEngine,
} from "@excelsior/agent-storage";

export function initializeAgentHostRuntime(): void {
  initDb();
}

export function logAgentHostError(message: string, stack?: string): void {
  logError(message, stack);
}
