import { z } from "zod";
import fs from "node:fs/promises";
import { defineTool } from "../core/toolBuilder.js";
import { resolveWorkspacePath } from "../core/workspace.js";

export const lsSchema = z.object({
  directoryPath: z.string().optional().describe("Path to the directory to list. Defaults to '.'"),
});

export const createLsTool = defineTool({
  name: "ls",
  description: "List directory contents (names of files and directories)",
  inputSchema: lsSchema,
  capability: "fs:read",
  modePolicy: "read",
  errorAction: "listing directory",
  execute: async ({ directoryPath }, ctx) => {
    const targetDir = resolveWorkspacePath(directoryPath || ".", ctx);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
  
    const names = entries.map((entry) => {
      if (entry.isDirectory()) {
        return `${entry.name}/`;
      }
      return entry.name;
    });

    if (names.length === 0) return "Directory is empty.";
    return names.join("\n");
  },
});
