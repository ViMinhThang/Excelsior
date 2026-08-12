import type { Store } from "../store/store.js";
import { register } from "./registry.js";

export function scrollBy(store: Store, delta: number): void {
  store.dispatch((s) => {
    const scrollTop = Math.max(0, s.view.scrollTop + delta);
    return {
      view: { ...s.view, scrollTop, followLatest: false },
    };
  });
}

export function pageBy(store: Store, page: number): void {
  scrollBy(store, page);
}

export function scrollToTop(store: Store): void {
  store.dispatch((s) => ({ view: { ...s.view, scrollTop: 0, followLatest: false } }));
}

export function scrollToBottom(store: Store): void {
  store.dispatch((s) => ({ view: { ...s.view, followLatest: true } }));
}

export function toggleFollowLatest(store: Store): void {
  store.dispatch((s) => ({ view: { ...s.view, followLatest: !s.view.followLatest } }));
}

export function toggleTools(store: Store): void {
  store.dispatch((s) => ({ view: { ...s.view, toolsExpanded: !s.view.toolsExpanded } }));
}

export function armFollowLatest(store: Store): void {
  store.dispatch((s) => ({ view: { ...s.view, followLatest: true } }));
}

register("transcript.scrollUp", (store) => scrollBy(store, -1));
register("transcript.scrollDown", (store) => scrollBy(store, 1));
register("transcript.pageUp", (store) => pageBy(store, -16));
register("transcript.pageDown", (store) => pageBy(store, 16));
register("transcript.scrollTop", (store) => scrollToTop(store));
register("transcript.scrollBottom", (store) => scrollToBottom(store));
register("transcript.toggleFollow", (store) => toggleFollowLatest(store));
register("transcript.toggleTools", (store) => toggleTools(store));
