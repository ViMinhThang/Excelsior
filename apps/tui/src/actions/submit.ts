import type { CommandAck, CommandDefinition } from "@excelsior/protocol";
import { SESSION_PICKER_PANEL_ID } from "@excelsior/protocol";
import type { Store } from "../store/store.js";
import { getBridge } from "./bridge.js";
import { pushHistory, setInput } from "./input.js";
import { openSettings } from "./navigation.js";
import { openSessionList } from "./overlay.js";
import { register } from "./registry.js";
import { patchStatus, toggleMode } from "./status.js";

export function matchCommand(value: string, commands: CommandDefinition[]): CommandDefinition | null {
  const trimmed = value.trim();
  const [name] = trimmed.split(/\s+/);
  if (!name?.startsWith("/")) return null;
  const lower = name.toLowerCase();
  return commands.find((c) => c.name.toLowerCase() === lower) ?? null;
}

export function suggestCommand(value: string, commands: CommandDefinition[]): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.includes(" ")) return null;
  const prefix = trimmed.toLowerCase();
  const matches = commands
    .filter((c) => c.name.toLowerCase().startsWith(prefix))
    .map((c) => c.name);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const shared = commonPrefix(matches);
  return shared.length > prefix.length ? shared : null;
}

function commonPrefix(values: string[]): string {
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (!value.toLowerCase().startsWith(prefix.toLowerCase()) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

export function handleAck(store: Store, ack: CommandAck): void {
  if (!ack.ok) {
    patchStatus(store, { error: ack.error, notice: null });
    return;
  }
  const result = ack.result;
  if (!result) return;
  switch (result.kind) {
    case "busy":
      patchStatus(store, { notice: "Engine is busy — wait for the current turn to finish.", error: null });
      return;
    case "command-result": {
      const commandResult = result.result;
      if (commandResult.navigate === "settings") {
        openSettings(store);
        return;
      }
      if (commandResult.openPanelId === SESSION_PICKER_PANEL_ID) {
        openSessionList(store);
        return;
      }
      if (commandResult.message) {
        patchStatus(store, { notice: commandResult.message, error: null });
      }
      return;
    }
    default:
      return;
  }
}

export function submitPipeline(store: Store, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  pushHistory(store, trimmed);
  setInput(store, "");
  const bridge = getBridge();
  if (!bridge) {
    patchStatus(store, { error: "engine not connected", notice: null });
    return;
  }
  if (matchCommand(trimmed, store.getState().catalog.commands)) {
    void bridge.command({ cmd: "execute-command", input: trimmed }).then((ack) => handleAck(store, ack));
    return;
  }
  void bridge.command({ cmd: "send", content: trimmed }).then((ack) => handleAck(store, ack));
}

export function submit(store: Store): void {
  submitPipeline(store, store.getState().ui.input.value);
}

export function insertCommand(store: Store): void {
  const { value } = store.getState().ui.input;
  const suggestion = suggestCommand(value, store.getState().catalog.commands);
  if (suggestion) {
    setInput(store, suggestion + " ");
  } else {
    toggleMode(store);
  }
}

register("input.submit", (store) => submit(store));
register("input.insertCommand", (store) => insertCommand(store));
register("input.tab", (store) => insertCommand(store));
