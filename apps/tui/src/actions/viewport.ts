import type { Store } from "../store/store.js";
import type { UiState } from "../store/types.js";
import { flattenTranscript } from "../transcript/flatten.js";
import { register } from "./registry.js";

function estimateTranscriptTotalHeight(s: UiState): number {
  const { heights } = flattenTranscript(s.transcript.blocks, s.transcript.live, s.view.toolsExpanded, 80);
  return heights.reduce((sum, h) => sum + h, 0);
}

export function scrollBy(store: Store, delta: number): void {
  store.dispatch((s) => {
    const totalHeight = estimateTranscriptTotalHeight(s);
    const estimatedMaxScroll = Math.max(0, totalHeight - 18);
    const base = s.view.followLatest ? estimatedMaxScroll : s.view.scrollTop;
    const scrollTop = Math.max(0, base + delta);
    const followLatest = scrollTop >= estimatedMaxScroll;
    return {
      view: { ...s.view, scrollTop, followLatest },
    };
  });
}

export function pageBy(store: Store, page: number): void {
  scrollBy(store, page);
}

export function scrollTo(store: Store, targetScroll: number, maxScroll?: number): void {
  store.dispatch((s) => {
    const effectiveMax = maxScroll ?? Math.max(0, estimateTranscriptTotalHeight(s) - 18);
    const clamped = Math.max(0, Math.min(effectiveMax, targetScroll));
    const followLatest = clamped >= effectiveMax;
    return {
      view: { ...s.view, scrollTop: clamped, followLatest },
    };
  });
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
