import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "../../../lib/tool/context.js";
import {
  applyFileChange,
  ensureParentDirectory,
  prepareWriteChange,
} from "./fileChange.js";

export const writeSchema = z.object({
  filePath: z.string().describe("Destination file path"),
  content: z.string().describe("Full content to write into the file"),
});

export function createWriteTool(ctx?: ToolContext) {
  return tool({
    description: "Create or overwrite entire files with provided content. Automatically creates parent directories.",
    inputSchema: writeSchema,
    execute: ({ filePath, content }) =>
      applyFileChange({
        ctx,
        filePath,
        toolName: "writeFile",
        errorAction: "writing",
        diffMode: "when-confirming",
        prepare: (fullPath, shouldBuildDiff) =>
          prepareWriteChange(fullPath, content, shouldBuildDiff),
        beforeWrite: ensureParentDirectory,
        success: (diffOutput) => {
          const result = `Successfully wrote ${content.length} characters to ${filePath}`;
          return diffOutput ? `${result}\n${diffOutput}` : result;
        },
      }),
  });
}
