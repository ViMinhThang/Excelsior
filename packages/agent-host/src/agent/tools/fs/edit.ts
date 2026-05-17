import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import type { ToolContext } from "../../../lib/tool/context.js";
import { createUnifiedDiff } from "../../../lib/diff/unifiedDiff.js";
import { authorizeToolAction } from "../../../lib/tool/policy.js";
import { resolveWorkspacePath } from "../../../lib/tool/workspace.js";

export const editSchema = z.object({
  filePath: z.string().describe("Path to file to edit"),
  oldText: z.string().describe("Exact snippet currently in the file to replace"),
  newText: z.string().describe("New text to replace it with"),
});

export function createEditTool(ctx?: ToolContext) {
  return tool({
    description: "Atomically replaces an exact text block with a new version. Fails if oldText is not perfectly unique in file.",
    inputSchema: editSchema,
    execute: async ({ filePath, oldText, newText }) => {
      let fullPath: string;
      try {
        fullPath = resolveWorkspacePath(filePath, ctx);
      } catch (error: unknown) {
        return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
      }

      const authorization = await authorizeToolAction(ctx, {
        toolName: "editFile",
        capability: "fs:write",
        modePolicy: "write",
      });
      if (!authorization.allowed) return authorization.message;

      try {
        const content = await fs.readFile(fullPath, "utf-8");
        const occurrences = content.split(oldText).length - 1;

        if (occurrences === 0) {
          return "Error: 'oldText' not found in file. Verify exact matches including spaces/newlines.";
        }
        if (occurrences > 1) {
          return `Error: Found ${occurrences} occurrences of 'oldText'. Please expand 'oldText' to make it unique.`;
        }

        const updated = content.replace(oldText, newText);
        const confirmation = await authorizeToolAction(ctx, {
          toolName: "editFile",
          capability: "fs:write",
          modePolicy: "write",
          confirmation: {
            toolName: "editFile",
            args: JSON.stringify({ filePath }),
            metadata: {
              action: "edit",
              filePath,
              diff: createUnifiedDiff(filePath, content, updated),
            },
          },
        });
        if (!confirmation.allowed) return confirmation.message;

        await ctx?.revert?.fileCheckpoint.captureBeforeWrite(filePath, fullPath);
        await fs.writeFile(fullPath, updated, "utf-8");
        ctx?.revert?.fileCheckpoint.recordWrite(filePath, fullPath, updated);
        return `Successfully replaced the block in ${filePath}.`;
      } catch (error: unknown) {
        return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
