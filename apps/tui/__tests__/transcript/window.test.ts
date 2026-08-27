import { describe, expect, it } from "vitest";
import { computeWindow, isAtBottom, totalItemsHeight, type WindowItem } from "../../src/transcript/window.js";

function item(id: string, height: number): WindowItem {
  return { id, live: false, height };
}

const ITEMS: WindowItem[] = [
  item("a", 2),
  item("b", 3),
  item("c", 1),
  item("d", 4),
  item("e", 2),
];

describe("totalItemsHeight", () => {
  it("sums item heights", () => {
    expect(totalItemsHeight(ITEMS)).toBe(12);
    expect(totalItemsHeight([])).toBe(0);
  });
});

describe("computeWindow", () => {
  it("returns an empty window for no items", () => {
    const w = computeWindow({ items: [], scrollTop: 0, viewportHeight: 10, followLatest: true });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(-1);
    expect(w.totalHeight).toBe(0);
    expect(w.maxScroll).toBe(0);
    expect(w.effectiveScroll).toBe(0);
  });

  it("anchors to the bottom when followLatest is on", () => {
    const w = computeWindow({
      items: ITEMS,
      scrollTop: 0,
      viewportHeight: 5,
      followLatest: true,
    });
    expect(w.anchor).toBe("bottom");
    expect(w.effectiveScroll).toBe(w.maxScroll);
    expect(w.maxScroll).toBe(7);
    expect(isAtBottom(w)).toBe(true);
  });

  it("clamps scroll to the valid range", () => {
    const w = computeWindow({
      items: ITEMS,
      scrollTop: 999,
      viewportHeight: 5,
      followLatest: false,
    });
    expect(w.effectiveScroll).toBe(7);
    expect(isAtBottom(w)).toBe(true);
  });

  it("renders the top of the list at scroll 0", () => {
    const w = computeWindow({
      items: ITEMS,
      scrollTop: 0,
      viewportHeight: 5,
      followLatest: false,
    });
    expect(w.startIndex).toBe(0);
    expect(w.padTop).toBe(0);
  });

  it("skips items above the scroll offset", () => {
    const w = computeWindow({
      items: ITEMS,
      scrollTop: 5,
      viewportHeight: 5,
      followLatest: false,
      overscan: 0,
    });
    expect(w.startIndex).toBe(2);
    expect(w.padTop).toBe(5);
  });

  it("keeps pads consistent with total height", () => {
    const w = computeWindow({
      items: ITEMS,
      scrollTop: 3,
      viewportHeight: 4,
      followLatest: false,
      overscan: 2,
    });
    expect(w.padTop + w.padBottom).toBeLessThanOrEqual(w.totalHeight);
    expect(w.endIndex).toBeGreaterThanOrEqual(w.startIndex);
  });
});
