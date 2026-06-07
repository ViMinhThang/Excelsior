import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCompactionNotice,
  buildCompactionSummary,
  buildRunContext,
  loadProjectInstructions,
  revertLastCompletedTurn,
  toModelMessages,
} from "@excelsior/agent-harness";
import {
  MESSAGE_END,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TURN_END,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventType,
} from "../src/events.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-context-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function event<T extends HarnessEventType>(
  sequence: number,
  type: T,
  data: HarnessEventDataMap[T],
  turnId = "turn_test",
): AnyHarnessEvent {
  return makeHarnessEvent({
    workspaceId: "ws_test",
    sessionId: "ses_test",
    runId: "run_test",
    turnId,
    sequence,
    type,
    data,
  }) as AnyHarnessEvent;
}

describe("harness context helpers", () => {
  it("loads root AGENTS.md and includes it in run context", async () => {
    const workspaceRoot = await makeTempDir();
    await writeFile(join(workspaceRoot, "AGENTS.md"), "Prefer rg before broader file scans.\n", "utf8");

    const instructions = loadProjectInstructions(workspaceRoot);
    const context = buildRunContext({
      events: [],
      userContent: "inspect the repo",
      mode: "plan",
      skillsList: "- diagnose: Debug failures",
      projectInstructions: instructions?.content,
    });

    expect(instructions?.path.endsWith("AGENTS.md")).toBe(true);
    expect(context.systemPrompt).toContain("## Project Instructions");
    expect(context.systemPrompt).toContain("Minimize emoji");
    expect(context.systemPrompt).toContain("Prefer rg before broader file scans.");
    expect(context.systemPrompt).toContain("## Available Agent Skills");
    expect(context.messages).toEqual([{ role: "user", content: "inspect the repo" }]);
  });

  it("builds compaction summaries without mutating source events", async () => {
    const events = [
      event(1, MESSAGE_END, {
        message: { id: "msg_user", role: "user", content: "original request" },
      }),
      event(2, MESSAGE_END, {
        message: { id: "msg_assistant", role: "assistant", content: "final answer" },
      }),
    ];

    const summary = await buildCompactionSummary(events);

    expect(summary).toContain("USER: original request");
    expect(summary).toContain("ASSISTANT: final answer");
    expect(buildCompactionNotice(summary)).toContain("Previous conversation compacted:");
    expect(events).toHaveLength(2);
  });

  it("trims the latest completed turn through the history helper", () => {
    const events = [
      event(1, MESSAGE_END, {
        message: { id: "msg_user_1", role: "user", content: "first" },
      }, "turn_one"),
      event(2, TURN_END, { cancelled: false }, "turn_one"),
      event(3, MESSAGE_END, {
        message: { id: "msg_user_2", role: "user", content: "second" },
      }, "turn_two"),
      event(4, TURN_END, { cancelled: false }, "turn_two"),
    ];

    const result = revertLastCompletedTurn(events);

    expect(result?.revertedTurnId).toBe("turn_two");
    expect(result?.events.map((item) => item.turnId)).toEqual(["turn_one", "turn_one"]);
    expect(events).toHaveLength(4);
  });

  it("reconstructs assistant tool calls before tool result messages in follow-up context", () => {
    const events = [
      event(1, MESSAGE_END, {
        message: { id: "msg_user", role: "user", content: "read package.json" },
      }),
      event(2, TOOL_EXECUTION_START, {
        toolCallId: "call_read",
        toolName: "view",
        toolArgs: "{\"filePath\":\"package.json\"}",
      }),
      event(3, TOOL_EXECUTION_END, {
        toolCallId: "call_read",
        toolName: "view",
        toolArgs: "{\"filePath\":\"package.json\"}",
        result: "{ \"name\": \"excelsior\" }",
        isError: false,
      }),
      event(4, MESSAGE_END, {
        message: {
          id: "msg_call_read",
          role: "tool",
          content: "{ \"name\": \"excelsior\" }",
          toolCallId: "call_read",
          toolName: "view",
          toolArgs: "{\"filePath\":\"package.json\"}",
        },
      }),
      event(5, TURN_END, { cancelled: false }),
    ];

    const context = buildRunContext({
      events,
      userContent: "now summarize it",
      mode: "act",
    });
    const modelMessages = toModelMessages(context.messages);
    const toolIndex = modelMessages.findIndex((message) => message.role === "tool");

    expect(toolIndex).toBeGreaterThan(0);
    expect(modelMessages[toolIndex - 1]).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_read",
          toolName: "view",
          input: { filePath: "package.json" },
        },
      ],
    });
  });
});
