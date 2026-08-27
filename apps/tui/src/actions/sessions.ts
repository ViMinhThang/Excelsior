import type { Store } from "../store/store.js";
import { getBridge } from "./bridge.js";
import { closeOverlay } from "./overlay.js";
import { register } from "./registry.js";
import { handleAck } from "./submit.js";

export function switchToSelected(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "session-list") return;
  const sessions = store.getState().meta.sessions;
  const session = sessions[overlay.state.cursor];
  if (!session) return;
  const bridge = getBridge();
  if (!bridge) return;
  closeOverlay(store);
  void bridge.command({ cmd: "session-switch", sessionId: session.id }).then((ack) => handleAck(store, ack));
}

export function deleteSelected(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "session-list") return;
  const sessions = store.getState().meta.sessions;
  const session = sessions[overlay.state.cursor];
  if (!session) return;
  const bridge = getBridge();
  if (!bridge) return;
  void bridge.command({ cmd: "session-delete", sessionId: session.id }).then((ack) => handleAck(store, ack));
}

export function deleteCurrentSession(store: Store): void {
  const currentId = store.getState().meta.currentSessionId;
  if (!currentId) return;
  const bridge = getBridge();
  if (!bridge) return;
  void bridge.command({ cmd: "session-delete", sessionId: currentId }).then((ack) => handleAck(store, ack));
}

export function createSession(store: Store): void {
  const bridge = getBridge();
  if (!bridge) return;
  closeOverlay(store);
  void bridge.command({ cmd: "session-create" }).then((ack) => handleAck(store, ack));
}

export function createSessionInOverlay(store: Store): void {
  const bridge = getBridge();
  if (!bridge) return;
  void bridge.command({ cmd: "session-create" }).then((ack) => handleAck(store, ack));
}

register("session-list.switch", (store) => switchToSelected(store));
register("session-list.delete", (store) => deleteSelected(store));
register("session-list.create", (store) => createSessionInOverlay(store));
register("app.deleteSession", (store) => deleteCurrentSession(store));
register("app.newSession", (store) => createSession(store));
