import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { searchFilesTool } from "../../agent/tools/searchFiles/searchFiles.js";

const TEST_DIR = join(process.cwd(), ".test-temp-search");

describe("searchFilesTool", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(join(TEST_DIR, "one.ts"), "const target = 1;\n", "utf-8");
    await writeFile(join(TEST_DIR, "two.txt"), "target text\n", "utf-8");
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("finds matching files", async () => {
    const result = await searchFilesTool.execute!(
      { query: "target", directory: ".test-temp-search", maxResults: 10 },
      {} as any,
    );

    expect(result).toContain("one.ts");
    expect(result).toContain("two.txt");
  });

  it("honors filePattern", async () => {
    const result = await searchFilesTool.execute!(
      {
        query: "target",
        directory: ".test-temp-search",
        filePattern: "*.ts",
        maxResults: 10,
      },
      {} as any,
    );

    expect(result).toContain("one.ts");
    expect(result).not.toContain("two.txt");
  });

  it("returns no matches clearly", async () => {
    const result = await searchFilesTool.execute!(
      { query: "missing", directory: ".test-temp-search", maxResults: 10 },
      {} as any,
    );

    expect(result).toBe("No matches found.");
  });

  it("rejects paths outside the workspace", async () => {
    const result = await searchFilesTool.execute!(
      { query: "x", directory: "..", maxResults: 10 },
      {} as any,
    );

    expect(result).toContain("escapes workspace");
  });
});
