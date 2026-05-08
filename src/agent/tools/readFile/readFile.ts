import { tool } from "ai";
import { readFile } from "fs/promises";
import { readFileSchema } from "./type.js";
import { resolveWorkspacePath } from "../pathSafety.js";

export const readFileTool = tool({
  description: "Read the contents of a file",
  inputSchema: readFileSchema,
  execute: async ({ path }) => {
    try {
      const fullPath = resolveWorkspacePath(path);
      const content = await readFile(fullPath, "utf-8");
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  },
});
