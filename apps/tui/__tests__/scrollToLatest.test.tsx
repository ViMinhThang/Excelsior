import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  getTranscriptArrowScrollTop,
  isScrolledBackFromLatest,
} from "../src/lib/scrollUtilities.js";
import { ScrollToLatestButton } from "../src/components/chat/ScrollToLatestButton.js";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";

describe("scroll to latest affordance", () => {
  it("detects when the transcript is scrolled back from the latest output", () => {
    expect(isScrolledBackFromLatest({
      scrollTop: 0,
      scrollHeight: 200,
      viewportHeight: 40,
    })).toBe(true);

    expect(isScrolledBackFromLatest({
      scrollTop: 160,
      scrollHeight: 200,
      viewportHeight: 40,
    })).toBe(false);

    expect(isScrolledBackFromLatest({
      scrollTop: 0,
      scrollHeight: 20,
      viewportHeight: 40,
    })).toBe(false);
  });

  it("renders a centered floating down-arrow affordance", async () => {
    const screen = await renderTui(createElement(ScrollToLatestButton, {
      onPress: () => {},
    }));

    expect(screen.lastFrame()).toContain("\u2193");
    expect(screen.lastFrame()).not.toContain("latest");
    screen.destroy();
  });

  it("clamps transcript arrow-key scrolling", () => {
    expect(getTranscriptArrowScrollTop({
      scrollTop: 20,
      scrollHeight: 200,
      viewportHeight: 40,
    }, "up")).toBe(2);

    expect(getTranscriptArrowScrollTop({
      scrollTop: 160,
      scrollHeight: 200,
      viewportHeight: 40,
    }, "down")).toBe(160);
  });
});
