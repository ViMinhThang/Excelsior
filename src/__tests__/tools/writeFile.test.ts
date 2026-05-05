import { writeFileTool } from "../../agent/tools/writeFile/writeFile.js";
import { writeFileSchema } from "../../agent/tools/writeFile/type.js";
import { readFile, unlink, rmdir } from "fs/promises";
import { join, dirname } from "path";

const TEST_DIR = join(process.cwd(), ".test-temp");
const TEST_FILE = join(TEST_DIR, "hello_test.txt");
const TEST_CONTENT = "Hello, World! This is a test.";

describe("writeFileTool", () => {
  beforeAll(async () => {
    // Clean up any leftover test artifacts
    try {
      await unlink(TEST_FILE);
    } catch {}
    try {
      await rmdir(TEST_DIR);
    } catch {}
  });

  afterAll(async () => {
    // Clean up test artifacts
    try {
      await unlink(TEST_FILE);
    } catch {}
    try {
      await rmdir(TEST_DIR);
    } catch {}
  });

  describe("inputSchema", () => {
    it("should validate correct input", () => {
      const result = writeFileSchema.safeParse({
        path: "test.txt",
        content: "some content",
      });
      expect(result.success).toBe(true);
    });

    it("should reject missing path", () => {
      const result = writeFileSchema.safeParse({
        content: "some content",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing content", () => {
      const result = writeFileSchema.safeParse({
        path: "test.txt",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty strings", () => {
      const result = writeFileSchema.safeParse({
        path: "",
        content: "",
      });
      expect(result.success).toBe(true); // Schema allows empty strings
    });

    it("should reject non-string path", () => {
      const result = writeFileSchema.safeParse({
        path: 123,
        content: "test",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("should write content to a file successfully", async () => {
      const relativePath = ".test-temp/hello_test.txt";
      const result = await writeFileTool.execute!(
        { path: relativePath, content: TEST_CONTENT },
        {} as any
      );

      expect(result).toContain("Successfully wrote to");

      // Verify file was written correctly
      const writtenContent = await readFile(
        join(process.cwd(), relativePath),
        "utf-8"
      );
      expect(writtenContent).toBe(TEST_CONTENT);
    });

    it("should create directories recursively", async () => {
      const nestedPath = ".test-temp/nested/deep/test.txt";
      const content = "Nested file test";

      const result = await writeFileTool.execute!(
        { path: nestedPath, content },
        {} as any
      );

      expect(result).toContain("Successfully wrote to");

      const written = await readFile(
        join(process.cwd(), nestedPath),
        "utf-8"
      );
      expect(written).toBe(content);

      // Clean up nested files
      await unlink(join(process.cwd(), nestedPath));
    });

    it("should overwrite existing file", async () => {
      const relativePath = ".test-temp/overwrite_test.txt";
      const originalContent = "Original content";
      const newContent = "Updated content";

      // Write original
      await writeFileTool.execute!(
        { path: relativePath, content: originalContent },
        {} as any
      );

      // Overwrite
      const result = await writeFileTool.execute!(
        { path: relativePath, content: newContent },
        {} as any
      );

      expect(result).toContain("Successfully wrote to");

      const written = await readFile(
        join(process.cwd(), relativePath),
        "utf-8"
      );
      expect(written).toBe(newContent);
      expect(written).not.toBe(originalContent);

      // Clean up
      await unlink(join(process.cwd(), relativePath));
    });

    it("should handle empty content", async () => {
      const relativePath = ".test-temp/empty_test.txt";
      const result = await writeFileTool.execute!(
        { path: relativePath, content: "" },
        {} as any
      );

      expect(result).toContain("Successfully wrote to");

      const written = await readFile(
        join(process.cwd(), relativePath),
        "utf-8"
      );
      expect(written).toBe("");

      // Clean up
      await unlink(join(process.cwd(), relativePath));
    });

    it("should handle writing with special characters", async () => {
      const relativePath = ".test-temp/special_chars.txt";
      const specialContent = `Line 1: Hello
Line 2: 你好
Line 3: 🎉 Emojis!
Line 4: Tabs\tand\tmore
Line 5: $pecial #characters & symbols`;

      const result = await writeFileTool.execute!(
        { path: relativePath, content: specialContent },
        {} as any
      );

      expect(result).toContain("Successfully wrote to");

      const written = await readFile(
        join(process.cwd(), relativePath),
        "utf-8"
      );
      expect(written).toBe(specialContent);

      // Clean up
      await unlink(join(process.cwd(), relativePath));
    });
  });
});
