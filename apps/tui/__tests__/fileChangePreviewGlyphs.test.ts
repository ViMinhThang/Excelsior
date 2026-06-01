import { describe, expect, it } from "vitest";
import {
  unicodeFileChangePreviewGlyphs,
} from "../src/features/fileChangePreview/fileChangePreviewGlyphs.js";

describe("file change preview glyphs", () => {
  it("keeps terminal glyphs behind named symbols", () => {
    expect(unicodeFileChangePreviewGlyphs).toMatchObject({
      pendingStatus: "\u25cf",
      completedStatus: "\u2714",
      scrollUp: "\u25b2",
      scrollThumb: "\u2588",
      scrollTrack: "\u2591",
      scrollDown: "\u25bc",
      cappedPrefix: "\u21b3",
      separator: "\u00b7",
    });
  });

});
