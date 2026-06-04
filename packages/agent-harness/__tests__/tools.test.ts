import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import {
  createBuiltInTools,
  type ToolExecutionContext,
} from "@excelsior/agent-harness";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-harness-tools-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("built-in harness tools", () => {
  it("blocks write-like tools in Plan mode before confirmation", async () => {
    const workspaceRoot = await makeTempDir();
    const confirm = vi.fn();
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "plan",
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const tools = createBuiltInTools();
    const writeFile = tools.find((tool) => tool.name === "writeFile");
    const write = tools.find((tool) => tool.name === "write");
    const editFile = tools.find((tool) => tool.name === "editFile");
    const edit = tools.find((tool) => tool.name === "edit");
    const runCommand = tools.find((tool) => tool.name === "runCommand");

    expect(writeFile).toBeDefined();
    expect(write).toBeDefined();
    expect(editFile).toBeDefined();
    expect(edit).toBeDefined();
    expect(runCommand).toBeDefined();

    const writeResult = await writeFile?.execute({ filePath: "new.txt", content: "x" }, ctx);
    const writeAliasResult = await write?.execute({ filePath: "alias.txt", content: "x" }, ctx);
    const editResult = await editFile?.execute({ filePath: "new.txt", oldText: "x", newText: "y" }, ctx);
    const editAliasResult = await edit?.execute({ filePath: "new.txt", oldText: "x", newText: "y" }, ctx);
    const runResult = await runCommand?.execute({ command: "mkdir", args: ["new-dir"] }, ctx);

    expect(writeResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(writeAliasResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(editResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(editAliasResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(runResult?.content).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(confirm).not.toHaveBeenCalled();
  });
});
