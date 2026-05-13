import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export const viewSchema = z.object({
  filePath: z.string().describe("Path to the file to read"),
  lineStart: z.number().optional().describe("Optional 1-based starting line"),
  lineEnd: z.number().optional().describe("Optional 1-based inclusive ending line"),
});

export const viewTool = tool({
  description: "Read file contents with explicit line numbers and optional range slicing.",
  inputSchema: viewSchema,
  execute: async ({ filePath, lineStart, lineEnd }) => {
    const fullPath = path.resolve(process.cwd(), filePath);
    try {
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

      const summary = `[File: ${filePath}, Lines ${start}-${end} of ${lines.length}]`;
      return `${summary}\n${"-".repeat(summary.length)}\n${formatted}`;
    } catch (error: unknown) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
