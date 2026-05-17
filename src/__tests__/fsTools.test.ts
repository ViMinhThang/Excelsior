import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  authorizeToolAction,
  createEditTool,
  createGlobTool,
  createRipgrepTool,
  createViewTool,
  createWriteTool,
  executeTool,
  PLAN_MODE_BLOCKED_MESSAGE,
  type ToolContext,
} from "@excelsior/agent-host/testing/tools";

describe("tool authorization policy", () => {
  it("denies missing capabilities with a stable message", async () => {
    const result = await authorizeToolAction(
      { capabilities: new Set(["fs:read"]) },
      { toolName: "writeFile", capability: "fs:write", modePolicy: "write" },
    );

    expect(result).toEqual({ allowed: false, message: "Missing tool capability: fs:write" });
  });

  it("blocks write actions in plan mode", async () => {
    const result = await authorizeToolAction(
      { capabilities: new Set(["fs:write"]), mode: "plan" },
      { toolName: "writeFile", capability: "fs:write", modePolicy: "write" },
    );

    expect(result).toEqual({ allowed: false, message: PLAN_MODE_BLOCKED_MESSAGE });
  });

  it("requests confirmation only when a listener exists", async () => {
    const request = vi.fn(async () => false);
    const result = await authorizeToolAction(
      {
        capabilities: new Set(["fs:write"]),
        mode: "act",
        confirm: { getListenerCount: () => 0, request },
      },
      {
        toolName: "writeFile",
        capability: "fs:write",
        modePolicy: "write",
        confirmation: { toolName: "writeFile", args: "{}" },
      },
    );

    expect(result).toEqual({ allowed: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("returns denied when confirmation is rejected", async () => {
    const request = vi.fn(async () => false);
    const result = await authorizeToolAction(
      {
        capabilities: new Set(["fs:write"]),
        mode: "act",
        confirm: { getListenerCount: () => 1, request },
      },
      {
        toolName: "writeFile",
        capability: "fs:write",
        modePolicy: "write",
        confirmation: { toolName: "writeFile", args: "{}" },
      },
    );

    expect(result).toEqual({ allowed: false, message: "Denied by user." });
    expect(request).toHaveBeenCalledWith("writeFile", "{}", undefined);
  });
});

describe("filesystem tool workspace bounds", () => {
  let workspaceRoot: string;
  let outsideRoot: string;

  function ctx(): ToolContext {
    return {
      capabilities: new Set(["fs:read", "fs:write"]),
      workspaceRoot,
    };
  }

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-ws-"));
    outsideRoot = await mkdtemp(join(tmpdir(), "excelsior-outside-"));
    await writeFile(join(workspaceRoot, "inside.txt"), "needle\n", "utf-8");
    await writeFile(join(outsideRoot, "secret.txt"), "secret\n", "utf-8");
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  });

  it("allows reads inside the workspace", async () => {
    const result = await executeTool(createViewTool(ctx()), { filePath: "inside.txt" });
    expect(result).toContain("needle");
    expect(result).not.toContain("[File:");
  });

  it("enforces read capabilities for read-only tools", async () => {
    const readlessCtx: ToolContext = {
      capabilities: new Set(["fs:write"]),
      workspaceRoot,
    };

    const result = await executeTool(createViewTool(readlessCtx), {
      filePath: "inside.txt",
    });

    expect(result).toBe("Missing tool capability: fs:read");
  });

  it("rejects reads outside the workspace", async () => {
    const result = await executeTool(createViewTool(ctx()), {
      filePath: join(outsideRoot, "secret.txt"),
    });
    expect(result).toContain("outside the workspace");
  });

  it("validates write paths before requesting confirmation", async () => {
    const request = vi.fn(async () => true);
    const result = await executeTool(createWriteTool({
      ...ctx(),
      confirm: { getListenerCount: () => 1, request },
    }), { filePath: "../escape.txt", content: "x" });

    expect(result).toContain("outside the workspace");
    expect(request).not.toHaveBeenCalled();
  });

  it("blocks write and edit in plan mode", async () => {
    const planCtx: ToolContext = { ...ctx(), mode: "plan" };
    const writeResult = await executeTool(createWriteTool(planCtx), {
      filePath: "created.txt",
      content: "x",
    });
    const editResult = await executeTool(createEditTool(planCtx), {
      filePath: "inside.txt",
      oldText: "needle",
      newText: "changed",
    });

    expect(writeResult).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(editResult).toBe(PLAN_MODE_BLOCKED_MESSAGE);
  });

  it("includes a unified diff when confirming file creation", async () => {
    const request = vi.fn(async () => false);
    await executeTool(createWriteTool({
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    }), { filePath: "created.txt", content: "hello\n" });

    expect(request).toHaveBeenCalledWith(
      "writeFile",
      JSON.stringify({ filePath: "created.txt" }),
      expect.objectContaining({
        action: "create",
        filePath: "created.txt",
        diff: expect.stringContaining("+hello"),
      }),
    );
  });

  it("includes a unified diff when confirming edits after validating oldText", async () => {
    const request = vi.fn(async () => false);
    await executeTool(createEditTool({
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    }), { filePath: "inside.txt", oldText: "needle", newText: "changed" });

    expect(request).toHaveBeenCalledWith(
      "editFile",
      JSON.stringify({ filePath: "inside.txt" }),
      expect.objectContaining({
        action: "edit",
        filePath: "inside.txt",
        diff: expect.stringContaining("-needle"),
      }),
    );
  });

  it("applies approved writes and edits in act mode", async () => {
    const request = vi.fn(async () => true);
    const confirmedCtx: ToolContext = {
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    };

    const writeResult = await executeTool(createWriteTool(confirmedCtx), {
      filePath: "created.txt",
      content: "hello\n",
    });
    const editResult = await executeTool(createEditTool(confirmedCtx), {
      filePath: "created.txt",
      oldText: "hello",
      newText: "changed",
    });

    expect(writeResult).toContain("Successfully wrote");
    expect(editResult).toContain("Successfully replaced");
    await expect(readFile(join(workspaceRoot, "created.txt"), "utf-8")).resolves.toBe("changed\n");
  });

  it("does not request edit confirmation when oldText is missing", async () => {
    const request = vi.fn(async () => true);
    const result = await executeTool(createEditTool({
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    }), { filePath: "inside.txt", oldText: "missing", newText: "changed" });

    expect(result).toContain("oldText");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects glob and ripgrep patterns that escape the workspace", async () => {
    const globResult = await executeTool(createGlobTool(ctx()), { pattern: "../*.txt" });
    const grepResult = await executeTool(createRipgrepTool(ctx()), {
      query: "secret",
      pathPattern: "../**/*",
    });

    expect(globResult).toContain("outside the workspace");
    expect(grepResult).toContain("outside the workspace");
  });
});
