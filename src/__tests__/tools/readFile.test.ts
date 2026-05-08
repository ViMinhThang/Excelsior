import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileTool } from "../../agent/tools/readFile/readFile.js";
import { readFileSchema } from "../../agent/tools/readFile/type.js";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

const TEST_DIR = join(process.cwd(), ".test-temp");
const TEST_FILE = join(TEST_DIR, "read_test.txt");
const TEST_CONTENT = "Content for read test.\nLine two.\n";

describe("readFileTool", () => {
  beforeAll(async () => {
    try {
      await writeFile(TEST_FILE, TEST_CONTENT, "utf-8");
    } catch {}
  });

  afterAll(async () => {
    try { await unlink(TEST_FILE); } catch {}
  });

  describe("schema validation", () => {
    it("accepts a valid path", () => {
      const result = readFileSchema.safeParse({ path: TEST_FILE });
      expect(result.success).toBe(true);
    });

    it("rejects missing path", () => {
      const result = readFileSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects non-string path", () => {
      const result = readFileSchema.safeParse({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("reads file content successfully", async () => {
      const result = await (readFileTool as any).execute({ path: TEST_FILE });
      expect(result).toBe(TEST_CONTENT);
    });

    it("returns error for non-existent file", async () => {
      const result = await (readFileTool as any).execute({ path: "/nonexistent/path/file.txt" });
      expect(result).toContain("Error");
    });

    it("rejects paths outside the workspace", async () => {
      const result = await (readFileTool as any).execute({ path: "../outside.txt" });
      expect(result).toContain("escapes workspace");
    });
  });
});
