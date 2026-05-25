import { DefaultSettingsStore } from "../ports/DefaultSettingsStore.js";
import { LocalAgentHost } from "./LocalAgentHost.js";

let defaultHost: LocalAgentHost | null = null;

export function getDefaultAgentHost(): LocalAgentHost {
  if (!defaultHost) {
    defaultHost = new LocalAgentHost(
      undefined,
      new DefaultSettingsStore(),
    );
  }
  return defaultHost;
}

export function resetDefaultAgentHost(): void {
  defaultHost?.dispose();
  defaultHost = null;
}
