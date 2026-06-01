import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { defineTool } from "../core/toolBuilder.js";
import { getWorkspaceRoot, validateWorkspacePattern } from "../core/workspace.js";

// Converts a glob pattern to a highly accurate RegExp
function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const regexParts = parts.map((part) => {
    if (part === "**") {
      return ".*";
    }
    return part
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]");
  });
  
  let regexStr = regexParts.join("/");
  // Optimize matching for recursive and leading wildcards
  regexStr = regexStr.replace(/\/\.\*$/, "(?:/.*)?");
  regexStr = regexStr.replace(/^\.\*\//, "(?:.*/)?");
  regexStr = regexStr.replace(/\/\.\*\//g, "/(?:.*/)?");
  
  return new RegExp(`^${regexStr}$`);
}

// Recursively walks the directory structure matching patterns
async function* globWalk(pattern: string, options: { cwd: string }, currentPath = ""): AsyncGenerator<string> {
  const regex = globToRegex(pattern);
  const fullDir = currentPath ? path.join(options.cwd, currentPath) : options.cwd;
  
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(fullDir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  
  for (const entry of entries) {
    // Blazing-fast optimization: skip heavy folders to prevent locking/infinite recursion
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === ".next" ||
      entry.name === ".venv"
    ) {
      continue;
    }

    const entryRelative = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    
    if (entry.isDirectory()) {
      if (regex.test(entryRelative)) {
        yield entryRelative;
      }
      yield* globWalk(pattern, options, entryRelative);
    } else if (entry.isFile()) {
      if (regex.test(entryRelative)) {
        yield entryRelative;
      }
    }
  }
}

// Custom glob wrapper acting as an async iterable
async function* glob(pattern: string, options: { cwd: string }) {
  yield* globWalk(pattern, options);
}

export const globSchema = z.object({
  pattern: z.string().describe("The glob pattern (e.g., 'src/**/*.ts' or '**/package.json')"),
});

export const createGlobTool = defineTool({
  name: "glob",
  description: "Find file paths matching the given glob pattern using native Node globbing.",
  inputSchema: globSchema,
  capability: "fs:read",
  modePolicy: "read",
  errorAction: "running glob",
  execute: async ({ pattern }, ctx) => {
    validateWorkspacePattern(pattern);
    const matches: string[] = [];
    for await (const match of glob(pattern, { cwd: getWorkspaceRoot(ctx) })) {
      matches.push(match);
      if (matches.length >= 500) { // Cap at 500 to prevent overload
        return [...matches, "[Output truncated: too many files found]"].join("\n");
      }
    }
    if (matches.length === 0) return "No files found matching pattern.";
    return matches.join("\n");
  },
});
