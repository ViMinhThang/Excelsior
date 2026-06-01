import path from "node:path";
import type { ToolContext } from "./context.js";

export function getWorkspaceRoot(ctx?: ToolContext): string {
  return path.resolve(ctx?.workspaceRoot ?? process.cwd());
}

export function resolveToolPath(inputPath: string, ctx?: ToolContext): string {
  const root = getWorkspaceRoot(ctx);
  return path.resolve(root, inputPath);
}

export function isWorkspacePath(inputPath: string, ctx?: ToolContext): boolean {
  const root = getWorkspaceRoot(ctx);
  const resolved = resolveToolPath(inputPath, ctx);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveWorkspacePath(inputPath: string, ctx?: ToolContext): Promise<string> {
  const resolved = resolveToolPath(inputPath, ctx);

  if (!isWorkspacePath(inputPath, ctx)) {
    throw new Error(`Path is outside the workspace: ${inputPath}`);
  }

  return resolved;
}

export function validateWorkspacePattern(pattern: string): void {
  if (path.isAbsolute(pattern)) {
    throw new Error(`Pattern is outside the workspace: ${pattern}`);
  }

  const segments = pattern.replace(/\\/g, "/").split("/");
  if (segments.includes("..")) {
    throw new Error(`Pattern is outside the workspace: ${pattern}`);
  }
}
