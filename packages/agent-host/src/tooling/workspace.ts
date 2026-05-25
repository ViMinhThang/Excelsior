import path from "node:path";
import type { ToolContext } from "./context.js";

export function getWorkspaceRoot(ctx?: ToolContext): string {
  return path.resolve(ctx?.workspaceRoot ?? process.cwd());
}

export function resolveWorkspacePath(inputPath: string, ctx?: ToolContext): string {
  const root = getWorkspaceRoot(ctx);
  const resolved = path.resolve(root, inputPath);
  const relative = path.relative(root, resolved);
  const isInside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!isInside) {
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
