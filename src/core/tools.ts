import { tool as createTool } from "ai";
import { z } from "zod";
import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const cwd = process.cwd();

function resolveWithinCwd(maybeRelative: string): string {
  const resolved = path.resolve(cwd, maybeRelative);
  if (!resolved.startsWith(path.resolve(cwd))) {
    throw new Error(`Path escapes working directory: ${maybeRelative}`);
  }
  return resolved;
}

export const tools = {
  list_files: createTool({
    description: "List files and directories inside a path relative to the current workspace.",
    inputSchema: z.object({
      path: z.string().optional().describe("Relative path to inspect."),
    }),
    execute: async ({ path: targetPath = "." }: { path?: string }) => {
      const fullPath = resolveWithinCwd(targetPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const lines = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`);
      return lines.length > 0 ? lines.join("\n") : "(empty directory)";
    },
  }),

  read_file: createTool({
    description: "Read a UTF-8 text file from the workspace.",
    inputSchema: z.object({
      path: z.string().describe("Relative file path."),
    }),
    execute: async ({ path: targetPath }: { path: string }) => {
      const fullPath = resolveWithinCwd(targetPath);
      return await fs.readFile(fullPath, "utf8");
    },
  }),

  write_file: createTool({
    description: "Write a UTF-8 text file inside the workspace.",
    inputSchema: z.object({
      path: z.string().describe("Relative file path."),
      content: z.string().describe("Full file content."),
    }),
    execute: async ({ path: targetPath, content }: { path: string; content: string }) => {
      const fullPath = resolveWithinCwd(targetPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf8");
      return `Wrote ${targetPath}`;
    },
  }),

  search_text: createTool({
    description: "Search for text using ripgrep in the workspace.",
    inputSchema: z.object({
      query: z.string().describe("Search text."),
      path: z.string().optional().describe("Optional relative path to narrow the search."),
    }),
    execute: async ({ query, path: targetPath = "." }: { query: string; path?: string }) => {
      const fullPath = resolveWithinCwd(targetPath);
      try {
        const { stdout, stderr } = await execAsync(
          `rg -n --hidden --glob "!node_modules" --glob "!dist" ${JSON.stringify(query)} ${JSON.stringify(fullPath)}`,
          { windowsHide: true, maxBuffer: 1024 * 1024 }
        );
        return stdout?.trim() || stderr?.trim() || "(no matches)";
      } catch (error: any) {
        return error.stdout?.trim() || error.stderr?.trim() || "(no matches)";
      }
    },
  }),

  run_shell: createTool({
    description: "Run a PowerShell command in the current workspace and capture stdout and stderr.",
    inputSchema: z.object({
      command: z.string().describe("PowerShell command to execute."),
    }),
    execute: async ({ command }: { command: string }) => {
      try {
        const { stdout, stderr } = await execAsync(command, {
          shell: "powershell.exe",
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        });
        const content = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        return content || "(command produced no output)";
      } catch (error: any) {
        return [error.stdout?.trim(), error.stderr?.trim()].filter(Boolean).join("\n") || error.message;
      }
    },
  }),
};
