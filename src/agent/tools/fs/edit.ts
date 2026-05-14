import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import type { ToolContext } from "../../../lib/tool/context.js";
import { resolveWorkspacePath } from "./workspacePath.js";

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

      if (ctx?.confirm && ctx.confirm.getListenerCount() > 0) {
        const approved = await ctx.confirm.request(
          "editFile",
          JSON.stringify({ filePath }),
        );
        if (!approved) return "Denied by user.";
      }

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
        await fs.writeFile(fullPath, updated, "utf-8");
        return `Successfully replaced the block in ${filePath}.`;
      } catch (error: unknown) {
        return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
