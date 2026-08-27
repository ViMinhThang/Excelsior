import type { Store } from "../store/store.js";
import { nextFocus } from "../routing/focus.js";
import { register } from "./registry.js";

export function openSessionList(store: Store): void {
  store.dispatch((s) => {
    const sessions = s.meta.sessions;
    const currentIndex = sessions.findIndex((session) => session.id === s.meta.currentSessionId);
    return {
      overlay: { kind: "session-list", state: { cursor: currentIndex >= 0 ? currentIndex : 0 } },
      ui: { ...s.ui, focus: nextFocus(s.ui.focus, "session-list-opened") },
    };
  });
}

export function closeOverlay(store: Store): void {
  store.dispatch((s) => {
    if (s.overlay.kind === "none") return { ui: s.ui };
    return {
      overlay: { kind: "none" },
      ui: { ...s.ui, focus: nextFocus(s.ui.focus, "overlay-dismissed") },
    };
  });
}

export function moveSessionCursor(store: Store, delta: number): void {
  store.dispatch((s) => {
    if (s.overlay.kind !== "session-list") return { ui: s.ui };
    const count = s.meta.sessions.length;
    if (count === 0) return { ui: s.ui };
    const cursor = (s.overlay.state.cursor + delta + count) % count;
    return { overlay: { kind: "session-list", state: { cursor } } };
  });
}

register("overlay.dismiss", (store) => closeOverlay(store));
register("session-list.move", (store, arg) => moveSessionCursor(store, Number(arg ?? 1)));
register("app.openSessions", (store) => openSessionList(store));
