import { describe, expect, it } from "vitest";
import { mapMessagesToAIHistory } from "../tui/hooks/useChatSenderUtils.js";
import { Message } from "../types.js";

describe("mapMessagesToAIHistory", () => {
  it("maps persisted tool-call messages to schema-safe assistant summaries", () => {
    const messages: Message[] = [
      { id: "u1", role: "user", content: "call a tool" },
      {
        id: "t1",
        role: "tool-call",
        content: '"Found 2 files:\\nREADME.md\\nsrc/"',
        toolCall: {
          toolName: "listFiles",
          toolArgs: JSON.stringify({ directory: ".", recursive: false }),
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
            toolName: "listFiles",
            toolArgs: JSON.stringify({ directory: "." }),
            toolCallId: "call_1",
            status: "completed",
          },
        ],
      },
    ];

    const history = mapMessagesToAIHistory(messages);

    expect(history).toEqual([
      { role: "user", content: "call a tool" },
      {
        role: "assistant",
        content: "[Tool success: List files - . (found 2 files)]\n  Found 2 files:\n  README.md\n  src/",
      },
      { role: "assistant", content: "Done." },
    ]);
    expect(history.some((message: any) => message.role === "tool")).toBe(false);
    expect((history[2] as any).tool_calls).toBeUndefined();
  });
});
