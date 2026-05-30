import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FileCheckpoint } from "@excelsior/agent-host/testing/tools";

describe("FileCheckpoint", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-checkpoint-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("captures original content only once per turn", async () => {
    const checkpoint = new FileCheckpoint();
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");

    checkpoint.beginTurn("ses_1", "run_1");
    await checkpoint.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "first edit", "utf-8");
    checkpoint.recordWrite("demo.txt", fullPath, "first edit");
    await checkpoint.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "second edit", "utf-8");
    checkpoint.recordWrite("demo.txt", fullPath, "second edit");
    checkpoint.completeTurn("ses_1", "run_1");

    const result = await checkpoint.restoreLatest();

    expect(result.conflicts).toEqual([]);
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("original");
  });

  it("restores created files by deleting them", async () => {
    const checkpoint = new FileCheckpoint();
    const fullPath = join(workspaceRoot, "created.txt");

    checkpoint.beginTurn("ses_1", "run_1");
    await checkpoint.captureBeforeWrite("created.txt", fullPath);
    await writeFile(fullPath, "created", "utf-8");
    checkpoint.recordWrite("created.txt", fullPath, "created");
    checkpoint.completeTurn("ses_1", "run_1");

    const result = await checkpoint.restoreLatest();

    expect(result.conflicts).toEqual([]);
    await expect(readFile(fullPath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports conflicts without overwriting later user edits", async () => {
    const checkpoint = new FileCheckpoint();
    const fullPath = join(workspaceRoot, "demo.txt");
    await writeFile(fullPath, "original", "utf-8");

    checkpoint.beginTurn("ses_1", "run_1");
    await checkpoint.captureBeforeWrite("demo.txt", fullPath);
    await writeFile(fullPath, "agent edit", "utf-8");
    checkpoint.recordWrite("demo.txt", fullPath, "agent edit");
    checkpoint.completeTurn("ses_1", "run_1");
    await writeFile(fullPath, "user edit", "utf-8");

    const result = await checkpoint.restoreLatest();

    expect(result.conflicts).toEqual([
      expect.objectContaining({ filePath: "demo.txt" }),
    ]);
    await expect(readFile(fullPath, "utf-8")).resolves.toBe("user edit");
  });
});
