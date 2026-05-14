import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createViewTool } from "../agent/tools/fs/view.js";
import { createWriteTool } from "../agent/tools/fs/write.js";
import { createRipgrepTool } from "../agent/tools/fs/ripgrep.js";
import { createGlobTool } from "../agent/tools/fs/glob.js";
import type { ToolContext } from "../lib/tool/context.js";

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

  it("rejects glob and ripgrep patterns that escape the workspace", async () => {
    const globResult = await (createGlobTool(ctx()) as any).execute({ pattern: "../*.txt" });
    const grepResult = await (createRipgrepTool(ctx()) as any).execute({ query: "secret", pathPattern: "../**/*" });

    expect(globResult).toContain("outside the workspace");
    expect(grepResult).toContain("outside the workspace");
  });
});
