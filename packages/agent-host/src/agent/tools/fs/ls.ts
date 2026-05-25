import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import type { ToolContext } from "../../../tooling/context.js";
import { authorizeToolAction } from "../../../tooling/policy.js";
import { resolveWorkspacePath } from "../../../tooling/workspace.js";

export const lsSchema = z.object({
  directoryPath: z.string().optional().describe("Path to the directory to list. Defaults to '.'"),
});

export function createLsTool(ctx?: ToolContext) {
  return tool({
    description: "List directory contents (names of files and directories)",
    inputSchema: lsSchema,
    execute: async ({ directoryPath }) => {
      const authorization = await authorizeToolAction(ctx, {
        toolName: "ls",
        capability: "fs:read",
        modePolicy: "read",
      });
      if (!authorization.allowed) return authorization.message;

      try {
        const targetDir = resolveWorkspacePath(directoryPath || ".", ctx);
        const entries = await fs.readdir(targetDir, { withFileTypes: true });
      
        const names = entries.map((entry) => {
          if (entry.isDirectory()) {
            return `${entry.name}/`;
          }
          return entry.name;
        });

        if (names.length === 0) return "Directory is empty.";
        return names.join("\n");
      } catch (error: unknown) {
        return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
