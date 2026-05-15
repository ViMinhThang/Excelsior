import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createViewTool } from "../../packages/agent-host/src/agent/tools/fs/view.js";
import { createWriteTool } from "../../packages/agent-host/src/agent/tools/fs/write.js";
import { createEditTool } from "../../packages/agent-host/src/agent/tools/fs/edit.js";
import { createRipgrepTool } from "../../packages/agent-host/src/agent/tools/fs/ripgrep.js";
import { createGlobTool } from "../../packages/agent-host/src/agent/tools/fs/glob.js";
import type { ToolContext } from "../../packages/agent-host/src/lib/tool/context.js";
import { PLAN_MODE_BLOCKED_MESSAGE } from "../../packages/agent-host/src/lib/runtime/agentMode.js";

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
    const result = await (createViewTool(ctx()) as any).execute({ filePath: "inside.txt" });
    expect(result).toContain("needle");
    expect(result).not.toContain("[File:");
  });

  it("rejects reads outside the workspace", async () => {
    const result = await (createViewTool(ctx()) as any).execute({ filePath: join(outsideRoot, "secret.txt") });
    expect(result).toContain("outside the workspace");
  });

  it("validates write paths before requesting confirmation", async () => {
    const request = vi.fn(async () => true);
    const result = await (createWriteTool({
      ...ctx(),
      confirm: { getListenerCount: () => 1, request },
    }) as any).execute({ filePath: "../escape.txt", content: "x" });

    expect(result).toContain("outside the workspace");
    expect(request).not.toHaveBeenCalled();
  });

  it("blocks write and edit in plan mode", async () => {
    const planCtx: ToolContext = { ...ctx(), mode: "plan" };
    const writeResult = await (createWriteTool(planCtx) as any).execute({
      filePath: "created.txt",
      content: "x",
    });
    const editResult = await (createEditTool(planCtx) as any).execute({
      filePath: "inside.txt",
      oldText: "needle",
      newText: "changed",
    });

    expect(writeResult).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    expect(editResult).toBe(PLAN_MODE_BLOCKED_MESSAGE);
  });

  it("includes a unified diff when confirming file creation", async () => {
    const request = vi.fn(async () => false);
    await (createWriteTool({
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    }) as any).execute({ filePath: "created.txt", content: "hello\n" });

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
    await (createEditTool({
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    }) as any).execute({ filePath: "inside.txt", oldText: "needle", newText: "changed" });

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

  it("does not request edit confirmation when oldText is missing", async () => {
    const request = vi.fn(async () => true);
    const result = await (createEditTool({
      ...ctx(),
      mode: "act",
      confirm: { getListenerCount: () => 1, request },
    }) as any).execute({ filePath: "inside.txt", oldText: "missing", newText: "changed" });

    expect(result).toContain("oldText");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects glob and ripgrep patterns that escape the workspace", async () => {
    const globResult = await (createGlobTool(ctx()) as any).execute({ pattern: "../*.txt" });
    const grepResult = await (createRipgrepTool(ctx()) as any).execute({ query: "secret", pathPattern: "../**/*" });

    expect(globResult).toContain("outside the workspace");
    expect(grepResult).toContain("outside the workspace");
  });
});
