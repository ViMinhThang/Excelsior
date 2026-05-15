import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "../../../lib/tool/context.js";
import { createUnifiedDiff, type DiffAction } from "../../../lib/diff/unifiedDiff.js";
import { PLAN_MODE_BLOCKED_MESSAGE } from "../../../lib/runtime/agentMode.js";
import { resolveWorkspacePath } from "./workspacePath.js";

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

      if (ctx?.mode === "plan") {
        return PLAN_MODE_BLOCKED_MESSAGE;
      }

      if (ctx?.confirm && ctx.confirm.getListenerCount() > 0) {
        let existingContent = "";
        let action: DiffAction = "create";
        try {
          existingContent = await fs.readFile(fullPath, "utf-8");
          action = "overwrite";
        } catch {
          existingContent = "";
        }

        const approved = await ctx.confirm.request(
          "writeFile",
          JSON.stringify({ filePath }),
          {
            action,
            filePath,
            diff: createUnifiedDiff(filePath, existingContent, content),
          },
        );
        if (!approved) return "Denied by user.";
      }

      try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return `Successfully wrote ${content.length} characters to ${filePath}`;
      } catch (error: unknown) {
        return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
