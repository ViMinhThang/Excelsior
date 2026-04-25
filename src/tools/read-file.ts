import { promises as fs } from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  ".excelsior",
]);

export function resolveWithinWorkspace(
  workspaceRoot: string,
  relativePath: string,
): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);

  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return resolved;
  }

  throw new Error(`Path escapes workspace: ${relativePath}`);
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
  return fs.readFile(absolutePath, "utf8");
}

export async function listWorkspaceEntries(
  workspaceRoot: string,
  relativePath = ".",
): Promise<string[]> {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${entry.isDirectory() ? "dir" : "file"} ${entry.name}`);
}

export async function searchWorkspaceText(
  workspaceRoot: string,
  query: string,
  relativePath = ".",
  maxMatches = 50,
): Promise<string[]> {
  const absolutePath = resolveWithinWorkspace(workspaceRoot, relativePath);
  const matches: string[] = [];

  await walkTextFiles(workspaceRoot, absolutePath, async (filePath) => {
    if (matches.length >= maxMatches) {
      return;
    }

    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      return;
    }

    const relativeFilePath =
      path.relative(workspaceRoot, filePath) || path.basename(filePath);
    const lines = content.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (!line.toLowerCase().includes(query.toLowerCase())) {
        continue;
      }

      matches.push(`${relativeFilePath}:${index + 1}: ${line.trim()}`);
      if (matches.length >= maxMatches) {
        return;
      }
    }
  });

  return matches;
}

export async function collectWorkspaceFileSnapshot(
  workspaceRoot: string,
  relativePath: string,
  maxChars = 4000,
): Promise<{ content: string; truncated: boolean } | null> {
  try {
    const content = await readWorkspaceFile(workspaceRoot, relativePath);
    const truncated = content.length > maxChars;
    return {
      content: truncated
        ? `${content.slice(0, maxChars)}\n...<truncated>`
        : content,
      truncated,
    };
  } catch {
    return null;
  }
}

async function walkTextFiles(
  workspaceRoot: string,
  currentPath: string,
  onFile: (filePath: string) => Promise<void>,
): Promise<void> {
  const stats = await fs.stat(currentPath);
  if (stats.isFile()) {
    await onFile(currentPath);
    return;
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
      continue;
    }

    const nextPath = path.join(currentPath, entry.name);
    const relativeNextPath = path.relative(workspaceRoot, nextPath);
    if (relativeNextPath.startsWith("..")) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkTextFiles(workspaceRoot, nextPath, onFile);
      continue;
    }

    await onFile(nextPath);
  }
}

function shouldSkipDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name);
}
