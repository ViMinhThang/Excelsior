import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export const lsSchema = z.object({
  directoryPath: z.string().optional().describe("Path to the directory to list. Defaults to '.'"),
});

export const lsTool = tool({
  description: "List directory contents with file size and modification details",
  inputSchema: lsSchema,
  execute: async ({ directoryPath }) => {
    const targetDir = path.resolve(process.cwd(), directoryPath || ".");
    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      
      const stats = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(targetDir, entry.name);
          try {
            const s = await fs.stat(fullPath);
            const type = entry.isDirectory() ? "DIR " : entry.isFile() ? "FILE" : "OTHR";
            const size = entry.isDirectory() ? "-" : s.size.toLocaleString();
            const mtime = s.mtime.toISOString().split('T')[0];
            return `${type} | ${entry.name.padEnd(30)} | ${size.padStart(12)} bytes | ${mtime}`;
          } catch {
            return `UNKN | ${entry.name.padEnd(30)} | - | -`;
          }
        })
      );

      if (stats.length === 0) return "Directory is empty.";
      return ["TYPE | NAME".padEnd(35) + " | SIZE".padStart(20) + " | MODIFIED", "-".repeat(80), ...stats].join("\n");
    } catch (error: any) {
      return `Error listing directory: ${error.message}`;
    }
  },
});
