import { describe, expect, it } from "vitest";
import { buildAiHistory, turnToTranscriptBlocks } from "@excelsior/engine";
import type { RunTurn } from "@excelsior/engine";
import type { SessionState, TranscriptBlock } from "@excelsior/protocol";

function session(blocks: TranscriptBlock[]): SessionState {
  return {
    session: {
      id: "s1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: { userInput: "t" },
    },
    blocks,
    interaction: { confirmation: null, question: null },
    lastTurnId: "t1",
  };
}

function block(id: string, kind: TranscriptBlock["kind"], content: string, tool?: TranscriptBlock["tool"]): TranscriptBlock {
  const now = Date.now();
  return {
    id,
    turnId: "t1",
    kind,
    role: kind === "user" || kind === "assistant" ? kind : undefined,
    content,
    tool,
    status: "completed",
    createdAt: now,
    finalizedAt: now,
  };
}

function activeTurn(): RunTurn {
  return {
    id: "t2",
    sessionId: "s1",
    status: "running",
    userContent: "current request",
    steps: [
      { id: "step_1", modelOutput: "thinking...", toolCalls: [] },
      {
        id: "step_2",
        modelOutput: "",
        toolCalls: [
          { id: "c1", toolName: "view", args: { path: "a.ts" }, status: "done", result: "file content", isError: false },
        ],
      },
    ],
    blocks: [],
    startedAt: Date.now(),
  };
}

describe("buildAiHistory", () => {
  it("maps committed blocks into model messages", () => {
    const state = session([
      block("u1", "user", "hello"),
      block("a1", "assistant", "hi"),
      block(
        "t1",
        "tool-call",
        "file content",
        {
          id: "c1",
          toolName: "view",
          args: "{}",
          result: "file content",
          isError: false,
          status: "completed",
          startedAt: 1,
          endedAt: 2,
        },
      ),
    ]);

    const messages = buildAiHistory(state, null);
    expect(messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "view", arguments: "{}" },
          },
        ],
      },
      { role: "tool", content: "file content", tool_call_id: "c1" },
    ]);
  });

  it("appends the active turn with tool calls and results", () => {
    const state = session([]);
    const messages = buildAiHistory(state, activeTurn());
    expect(messages).toEqual([
      { role: "user", content: "current request" },
      { role: "assistant", content: "thinking..." },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "view", arguments: JSON.stringify({ path: "a.ts" }) },
          },
        ],
      },
      { role: "tool", content: "file content", tool_call_id: "c1" },
    ]);
  });
});

describe("turnToTranscriptBlocks", () => {
  it("converts a completed turn into user/assistant/tool blocks", () => {
    const turn: RunTurn = {
      id: "t1",
      sessionId: "s1",
      status: "committed",
      userContent: "do it",
      steps: [
        {
          id: "s1",
          modelOutput: "ok",
          toolCalls: [
            { id: "c1", toolName: "edit", args: "{}", status: "done", result: "saved", isError: false, startedAt: 10, endedAt: 20 },
          ],
        },
      ],
      blocks: [
        { id: "assistant_t1", turnId: "t1", kind: "assistant", content: "ok" },
        { id: "c1", turnId: "t1", kind: "tool-call", content: "", tool: { id: "c1", toolName: "edit" } },
      ],
      startedAt: 5,
    };

    const blocks = turnToTranscriptBlocks(turn);
    expect(blocks.map((b) => b.kind)).toEqual(["user", "assistant", "tool-call"]);
    expect(blocks[0]).toMatchObject({ kind: "user", content: "do it", status: "completed" });
    expect(blocks[1]).toMatchObject({ kind: "assistant", content: "ok", status: "completed" });
    expect(blocks[2].tool).toMatchObject({ id: "c1", toolName: "edit", result: "saved", status: "completed" });
  });
});
