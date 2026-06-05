import { describe, expect, it } from "vitest";
import { titlebarOverlayForTheme } from "../src/main/titlebarTheme.js";

describe("desktop titlebar theme", () => {
  it("uses light overlay colors for Rose Pine Light", () => {
    expect(titlebarOverlayForTheme("rose-pine-light")).toEqual({
      color: "#f2e9e1",
      symbolColor: "#9893a5",
    });
  });

  it("keeps dark Rose Pine chrome dark", () => {
    expect(titlebarOverlayForTheme("rose-pine-dark")).toEqual({
      color: "#171520",
      symbolColor: "#6e6a86",
    });
  });
});
