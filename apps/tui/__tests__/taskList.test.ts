import { createElement } from "react";
import { describe, expect, it } from "vitest";
import TaskList from "../src/components/chat/TaskList.js";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";

describe("TaskList", () => {
  it("renders projected task state for the sticky input area", async () => {
    const screen = await renderTui(createElement(TaskList, {
      tasks: [
        { id: "plan", text: "Create implementation tasks", status: "done" },
        { id: "edit", text: "Apply code changes", status: "in-progress" },
        { id: "verify", text: "Run tests", status: "todo" },
      ],
    }));

    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("Tasks");
    expect(frame).toContain("[x]");
    expect(frame).toContain("[/]");
    expect(frame).toContain("[ ]");
    expect(frame).toContain("Apply code changes");
  });
});
