import type { AgentHost } from "@excelsior/client";
import { HarnessAgentHost } from "./HarnessAgentHost.js";

let defaultHost: AgentHost | null = null;

export function getDefaultAgentHost(): AgentHost {
  if (!defaultHost) {
    defaultHost = new HarnessAgentHost();
  }
  return defaultHost;
}

export function resetDefaultAgentHost(): void {
  defaultHost?.dispose();
  defaultHost = null;
}
