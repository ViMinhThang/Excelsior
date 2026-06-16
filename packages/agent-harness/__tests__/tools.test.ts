import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import {
  createBuiltInTools,
  type LspClient,
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
  function fakeLsp(result: string | null): LspClient {
    return {
      syncTouchedFile: vi.fn(async () => result),
      dispose: vi.fn(),
    };
  }

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

  it("asks for review instead of throwing for writes outside the workspace", async () => {
    const workspaceRoot = await makeTempDir();
    const outsideRoot = await makeTempDir();
    const outsideFile = join(outsideRoot, "outside.txt");
    const confirm = vi.fn(async (request) => ({
      callId: request.toolName,
      approved: false,
    }));
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const result = await write?.execute({
      filePath: outsideFile,
      content: "outside",
    }, ctx);

    expect(result?.content).toBe("Denied by user.");
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      action: "warning",
      filePath: outsideFile,
      warning: expect.stringContaining("outside the workspace"),
    }));
  });

  it("returns a unified diff for completed writes", async () => {
    const workspaceRoot = await makeTempDir();
    const confirm = vi.fn(async (request) => ({
      callId: request.toolName,
      approved: true,
    }));
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const created = await write?.execute({
      filePath: "created.ts",
      content: "export const x = 1;",
    }, ctx);
    expect(created?.content).toContain("Successfully wrote");
    expect(created?.content).toContain("--- created.ts");
    expect(created?.content).toContain("+++ created.ts");
    expect(created?.content).toContain("+export const x = 1;");

    const overwritten = await write?.execute({
      filePath: "created.ts",
      content: "export const x = 2;",
    }, ctx);
    expect(overwritten?.content).toContain("-export const x = 1;");
    expect(overwritten?.content).toContain("+export const x = 2;");
  });

  it("appends LSP diagnostics when viewing a TypeScript file", async () => {
    const workspaceRoot = await makeTempDir();
    await writeFile(join(workspaceRoot, "demo.ts"), "const value: string = 1;", "utf-8");
    const lsp = fakeLsp("LSP diagnostics for demo.ts:\n- error typescript 1:7 Type 'number' is not assignable to type 'string'.");
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      lsp,
      confirm: async () => ({ callId: "confirm", approved: true }),
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const view = createBuiltInTools().find((tool) => tool.name === "view");

    const result = await view?.execute({ filePath: "demo.ts" }, ctx);

    expect(result?.content).toContain("1: const value: string = 1;");
    expect(result?.content).toContain("LSP diagnostics for demo.ts:");
    expect(lsp.syncTouchedFile).toHaveBeenCalledWith({
      filePath: "demo.ts",
      content: "const value: string = 1;",
      abortSignal: undefined,
    });
  });

  it("appends LSP diagnostics after writing and editing TypeScript files", async () => {
    const workspaceRoot = await makeTempDir();
    const lsp = fakeLsp("LSP diagnostics for demo.ts:\n- warning typescript 1:1 Prefer const.");
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      lsp,
      confirm: async () => ({ callId: "confirm", approved: true }),
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const tools = createBuiltInTools();
    const write = tools.find((tool) => tool.name === "write");
    const edit = tools.find((tool) => tool.name === "edit");

    const written = await write?.execute({
      filePath: "demo.ts",
      content: "let value = 1;",
    }, ctx);
    const edited = await edit?.execute({
      filePath: "demo.ts",
      oldText: "let value = 1;",
      newText: "const value = 1;",
    }, ctx);

    expect(written?.content).toContain("LSP diagnostics for demo.ts:");
    expect(edited?.content).toContain("LSP diagnostics for demo.ts:");
    expect(lsp.syncTouchedFile).toHaveBeenCalledTimes(2);
    expect(lsp.syncTouchedFile).toHaveBeenLastCalledWith({
      filePath: "demo.ts",
      content: "const value = 1;",
      abortSignal: undefined,
    });
  });

  it("does not append LSP output for non-TypeScript files when the manager is quiet", async () => {
    const workspaceRoot = await makeTempDir();
    const lsp = fakeLsp(null);
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      lsp,
      confirm: async () => ({ callId: "confirm", approved: true }),
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const result = await write?.execute({
      filePath: "notes.txt",
      content: "plain",
    }, ctx);

    expect(result?.content).toContain("Successfully wrote");
    expect(result?.content).not.toContain("LSP diagnostics");
    expect(lsp.syncTouchedFile).toHaveBeenCalledWith({
      filePath: "notes.txt",
      content: "plain",
      abortSignal: undefined,
    });
  });


  it("auto-approves workspace edits when the workspace toggle is enabled", async () => {
    const workspaceRoot = await makeTempDir();
    const confirm = vi.fn();
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      settings: {
        deepseekApiKey: "",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
        autoApproveWorkspaceEdits: true,
      },
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const result = await write?.execute({
      filePath: "inside.txt",
      content: "inside",
    }, ctx);

    expect(result?.content).toContain("Successfully wrote");
    expect(await readFile(join(workspaceRoot, "inside.txt"), "utf-8")).toBe("inside");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("emits task updates from the updateTasks tool", async () => {
    const workspaceRoot = await makeTempDir();
    const emit = vi.fn();
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      emit,
      confirm: async () => ({ callId: "confirm", approved: true }),
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const updateTasks = createBuiltInTools().find((tool) => tool.name === "updateTasks");

    const result = await updateTasks?.execute({
      tasks: [{ id: "one", text: "Do one thing", status: "in-progress" }],
    }, ctx);

    expect(result?.content).toBe("Updated 1 tasks.");
    expect(emit).toHaveBeenCalledWith("tasks_updated", {
      tasks: [{ id: "one", text: "Do one thing", status: "in-progress" }],
    });
  });

  it("returns a unified diff for completed edits", async () => {
    const workspaceRoot = await makeTempDir();
    const target = join(workspaceRoot, "test.txt");
    await writeFile(target, "before block after", "utf-8");
    const confirm = vi.fn(async (request) => ({
      callId: request.toolName,
      approved: true,
    }));
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const edit = createBuiltInTools().find((tool) => tool.name === "edit");

    const result = await edit?.execute({
      filePath: "test.txt",
      oldText: "before block after",
      newText: "before updated after",
    }, ctx);

    expect(result?.content).toContain("Successfully replaced the block in test.txt.");
    expect(result?.content).toContain("--- test.txt");
    expect(result?.content).toContain("-before block after");
    expect(result?.content).toContain("+before updated after");
    expect(await readFile(target, "utf-8")).toBe("before updated after");
  });

  it("edits outside the workspace only after warning approval", async () => {
    const workspaceRoot = await makeTempDir();
    const outsideRoot = await makeTempDir();
    const outsideFile = join(outsideRoot, "outside-edit.txt");
    await writeFile(outsideFile, "before", "utf-8");
    const confirm = vi.fn(async (request) => ({
      callId: request.toolName,
      approved: true,
    }));
    const ctx: ToolExecutionContext = {
      workspaceRoot,
      mode: "act",
      confirm,
      askQuestion: async () => ({
        callId: "question",
        answer: "",
        isManual: true,
        cancelled: true,
      }),
      sendSubAgent: async () => "sub-agent result",
    };
    const edit = createBuiltInTools().find((tool) => tool.name === "edit");

    const result = await edit?.execute({
      filePath: outsideFile,
      oldText: "before",
      newText: "after",
    }, ctx);

    expect(result?.content).toContain(outsideFile);
    expect(await readFile(outsideFile, "utf-8")).toBe("after");
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      action: "warning",
      filePath: outsideFile,
      warning: expect.stringContaining("outside the workspace"),
    }));
  });
});
