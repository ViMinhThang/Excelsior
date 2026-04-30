import { tool } from "ai";
import { z } from "zod";
import { listWorkspaceEntries } from "../lib/file-ops.js";

export const listFilesTool = (cwd: string) =>
  tool({
    description:
      "List files and directories in the workspace. Returns a list of strings prefixed with 'file' or 'dir'.",
    inputSchema: z.object({
      path: z.string().optional(),
    }),
    execute: async ({ path }: { path?: string | undefined }) => {
      try {
        const targetPath = path ?? ".";
        const result = await listWorkspaceEntries(cwd, targetPath);
        return JSON.stringify(result);
      } catch (error) {
        return `Error listing files: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
