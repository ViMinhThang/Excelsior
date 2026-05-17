import { describe, expect, it } from "vitest";
import { formatCliCommand } from "../../apps/tui/src/components/chat/ToolMessage.js";

describe("ToolMessage command formatting", () => {
  it("shows view calls with only the final path segment", () => {
    expect(formatCliCommand(
      "view",
      JSON.stringify({
        filePath: ["packages", "run-runtime", "src", "runOrchestrator.ts"].join("/"),
      }),
    )).toBe("view runOrchestrator.ts");
  });

  it("does not show quoted JSON args for view calls", () => {
    expect(formatCliCommand(
      "view",
      JSON.stringify({
        filePath: ["packages", "agent-host", "src", "host", "LocalAgentHost.ts"].join("/"),
      }),
    )).toBe("view LocalAgentHost.ts");
  });

  it("shows ls calls with the directory path value only", () => {
    const directoryPath = ["packages", "agent-host", "src", "application"].join("/");

    expect(formatCliCommand(
      "ls",
      JSON.stringify({ directoryPath }),
    )).toBe(`ls ${directoryPath}`);
  });
});
