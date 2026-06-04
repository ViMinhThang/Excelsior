import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ProjectInstructions {
  path: string;
  content: string;
}

export function loadProjectInstructions(workspaceRoot: string): ProjectInstructions | null {
  const filePath = resolve(join(workspaceRoot, "AGENTS.md"));
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf8").trim();
    if (!content) return null;
    return { path: filePath, content };
  } catch {
    return null;
  }
}
