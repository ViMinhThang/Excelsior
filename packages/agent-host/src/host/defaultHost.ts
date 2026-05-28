import { SettingsStore } from "../persistence/SettingsStore.js";
import { LocalAgentHost } from "./LocalAgentHost.js";

let defaultHost: LocalAgentHost | null = null;

export function getDefaultAgentHost(): LocalAgentHost {
  if (!defaultHost) {
    defaultHost = new LocalAgentHost({
      settingsStore: new SettingsStore(),
    });
  }
  return defaultHost;
}

export function resetDefaultAgentHost(): void {
  defaultHost?.dispose();
  defaultHost = null;
}
