import { tool } from "ai";
import { z } from "zod";
import { glob } from "node:fs/promises";
import type { ToolContext } from "../../../lib/tool/context.js";
import { authorizeToolAction } from "../../../lib/tool/policy.js";
import { getWorkspaceRoot, validateWorkspacePattern } from "../../../lib/tool/workspace.js";

export const globSchema = z.object({
  pattern: z.string().describe("The glob pattern (e.g., 'src/**/*.ts' or '**/package.json')"),
});

export function createGlobTool(ctx?: ToolContext) {
  return tool({
    description: "Find file paths matching the given glob pattern using native Node globbing.",
    inputSchema: globSchema,
    execute: async ({ pattern }) => {
      const authorization = await authorizeToolAction(ctx, {
        toolName: "glob",
        capability: "fs:read",
        modePolicy: "read",
      });
      if (!authorization.allowed) return authorization.message;

      try {
        validateWorkspacePattern(pattern);
        const matches: string[] = [];
        for await (const match of glob(pattern, { cwd: getWorkspaceRoot(ctx) })) {
          matches.push(match);
          if (matches.length >= 500) { // Cap at 500 to prevent overload
            return [...matches, "[Output truncated: too many files found]"].join("\n");
          }
        }
        if (matches.length === 0) return "No files found matching pattern.";
        return matches.join("\n");
      } catch (error: unknown) {
        return `Error running glob: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
