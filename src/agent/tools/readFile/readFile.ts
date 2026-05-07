import { tool } from "ai";
import { readFile } from "fs/promises";
import { isAbsolute, join } from "path";
import { readFileSchema } from "./type.js";

export const readFileTool = tool({
  description: "Read the contents of a file",
  inputSchema: readFileSchema,
  execute: async ({ path }) => {
    try {
      const fullPath = isAbsolute(path) ? path : join(process.cwd(), path);
      const content = await readFile(fullPath, "utf-8");
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  },
});
