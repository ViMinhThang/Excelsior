export type {
  AgentClientState,
  AppSettings,
  CommandDefinition,
  CommandResult,
  ConfirmRequest,
  SendOptions,
  Session,
} from "@excelsior/core";

export type { AgentHost } from "./host/AgentHost.js";
export { LocalAgentHost } from "./host/LocalAgentHost.js";
export {
  getDefaultAgentHost,
  resetDefaultAgentHost,
} from "./host/defaultHost.js";
