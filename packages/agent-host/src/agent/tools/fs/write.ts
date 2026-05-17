import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "../../../lib/tool/context.js";
import { authorizeToolAction } from "../../../lib/tool/policy.js";
import { resolveWorkspacePath } from "../../../lib/tool/workspace.js";
import { createUnifiedDiff, type DiffAction } from "../../../lib/diff/unifiedDiff.js";

export const writeSchema = z.object({
  filePath: z.string().describe("Destination file path"),
  content: z.string().describe("Full content to write into the file"),
});

export function createWriteTool(ctx?: ToolContext) {
  return tool({
    description: "Create or overwrite entire files with provided content. Automatically creates parent directories.",
    inputSchema: writeSchema,
    execute: async ({ filePath, content }) => {
      let fullPath: string;
      try {
        fullPath = resolveWorkspacePath(filePath, ctx);
      } catch (error: unknown) {
        return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
      }

      const authorization = await authorizeToolAction(ctx, {
        toolName: "writeFile",
        capability: "fs:write",
        modePolicy: "write",
      });
      if (!authorization.allowed) return authorization.message;

      if (ctx?.confirm && ctx.confirm.getListenerCount() > 0) {
        let existingContent = "";
        let action: DiffAction = "create";
        try {
          existingContent = await fs.readFile(fullPath, "utf-8");
          action = "overwrite";
        } catch {
          existingContent = "";
        }

        const confirmation = await authorizeToolAction(ctx, {
          toolName: "writeFile",
          capability: "fs:write",
          modePolicy: "write",
          confirmation: {
            toolName: "writeFile",
            args: JSON.stringify({ filePath }),
            metadata: {
              action,
              filePath,
              diff: createUnifiedDiff(filePath, existingContent, content),
            },
          },
        });
        if (!confirmation.allowed) return confirmation.message;
      }

      try {
        await ctx?.revert?.fileCheckpoint.captureBeforeWrite(filePath, fullPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        ctx?.revert?.fileCheckpoint.recordWrite(filePath, fullPath, content);
        return `Successfully wrote ${content.length} characters to ${filePath}`;
      } catch (error: unknown) {
        return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
