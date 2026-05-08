import { tool } from "ai";
import { execFile } from "child_process";
import { promisify } from "util";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { searchFilesSchema } from "./type.js";
import { resolveWorkspacePath } from "../pathSafety.js";

const execFilePromise = promisify(execFile);
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);

function matchesPattern(file: string, pattern?: string): boolean {
  if (!pattern) return true;
  if (pattern.startsWith("*.")) return file.endsWith(pattern.slice(1));
  return file.includes(pattern.replace(/\*/g, ""));
}

async function fallbackSearch(
  query: string,
  directory: string,
  filePattern: string | undefined,
  maxResults: number,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    if (results.length >= maxResults) return;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (!matchesPattern(entry.name, filePattern)) continue;

      let text = "";
      try {
        text = await readFile(fullPath, "utf-8");
      } catch {
        continue;
      }

      text.split(/\r?\n/).forEach((line, index) => {
        if (results.length < maxResults && line.includes(query)) {
          results.push(`${relative(process.cwd(), fullPath)}:${index + 1}:${line}`);
        }
      });
    }
  }

  await walk(directory);
  return results;
}

export const searchFilesTool = tool({
  description: "Search workspace files for text or regex matches",
  inputSchema: searchFilesSchema,
  execute: async ({ query, directory = ".", filePattern, maxResults = 50 }) => {
    try {
      const fullDir = resolveWorkspacePath(directory);
      try {
        const args = [
          "--line-number",
          "--no-heading",
          "--color",
          "never",
          "--glob",
          "!node_modules",
          "--glob",
          "!.git",
          "--glob",
          "!dist",
          "--glob",
          "!build",
        ];
        if (filePattern) args.push("--glob", filePattern);
        args.push(query, fullDir);

        const { stdout } = await execFilePromise("rg", args, {
          cwd: process.cwd(),
          maxBuffer: 100_000,
        });
        const lines = stdout.split(/\r?\n/).filter(Boolean).slice(0, maxResults);
        return lines.length ? lines.join("\n") : "No matches found.";
      } catch (error: any) {
        if (error.code === 1) return "No matches found.";
        if (error.code !== "ENOENT") throw error;
      }

      const fallback = await fallbackSearch(query, fullDir, filePattern, maxResults);
      return fallback.length ? fallback.join("\n") : "No matches found.";
    } catch (error: any) {
      return `Error searching files: ${error.message}`;
    }
  },
});
