import type { ScrollBoxRenderable } from "@opentui/core";

export interface ScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

export const SCROLL_BOTTOM_EPSILON = 1;

export function isScrolledBackFromLatest(
  snapshot: ScrollSnapshot,
  epsilon = SCROLL_BOTTOM_EPSILON,
): boolean {
  const maxScrollTop = Math.max(0, snapshot.scrollHeight - snapshot.viewportHeight);
  return maxScrollTop > epsilon && snapshot.scrollTop < maxScrollTop - epsilon;
}

export function getScrollSnapshot(scrollbox: ScrollBoxRenderable): ScrollSnapshot {
  return {
    scrollTop: scrollbox.scrollTop,
    scrollHeight: scrollbox.scrollHeight,
    viewportHeight: scrollbox.viewport.height,
  };
}

export function scrollToLatest(scrollbox: ScrollBoxRenderable): void {
  scrollbox.scrollTo({
    x: scrollbox.scrollLeft,
    y: Math.max(0, scrollbox.scrollHeight - scrollbox.viewport.height),
  });
}

export function getTranscriptArrowScrollTop(
  snapshot: ScrollSnapshot,
  direction: "up" | "down",
): number {
  const maxScrollTop = Math.max(0, snapshot.scrollHeight - snapshot.viewportHeight);
  const delta = Math.max(1, Math.floor(snapshot.viewportHeight * 0.45));
  const nextScrollTop = direction === "up"
    ? snapshot.scrollTop - delta
    : snapshot.scrollTop + delta;
  return Math.min(maxScrollTop, Math.max(0, nextScrollTop));
}
