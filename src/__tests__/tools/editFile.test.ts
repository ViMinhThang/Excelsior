import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { editFileTool } from "../../agent/tools/editFile/editFile.js";

const TEST_DIR = join(process.cwd(), ".test-temp-edit");
const TEST_FILE = join(TEST_DIR, "edit.txt");

describe("editFileTool", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("replaces one exact match", async () => {
    await writeFile(TEST_FILE, "alpha\nbeta\ngamma\n", "utf-8");
    const result = await editFileTool.execute!(
      { path: ".test-temp-edit/edit.txt", search: "beta", replace: "delta" },
      {} as any,
    );

    expect(result).toContain("Successfully edited");
    await expect(readFile(TEST_FILE, "utf-8")).resolves.toBe("alpha\ndelta\ngamma\n");
  });

  it("fails when search text is missing", async () => {
    await writeFile(TEST_FILE, "alpha\n", "utf-8");
    const result = await editFileTool.execute!(
      { path: ".test-temp-edit/edit.txt", search: "beta", replace: "delta" },
      {} as any,
    );

    expect(result).toContain("search text not found");
  });

  it("fails when search text matches more than once", async () => {
    await writeFile(TEST_FILE, "alpha\nalpha\n", "utf-8");
    const result = await editFileTool.execute!(
      { path: ".test-temp-edit/edit.txt", search: "alpha", replace: "delta" },
      {} as any,
    );

    expect(result).toContain("matched more than once");
  });

  it("rejects paths outside the workspace", async () => {
    const result = await editFileTool.execute!(
      { path: "../outside.txt", search: "x", replace: "y" },
      {} as any,
    );

    expect(result).toContain("escapes workspace");
  });
});
