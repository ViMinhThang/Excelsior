import { describe, expect, it } from "vitest";
import {
  genericToolArgsSummary,
  normalizeSubAgentToolArgs,
  parseToolArgs,
  parseToolInput,
  summarizeKnownToolArgs,
} from "@excelsior/client";

describe("tool argument policy", () => {
  it("parses only object-shaped tool args for presentation", () => {
    expect(parseToolArgs("{\"filePath\":\"demo.ts\"}")).toEqual({ filePath: "demo.ts" });
    expect(parseToolArgs("[\"demo.ts\"]")).toBeNull();
    expect(parseToolArgs("not json")).toBeNull();
  });

  it("preserves non-object model tool input when adapting AI messages", () => {
    expect(parseToolInput("{\"command\":\"npm test\"}")).toEqual({ command: "npm test" });
    expect(parseToolInput("\"literal\"")).toBe("literal");
    expect(parseToolInput("not json")).toBe("not json");
  });

  it("summarizes generic and known tool args through one fallback policy", () => {
    const args = parseToolArgs("{\"command\":\"npm\",\"args\":[\"test\"],\"filePath\":\"a.ts\"}");

    expect(genericToolArgsSummary(args)).toBe("command: npm, args: [\"test\"], filePath: a.ts");
    expect(summarizeKnownToolArgs("{\"command\":\"npm\",\"args\":[\"test\"]}")).toBe("npm test");
    expect(summarizeKnownToolArgs("raw args")).toBe("raw args");
  });

  it("normalizes sub-agent role args without throwing on malformed JSON", () => {
    expect(normalizeSubAgentToolArgs("{\"role\":\"Reviewer\"}")).toBe("{\"role\":\"Reviewer\"}");
    expect(normalizeSubAgentToolArgs("raw role")).toBe("raw role");
  });
});
