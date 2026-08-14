import { describe, expect, it } from "vitest";
import { getScrollDelta } from "../../src/components/chat/Transcript.js";
import { scrollTo, scrollBy } from "../../src/actions/viewport.js";
import { createStore } from "../../src/store/store.js";
import { createInitialState } from "../../src/store/types.js";
import { MouseButton, type MouseEvent as OpenTuiMouseEvent } from "@opentui/core";

function makeState() {
  return createInitialState({
    id: "test",
    name: "test",
    rootPath: "/test",
  });
}

describe("getScrollDelta", () => {
  it("extracts delta from event.scroll direction up", () => {
    const event = {
      scroll: { direction: "up", delta: 2 },
      button: 0,
    } as unknown as OpenTuiMouseEvent;
    expect(getScrollDelta(event)).toBe(-2);
  });

  it("extracts delta from event.scroll direction down", () => {
    const event = {
      scroll: { direction: "down", delta: 3 },
      button: 0,
    } as unknown as OpenTuiMouseEvent;
    expect(getScrollDelta(event)).toBe(3);
  });

  it("extracts delta from MouseButton.WHEEL_UP button", () => {
    const event = {
      button: MouseButton.WHEEL_UP,
    } as unknown as OpenTuiMouseEvent;
    expect(getScrollDelta(event)).toBe(-1);
  });

  it("extracts delta from MouseButton.WHEEL_DOWN button", () => {
    const event = {
      button: MouseButton.WHEEL_DOWN,
    } as unknown as OpenTuiMouseEvent;
    expect(getScrollDelta(event)).toBe(1);
  });

  it("returns 0 when no scroll or wheel button is present", () => {
    const event = {
      button: 0,
    } as unknown as OpenTuiMouseEvent;
    expect(getScrollDelta(event)).toBe(0);
  });
});

describe("scrollTo & scrollBy viewport actions", () => {
  it("scrollTo clamps between 0 and maxScroll and sets followLatest when at bottom", () => {
    const store = createStore(makeState());
    scrollTo(store, 50, 100);
    expect(store.getState().view.scrollTop).toBe(50);
    expect(store.getState().view.followLatest).toBe(false);

    scrollTo(store, 100, 100);
    expect(store.getState().view.scrollTop).toBe(100);
    expect(store.getState().view.followLatest).toBe(true);

    scrollTo(store, -10, 100);
    expect(store.getState().view.scrollTop).toBe(0);
    expect(store.getState().view.followLatest).toBe(false);
  });

  it("scrollBy scrolls up and down with followLatest tracking", () => {
    const store = createStore(makeState());
    store.dispatch((s) => ({
      transcript: {
        ...s.transcript,
        blocks: [
          {
            id: "1",
            turnId: "t1",
            kind: "user",
            content: "hello",
            status: "completed",
            createdAt: 1000,
            finalizedAt: 1000,
          },
          {
            id: "2",
            turnId: "t1",
            kind: "assistant",
            content: "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20\nline21\nline22\nline23\nline24\nline25",
            status: "completed",
            createdAt: 1001,
            finalizedAt: 1001,
          },
        ],
      },
      view: { ...s.view, followLatest: true, scrollTop: 0 },
    }));

    scrollBy(store, -5);
    expect(store.getState().view.followLatest).toBe(false);
    expect(store.getState().view.scrollTop).toBeLessThan(25);

    scrollBy(store, 100);
    expect(store.getState().view.followLatest).toBe(true);
  });
});
