import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import type { ToolContext } from "../../../lib/tool/context.js";
import { applyFileChange, fileChangeUserError } from "./fileChange.js";

export const editSchema = z.object({
  filePath: z.string().describe("Path to file to edit"),
  oldText: z.string().describe("Exact snippet currently in the file to replace"),
  newText: z.string().describe("New text to replace it with"),
});

export function createEditTool(ctx?: ToolContext) {
  return tool({
    description: "Atomically replaces an exact text block with a new version. Fails if oldText is not perfectly unique in file.",
    inputSchema: editSchema,
    execute: ({ filePath, oldText, newText }) =>
      applyFileChange({
        ctx,
        filePath,
        toolName: "editFile",
        errorAction: "editing",
        diffMode: "always",
        prepare: async (fullPath) => {
          const content = await fs.readFile(fullPath, "utf-8");
          const occurrences = content.split(oldText).length - 1;

          if (occurrences === 0) {
            throw fileChangeUserError(
              "Error: 'oldText' not found in file. Verify exact matches including spaces/newlines.",
            );
          }
          if (occurrences > 1) {
            throw fileChangeUserError(
              `Error: Found ${occurrences} occurrences of 'oldText'. Please expand 'oldText' to make it unique.`,
            );
          }

          const updated = content.replace(oldText, newText);
          return { before: content, after: updated, action: "edit" };
        },
        success: (diffOutput) =>
          `Successfully replaced the block in ${filePath}.\n${diffOutput}`,
      }),
  });
}
