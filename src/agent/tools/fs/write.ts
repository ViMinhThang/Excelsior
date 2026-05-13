import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "../../../lib/tool/context.js";

export const writeSchema = z.object({
  filePath: z.string().describe("Destination file path"),
  content: z.string().describe("Full content to write into the file"),
});

export function createWriteTool(ctx?: ToolContext) {
  return tool({
    description: "Create or overwrite entire files with provided content. Automatically creates parent directories.",
    inputSchema: writeSchema,
    execute: async ({ filePath, content }) => {
      if (ctx?.confirm && ctx.confirm.getListenerCount() > 0) {
        const approved = await ctx.confirm.request(
          "writeFile",
          JSON.stringify({ filePath }),
        );
        if (!approved) return "Denied by user.";
      }

      const fullPath = path.resolve(process.cwd(), filePath);
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
