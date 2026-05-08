import { isAbsolute, join, relative, resolve } from "path";

export function resolveWorkspacePath(inputPath: string): string {
  if (!inputPath.trim()) {
    throw new Error("Path cannot be empty.");
  }

  const workspaceRoot = resolve(process.cwd());
  const fullPath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(join(workspaceRoot, inputPath));
  const rel = relative(workspaceRoot, fullPath);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return fullPath;
  }

  throw new Error(`Path escapes workspace: ${inputPath}`);
}
