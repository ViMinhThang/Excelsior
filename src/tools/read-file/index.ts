import { tool } from "ai";
import { z } from "zod";
import { readWorkspaceFile } from "../lib/file-ops.js";

export const readFileTool = (cwd: string) =>
  tool({
    description: "Read the full content of a file in the workspace.",
    inputSchema: z.object({
      path: z.string(),
    }),
    execute: async ({ path }: { path: string }) => {
      try {
        return await readWorkspaceFile(cwd, path);
      } catch (error) {
        return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
