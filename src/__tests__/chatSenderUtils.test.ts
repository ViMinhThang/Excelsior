import { describe, expect, it } from "vitest";
import { mapMessagesToAIHistory } from "../tui/hooks/useChatSenderUtils.js";
import { Message } from "../types.js";

describe("mapMessagesToAIHistory", () => {
  it("maps persisted tool-call messages to schema-safe assistant summaries", () => {
    const messages: Message[] = [
      { id: "u1", role: "user", content: "list the directory" },
      {
        id: "t1",
        role: "tool-call",
        content: "README.md\nsrc/\npackage.json",
        toolCall: {
          toolName: "runCommand",
          toolArgs: JSON.stringify({ command: "ls -la" }),
          toolCallId: "call_1",
          status: "completed",
        },
      },
      {
        id: "a1",
        role: "assistant",
        content: "Done.",
        toolCalls: [
          {
            toolName: "runCommand",
            toolArgs: JSON.stringify({ command: "ls" }),
            toolCallId: "call_1",
            status: "completed",
          },
        ],
      },
    ];

    const history = mapMessagesToAIHistory(messages);

    expect(history).toEqual([
      { role: "user", content: "list the directory" },
      {
        role: "assistant",
        content: "[Tool success: Run command - ls -la]\n  README.md\n  src/\n  package.json",
      },
      { role: "assistant", content: "Done." },
    ]);
    expect(history.some((message: any) => message.role === "tool")).toBe(false);
    expect((history[2] as any).tool_calls).toBeUndefined();
  });
});
