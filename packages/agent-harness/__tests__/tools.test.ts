import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import {
  createBuiltInTools,
  type HarnessSettings,
  type LspClient,
  type ToolActions,
  type ToolEnv,
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

function makeEnv(partial: Partial<ToolEnv> = {}): ToolEnv {
  return {
    workspaceRoot: process.cwd(),
    mode: "act",
    emit: (() => undefined) as unknown as ToolEnv["emit"],
    settings: defaultSettings(),
    backupDir: join(tmpdir(), "excelsior-backup"),
    ...partial,
  };
}

function defaultSettings(): HarnessSettings {
  return {
    deepseekApiKey: "",
    githubToken: "",
    agentToolLoopSteps: "unlimited",
    autoReflectionEnabled: false,
  };
}

function makeActions(partial: Partial<ToolActions> = {}): ToolActions {
  return {
    confirm: async () => ({ callId: "", approved: true }),
    askQuestion: async () => ({
      callId: "",
      answer: "",
      isManual: false,
      cancelled: true,
    }),
    ...partial,
  };
}

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
    const env = makeEnv({ workspaceRoot, mode: "plan" });
    const actions = makeActions({ confirm });
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

    const writeResult = await writeFile?.execute({ filePath: "new.txt", content: "x" }, env, actions);
    const writeAliasResult = await write?.execute({ filePath: "alias.txt", content: "x" }, env, actions);
    const editResult = await editFile?.execute({ filePath: "new.txt", oldText: "x", newText: "y" }, env, actions);
    const editAliasResult = await edit?.execute({ filePath: "new.txt", oldText: "x", newText: "y" }, env, actions);
    const runResult = await runCommand?.execute({ command: "mkdir", args: ["new-dir"] }, env, actions);

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
    const env = makeEnv({ workspaceRoot, mode: "act" });
    const actions = makeActions({ confirm });
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const result = await write?.execute({
      filePath: outsideFile,
      content: "outside",
    }, env, actions);

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
    const env = makeEnv({ workspaceRoot, mode: "act" });
    const actions = makeActions({ confirm });
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const created = await write?.execute({
      filePath: "created.ts",
      content: "export const x = 1;",
    }, env, actions);
    expect(created?.content).toContain("Successfully wrote");
    expect(created?.content).toContain("--- created.ts");
    expect(created?.content).toContain("+++ created.ts");
    expect(created?.content).toContain("+export const x = 1;");

    const overwritten = await write?.execute({
      filePath: "created.ts",
      content: "export const x = 2;",
    }, env, actions);
    expect(overwritten?.content).toContain("-export const x = 1;");
    expect(overwritten?.content).toContain("+export const x = 2;");
  });

  it("appends LSP diagnostics when viewing a TypeScript file", async () => {
    const workspaceRoot = await makeTempDir();
    await writeFile(join(workspaceRoot, "demo.ts"), "const value: string = 1;", "utf-8");
    const lsp = fakeLsp("LSP diagnostics for demo.ts:\n- error typescript 1:7 Type 'number' is not assignable to type 'string'.");
    const env = makeEnv({ workspaceRoot, mode: "act", lsp });
    const actions = makeActions();
    const view = createBuiltInTools().find((tool) => tool.name === "view");

    const result = await view?.execute({ filePath: "demo.ts" }, env, actions);

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
    const env = makeEnv({ workspaceRoot, mode: "act", lsp });
    const actions = makeActions();
    const tools = createBuiltInTools();
    const write = tools.find((tool) => tool.name === "write");
    const edit = tools.find((tool) => tool.name === "edit");

    const written = await write?.execute({
      filePath: "demo.ts",
      content: "let value = 1;",
    }, env, actions);
    const edited = await edit?.execute({
      filePath: "demo.ts",
      oldText: "let value = 1;",
      newText: "const value = 1;",
    }, env, actions);

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
    const env = makeEnv({ workspaceRoot, mode: "act", lsp });
    const actions = makeActions();
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const result = await write?.execute({
      filePath: "notes.txt",
      content: "plain",
    }, env, actions);

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
    const env = makeEnv({
      workspaceRoot,
      mode: "act",
      settings: {
        ...defaultSettings(),
        autoApproveWorkspaceEdits: true,
      },
    });
    const actions = makeActions({ confirm });
    const write = createBuiltInTools().find((tool) => tool.name === "write");

    const result = await write?.execute({
      filePath: "inside.txt",
      content: "inside",
    }, env, actions);

    expect(result?.content).toContain("Successfully wrote");
    expect(await readFile(join(workspaceRoot, "inside.txt"), "utf-8")).toBe("inside");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("emits task updates from the updateTasks tool", async () => {
    const workspaceRoot = await makeTempDir();
    const emit = vi.fn();
    const env = makeEnv({ workspaceRoot, mode: "act", emit: emit as unknown as ToolEnv["emit"] });
    const actions = makeActions();
    const updateTasks = createBuiltInTools().find((tool) => tool.name === "updateTasks");

    const result = await updateTasks?.execute({
      tasks: [{ id: "one", text: "Do one thing", status: "in-progress" }],
    }, env, actions);

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
    const env = makeEnv({ workspaceRoot, mode: "act" });
    const actions = makeActions({ confirm });
    const edit = createBuiltInTools().find((tool) => tool.name === "edit");

    const result = await edit?.execute({
      filePath: "test.txt",
      oldText: "before block after",
      newText: "before updated after",
    }, env, actions);

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
    const env = makeEnv({ workspaceRoot, mode: "act", backupDir: "" });
    const actions = makeActions({ confirm });
    const edit = createBuiltInTools().find((tool) => tool.name === "edit");

    const result = await edit?.execute({
      filePath: outsideFile,
      oldText: "before",
      newText: "after",
    }, env, actions);

    expect(result?.content).toContain(outsideFile);
    expect(await readFile(outsideFile, "utf-8")).toBe("after");
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      action: "warning",
      filePath: outsideFile,
      warning: expect.stringContaining("outside the workspace"),
    }));
  });
});
