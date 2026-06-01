import { z } from "zod";
import fs from "node:fs/promises";
import { defineTool } from "../core/toolBuilder.js";
import { resolveWorkspacePath } from "../core/workspace.js";

export const viewSchema = z.object({
  filePath: z.string().describe("Path to the file to read"),
  lineStart: z.number().optional().describe("Optional 1-based starting line"),
  lineEnd: z.number().optional().describe("Optional 1-based inclusive ending line"),
});

export const createViewTool = defineTool({
  name: "view",
  description: "Read file contents with explicit line numbers and optional range slicing.",
  inputSchema: viewSchema,
  capability: "fs:read",
  modePolicy: "read",
  errorAction: "reading file",
  execute: async ({ filePath, lineStart, lineEnd }, ctx) => {
    const fullPath = resolveWorkspacePath(filePath, ctx);
    const content = await fs.readFile(fullPath, "utf-8");
    const lines = content.split(/\r?\n/);
  
    const start = Math.max(1, lineStart || 1);
    const end = Math.min(lines.length, lineEnd || lines.length);
  
    if (start > lines.length) {
      return `File only has ${lines.length} lines. Requested start was ${start}.`;
    }

    const slice = lines.slice(start - 1, end);
    const padLength = String(end).length;

    const formatted = slice.map((line, index) => {
      const lineNum = start + index;
      return `${String(lineNum).padStart(padLength)}: ${line}`;
    }).join("\n");

    return formatted;
  },
});
