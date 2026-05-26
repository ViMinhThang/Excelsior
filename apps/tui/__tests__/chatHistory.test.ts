import { createElement } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { ProjectedBlock } from "@excelsior/core";
import ChatHistory from "../src/components/chat/ChatHistory.js";

function rootToolBlock(): ProjectedBlock {
  return {
    type: "tool-call",
    id: "tool_root",
    toolName: "view",
    toolArgs: JSON.stringify({ filePath: "README.md" }),
    status: "completed",
    content: "README contents",
    timestamp: "2026-05-18T00:00:00.000Z",
  };
}

function subAgentBlock(): ProjectedBlock {
  const toolArgs = JSON.stringify({ directoryPath: "packages" });
  return {
    type: "sub-agent",
    id: "sub_1",
    role: "reviewer",
    timestamp: "2026-05-18T00:00:00.000Z",
    state: {
      status: "done",
      latestLine: "checked package layout",
      fullOutput: "checked package layout",
      toolCalls: [{
        toolCallId: "sub_tool_1",
        toolName: "ls",
        toolArgs,
        status: "completed",
      }],
      parts: [{
        type: "tool-call",
        toolCallId: "sub_tool_1",
        toolName: "ls",
        toolArgs,
        status: "completed",
      }],
    },
  };
}

describe("ChatHistory command expansion", () => {
  it("shows collapsed summaries for tool calls and sub-agent counts by default, and expanded details when commandsExpanded is true", () => {
    const blocks = [rootToolBlock(), subAgentBlock()];

    const collapsed = render(createElement(ChatHistory, { blocks, commandsExpanded: false }));
    const collapsedFrame = collapsed.lastFrame() ?? "";
    expect(collapsedFrame).toContain("read README.md");
    expect(collapsedFrame).toContain("(Ctrl+O to expand)");
    expect(collapsedFrame).not.toContain("README contents");
    expect(collapsedFrame).toContain("reviewer");
    expect(collapsedFrame).toContain("1 tool call");

    const expanded = render(createElement(ChatHistory, {
      blocks,
      commandsExpanded: true,
    }));
    const expandedFrame = expanded.lastFrame() ?? "";
    expect(expandedFrame).toContain("read README.md");
    expect(expandedFrame).toContain("Read 1 lines");
    expect(expandedFrame).toContain("0 files, 0 folders");
    expect(expandedFrame).not.toContain("README contents");
  });
});
