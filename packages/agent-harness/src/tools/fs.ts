import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { buildUnifiedFileDiff, PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import type { HarnessTool, ToolActions, ToolEnv, ToolResult } from "../types.js";
import { recordTurnBackup } from "../history/turnBackups.js";
import { runProcess } from "./system.js";

export function text(content: string, isError?: boolean): ToolResult {
  return { content, isError };
}

const lsSchema = z.object({
  directoryPath: z.string().optional(),
});

export function createLsTool(): HarnessTool<z.infer<typeof lsSchema>> {
  return {
    name: "ls",
    description: "List directory contents.",
    inputSchema: lsSchema,
    async execute({ directoryPath }, env) {
      const targetDir = await resolveWorkspacePath(directoryPath ?? ".", env);
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const names = entries.map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name);
      return text(names.length === 0 ? "Directory is empty." : names.join("\n"));
    },
  };
}

const viewSchema = z.object({
  filePath: z.string(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
});

export function createViewTool(): HarnessTool<z.infer<typeof viewSchema>> {
  return {
    name: "view",
    description: "Read file contents with optional 1-based line range.",
    inputSchema: viewSchema,
    async execute({ filePath, lineStart, lineEnd }, env) {
      const fullPath = await resolveWorkspacePath(filePath, env);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, lineStart ?? 1);
      const end = Math.min(lines.length, lineEnd ?? lines.length);
      if (start > lines.length) return text(`File only has ${lines.length} lines. Requested start was ${start}.`);
      const padLength = String(end).length;
      const output = lines.slice(start - 1, end).map((line, index) => {
        const lineNumber = start + index;
        return `${String(lineNumber).padStart(padLength)}: ${line}`;
      }).join("\n");
      return text(await appendLspDiagnostics(output, env, filePath, content, fullPath));
    },
  };
}

const globSchema = z.object({
  pattern: z.string(),
});

export function createGlobTool(): HarnessTool<z.infer<typeof globSchema>> {
  return {
    name: "glob",
    description: "Find files by a simple glob pattern under the workspace.",
    inputSchema: globSchema,
    async execute({ pattern }, env) {
      validateWorkspacePattern(pattern);
      const files = await listFiles(env.workspaceRoot);
      const matcher = globToRegex(pattern);
      const matches = files.filter((file) => matcher.test(file.replace(/\\/g, "/")));
      return text(matches.length === 0 ? "No files matched." : matches.join("\n"));
    },
  };
}

const ripgrepSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

export function createRipgrepTool(): HarnessTool<z.infer<typeof ripgrepSchema>> {
  return {
    name: "ripgrep",
    description: "Search file contents with ripgrep.",
    inputSchema: ripgrepSchema,
    async execute({ pattern, path: searchPath }, env) {
      const target = searchPath ? await resolveWorkspacePath(searchPath, env) : env.workspaceRoot;
      return text(await runProcess("rg", ["-n", pattern, target], env));
    },
  };
}

const writeSchema = z.object({
  filePath: z.string(),
  content: z.string(),
});

export function createWriteTool(name = "writeFile"): HarnessTool<z.infer<typeof writeSchema>> {
  return {
    name,
    description: "Create or overwrite an entire file.",
    inputSchema: writeSchema,
    async execute({ filePath, content }, env, actions) {
      if (env.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      const authorization = await authorizeWrite(env, actions, name, filePath);
      if (!authorization.approved) return text("Denied by user.");
      const fullPath = authorization.fullPath;
      const oldContent = existsSync(fullPath) ? await fs.readFile(fullPath, "utf-8") : "";
      await recordTurnBackup({ backupDir: env.backupDir, relativePath: filePath, fullPath });
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      const diff = buildUnifiedFileDiff(authorization.displayPath, oldContent, content);
      const message = `Successfully wrote ${content.length} characters to ${authorization.displayPath}`;
      const output = diff ? `${message}\n${diff}` : message;
      return text(await appendLspDiagnostics(output, env, filePath, content, fullPath));
    },
  };
}

const editSchema = z.object({
  filePath: z.string(),
  oldText: z.string(),
  newText: z.string(),
});

export function createEditTool(name = "editFile"): HarnessTool<z.infer<typeof editSchema>> {
  return {
    name,
    description: "Replace one exact text block in a file.",
    inputSchema: editSchema,
    async execute({ filePath, oldText, newText }, env, actions) {
      if (env.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      const authorization = await authorizeWrite(env, actions, name, filePath);
      if (!authorization.approved) return text("Denied by user.");
      const fullPath = authorization.fullPath;
      await recordTurnBackup({ backupDir: env.backupDir, relativePath: filePath, fullPath });
      const content = await fs.readFile(fullPath, "utf-8");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) return text("Error: oldText not found in file.", true);
      if (occurrences > 1) return text(`Error: oldText matched ${occurrences} times. Make it unique.`, true);
      const newContent = content.replace(oldText, newText);
      await fs.writeFile(fullPath, newContent, "utf-8");
      const message = `Successfully replaced the block in ${authorization.displayPath}.`;
      const diff = buildUnifiedFileDiff(authorization.displayPath, content, newContent);
      const output = diff ? `${message}\n${diff}` : message;
      return text(await appendLspDiagnostics(output, env, filePath, newContent, fullPath));
    },
  };
}

type WriteAuthorization = {
  approved: boolean;
  fullPath: string;
  displayPath: string;
};

async function authorizeWrite(
  env: ToolEnv,
  actions: ToolActions,
  toolName: string,
  filePath: string,
): Promise<WriteAuthorization> {
  const fullPath = resolveToolPath(filePath, env);
  const outsideWorkspace = isOutsideWorkspace(fullPath, env);
  const displayPath = outsideWorkspace ? fullPath : filePath;
  if (!outsideWorkspace && env.settings.autoApproveWorkspaceEdits) {
    return { approved: true, fullPath, displayPath };
  }
  const response = await actions.confirm({
    toolName,
    args: JSON.stringify({
      filePath,
      ...(outsideWorkspace ? {
        resolvedPath: fullPath,
        outsideWorkspace: true,
        workspaceRoot: env.workspaceRoot,
      } : {}),
    }),
    filePath: displayPath,
    action: outsideWorkspace
      ? "warning"
      : existsSync(fullPath) ? "overwrite" : "create",
    warning: outsideWorkspace
      ? `Target is outside the workspace. Review carefully before approving.\nTarget: ${fullPath}\nWorkspace: ${env.workspaceRoot}`
      : undefined,
  });
  return { approved: response.approved, fullPath, displayPath };
}

function resolveToolPath(inputPath: string, env: ToolEnv): string {
  return path.resolve(env.workspaceRoot, inputPath);
}

async function appendLspDiagnostics(
  output: string,
  env: ToolEnv,
  filePath: string,
  content: string,
  fullPath: string,
): Promise<string> {
  if (!env.lsp || isOutsideWorkspace(fullPath, env)) return output;
  const diagnostics = await env.lsp.syncTouchedFile({
    filePath,
    content,
    abortSignal: env.abortSignal,
  });
  return diagnostics ? `${output}\n\n${diagnostics}` : output;
}

async function resolveWorkspacePath(inputPath: string, env: ToolEnv): Promise<string> {
  const resolved = resolveToolPath(inputPath, env);
  if (isOutsideWorkspace(resolved, env)) {
    throw new Error(`Path is outside the workspace: ${inputPath}`);
  }
  return resolved;
}

function isOutsideWorkspace(resolvedPath: string, env: ToolEnv): boolean {
  const relative = path.relative(env.workspaceRoot, resolvedPath);
  return relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
}

function validateWorkspacePattern(pattern: string): void {
  if (path.isAbsolute(pattern) || pattern.split(/[\\/]/).includes("..")) {
    throw new Error(`Pattern is outside the workspace: ${pattern}`);
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, fullPath));
    } else {
      files.push(path.relative(root, fullPath));
    }
  }
  return files;
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*");
  return new RegExp(`^${escaped}$`);
}
