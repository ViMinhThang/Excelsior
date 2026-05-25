import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@excelsior/core";
import { buildContextMessages } from "@excelsior/agent-host/testing/application";

function message(role: AgentMessage["role"], content: AgentMessage["content"]): AgentMessage {
  return { role, content };
}

describe("context builder", () => {
  it("returns only the exact current user message when history is empty", () => {
    expect(buildContextMessages([], "do the thing")).toEqual([
      { role: "user", content: "do the thing" },
    ]);
  });

  it("preserves short history before appending the current user message", () => {
    const history = [
      message("user", "hello"),
      message("assistant", "hi"),
    ];

    expect(buildContextMessages(history, "next")).toEqual([
      ...history,
      { role: "user", content: "next" },
    ]);
  });

  it("compacts older history into one generated system message", () => {
    const history = Array.from({ length: 18 }, (_, index) =>
      message(index % 2 === 0 ? "user" : "assistant", `message ${index + 1}`),
    );

    const result = buildContextMessages(history, "current request");

    expect(result).toHaveLength(18);
    expect(result[0]).toMatchObject({ role: "system" });
    expect(result[0].content).toContain("Previous conversation compacted");
    expect(result[0].content).toContain("message 1");
    expect(result[0].content).toContain("message 2");
    expect(result[1]).toEqual(history[2]);
    expect(result.at(-1)).toEqual({ role: "user", content: "current request" });
  });

  it("caps oversized projected tool output with head and tail preservation", () => {
    const toolOutput =
      "[Tool: runCommand({})] [Completed]\n" +
      "A".repeat(200) +
      "middle" +
      "Z".repeat(200);

    const result = buildContextMessages(
      [message("assistant", toolOutput)],
      "current",
      { toolMessageCharLimit: 120 },
    );

    const content = String(result[0].content);
    expect(content.length).toBeLessThanOrEqual(120);
    expect(content).toContain("[Tool: runCommand");
    expect(content).toContain("omitted");
    expect(content.endsWith("Z".repeat(10))).toBe(true);
  });

  it("keeps the current user content exact, last, and untruncated", () => {
    const current = "CURRENT ".repeat(2_000);
    const history = [message("assistant", "A".repeat(1_000))];

    const result = buildContextMessages(history, current, {
      normalMessageCharLimit: 80,
    });

    expect(result.at(-1)).toEqual({ role: "user", content: current });
    expect(String(result[0].content).length).toBeLessThanOrEqual(80);
  });

  it("converts array-style message content by joining text parts", () => {
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      },
    ];

    expect(buildContextMessages(history, "current")).toEqual([
      { role: "assistant", content: "first\nsecond" },
      { role: "user", content: "current" },
    ]);
  });
});
