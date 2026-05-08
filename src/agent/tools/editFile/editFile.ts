import { tool } from "ai";
import { readFile, writeFile } from "fs/promises";
import { editFileSchema } from "./type.js";
import { resolveWorkspacePath } from "../pathSafety.js";

export const editFileTool = tool({
  description: "Edit an existing file by replacing one exact text match",
  inputSchema: editFileSchema,
  execute: async ({ path, search, replace }) => {
    try {
      const fullPath = resolveWorkspacePath(path);
      const content = await readFile(fullPath, "utf-8");
      const first = content.indexOf(search);
      if (first === -1) return `Error editing file: search text not found in ${path}`;

      const second = content.indexOf(search, first + search.length);
      if (second !== -1) {
        return `Error editing file: search text matched more than once in ${path}`;
      }

      const updated =
        content.slice(0, first) + replace + content.slice(first + search.length);
      await writeFile(fullPath, updated, "utf-8");
      return `Successfully edited ${path}`;
    } catch (error: any) {
      return `Error editing file: ${error.message}`;
    }
  },
});
