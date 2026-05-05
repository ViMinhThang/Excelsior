import { tool } from "ai";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { writeFileSchema } from "./type.js";

export const writeFileTool = tool({
  description: "Write content to a file",
  inputSchema: writeFileSchema,
  execute: async ({ path, content }) => {
    try {
      const fullPath = join(process.cwd(), path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
      return `Successfully wrote to ${path}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  },
});
