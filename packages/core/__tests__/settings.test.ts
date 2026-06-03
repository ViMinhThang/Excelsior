import { describe, expect, it } from "vitest";
import { normalizeAgentToolLoopSteps } from "../src/settings.js";

describe("settings", () => {
  it("normalizes missing and invalid agent tool-loop budgets to unlimited", () => {
    expect(normalizeAgentToolLoopSteps(undefined)).toBe("unlimited");
    expect(normalizeAgentToolLoopSteps("")).toBe("unlimited");
    expect(normalizeAgentToolLoopSteps("abc")).toBe("unlimited");
    expect(normalizeAgentToolLoopSteps("0")).toBe("unlimited");
    expect(normalizeAgentToolLoopSteps("-1")).toBe("unlimited");
    expect(normalizeAgentToolLoopSteps("1.5")).toBe("unlimited");
  });

  it("normalizes positive integer agent tool-loop budgets", () => {
    expect(normalizeAgentToolLoopSteps("200")).toBe("200");
    expect(normalizeAgentToolLoopSteps(" 020 ")).toBe("20");
  });
});
