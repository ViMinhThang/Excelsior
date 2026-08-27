import type { AgentLlmInfo, AgentMode } from "@excelsior/protocol";
import type { Store } from "../store/store.js";
import type { EngineState } from "../store/types.js";
import { getBridge } from "./bridge.js";
import { register } from "./registry.js";

export interface StatusPatch {
  busy?: boolean;
  mode?: AgentMode;
  llm?: AgentLlmInfo;
  engine?: EngineState;
  error?: string | null;
  notice?: string | null;
}

export function patchStatus(store: Store, patch: StatusPatch): void {
  store.dispatch((s) => ({ status: { ...s.status, ...patch } }));
}

export function setEngineState(store: Store, engine: EngineState, error: string | null = null): void {
  patchStatus(store, { engine, error });
}

export function setBusy(store: Store, busy: boolean): void {
  patchStatus(store, { busy });
}

export function setError(store: Store, error: string | null): void {
  patchStatus(store, { error });
}

export function toggleMode(store: Store): void {
  const currentMode = store.getState().status.mode;
  const nextMode: AgentMode = currentMode === "plan" ? "act" : "plan";
  store.dispatch((s) => ({ status: { ...s.status, mode: nextMode } }));
  const bridge = getBridge();
  if (bridge) {
    void bridge.command({ cmd: "mode-toggle" });
  }
}

register("app.toggleMode", (store) => toggleMode(store));

