import { describe, expect, it } from "vitest";
import { cleanSubAgentRole, formatToolPreview, getSubAgentStatusDisplay } from "../tui/lib/subAgentDisplay.js";

describe("sub-agent display helpers", () => {
  it("cleans noisy role labels", () => {
    expect(cleanSubAgentRole("  --- Code Style Task   ")).toBe("Code Style");
    expect(cleanSubAgentRole("")).toBe("SubAgent");
  });

  it("trims long tool previews", () => {
    const preview = formatToolPreview("ripgrep", "{\"query\":\"" + "x".repeat(80) + "\"}", 32);
    expect(preview.length).toBeLessThanOrEqual(32);
    expect(preview).toContain("...");
  });

  it("uses consistent labels for statuses", () => {
    expect(getSubAgentStatusDisplay("running").label).toBe("running");
    expect(getSubAgentStatusDisplay("done").label).toBe("done");
    expect(getSubAgentStatusDisplay("error").label).toBe("error");
  });
});
