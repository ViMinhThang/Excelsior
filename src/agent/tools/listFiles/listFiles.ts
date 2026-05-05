import { tool } from "ai";
import { readdir } from "fs/promises";
import { join, relative } from "path";
import { listFilesSchema } from "./type.js";

async function walk(dir: string, baseDir: string, recursive: boolean): Promise<string[]> {
  const files = await readdir(dir, { withFileTypes: true });
  const result: string[] = [];

  for (const file of files) {
    const path = join(dir, file.name);
    
    // Ignore common non-source directories
    if (file.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '.next'].includes(file.name)) continue;
      
      if (recursive) {
        result.push(...(await walk(path, baseDir, recursive)));
      } else {
        result.push(relative(baseDir, path) + "/");
      }
    } else {
      result.push(relative(baseDir, path));
    }
  }

  return result;
}

export const listFilesTool = tool({
  description: "List all files in the workspace or a specific directory to understand the project structure.",
  inputSchema: listFilesSchema,
  execute: async ({ directory = ".", recursive = true }) => {
    try {
      const baseDir = process.cwd();
      const targetDir = join(baseDir, directory);
      const files = await walk(targetDir, baseDir, recursive);
      
      if (files.length === 0) return "No files found in this directory.";
      
      return `Found ${files.length} files:\n${files.join("\n")}`;
    } catch (error: any) {
      return `Error listing files: ${error.message}`;
    }
  },
});
