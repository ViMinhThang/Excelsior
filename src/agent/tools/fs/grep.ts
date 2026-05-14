import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "../../../lib/tool/context.js";
import { getWorkspaceRoot, validateWorkspacePattern } from "./workspacePath.js";

export const grepSchema = z.object({
  query: z.string().describe("Literal text or regex string to search for"),
  pathPattern: z.string().optional().describe("Glob pattern to scope files (e.g., 'src/**/*.ts'). Defaults to '**/*'"),
});

export function createGrepTool(ctx?: ToolContext) {
  return tool({
    description: "Search across files for containing text or regex patterns, ignoring node_modules and .git by default.",
    inputSchema: grepSchema,
    execute: async ({ query, pathPattern }) => {
      try {
        const searchPattern = pathPattern || "**/*";
        validateWorkspacePattern(searchPattern);
        const workspaceRoot = getWorkspaceRoot(ctx);
        const regex = new RegExp(query, "i");
        const matches: string[] = [];
        let totalMatches = 0;

        for await (const filePath of glob(searchPattern, { cwd: workspaceRoot })) {
          // Skip large built directories and Git
          if (filePath.includes("node_modules") || filePath.includes(".git") || filePath.includes("dist")) {
            continue;
          }
          const fullPath = path.join(workspaceRoot, filePath);

          try {
            const stats = await fs.stat(fullPath);
            if (!stats.isFile() || stats.size > 1_000_000) continue; // Skip directories or files >1MB to preserve memory

            const content = await fs.readFile(fullPath, "utf-8");
            const lines = content.split(/\r?\n/);
          
            lines.forEach((line, idx) => {
              if (regex.test(line)) {
                if (totalMatches < 100) {
                  matches.push(`${filePath}:${idx + 1}: ${line.trim().substring(0, 200)}`);
                }
                totalMatches++;
              }
            });
          } catch (err) {
            process.stderr.write(`grep: skipping unreadable file ${filePath}: ${err}\n`);
          }

          if (totalMatches >= 100) break;
        }

        if (matches.length === 0) return "No matches found.";
        const output = matches.join("\n");
        return totalMatches > 100 
          ? `${output}\n[Showing first 100 results]` 
          : output;
      } catch (error: unknown) {
        return `Error running grep: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export const grepTool = createGrepTool();
