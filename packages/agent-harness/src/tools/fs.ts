import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { buildUnifiedFileDiff, PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import type { HarnessTool, ToolExecutionContext, ToolResult } from "../types.js";
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
    async execute({ directoryPath }, ctx) {
      const targetDir = await resolveWorkspacePath(directoryPath ?? ".", ctx);
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
    async execute({ filePath, lineStart, lineEnd }, ctx) {
      const fullPath = await resolveWorkspacePath(filePath, ctx);
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
      return text(await appendLspDiagnostics(output, ctx, filePath, content, fullPath));
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
    async execute({ pattern }, ctx) {
      validateWorkspacePattern(pattern);
      const files = await listFiles(ctx.workspaceRoot);
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
    async execute({ pattern, path: searchPath }, ctx) {
      const target = searchPath ? await resolveWorkspacePath(searchPath, ctx) : ctx.workspaceRoot;
      return text(await runProcess("rg", ["-n", pattern, target], ctx));
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
    async execute({ filePath, content }, ctx) {
      if (ctx.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      const authorization = await authorizeWrite(ctx, name, filePath);
      if (!authorization.approved) return text("Denied by user.");
      const fullPath = authorization.fullPath;
      const oldContent = existsSync(fullPath) ? await fs.readFile(fullPath, "utf-8") : "";
      await recordTurnBackup({ backupDir: ctx.backupDir, relativePath: filePath, fullPath });
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      const diff = buildUnifiedFileDiff(authorization.displayPath, oldContent, content);
      const message = `Successfully wrote ${content.length} characters to ${authorization.displayPath}`;
      const output = diff ? `${message}\n${diff}` : message;
      return text(await appendLspDiagnostics(output, ctx, filePath, content, fullPath));
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
    async execute({ filePath, oldText, newText }, ctx) {
      if (ctx.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      const authorization = await authorizeWrite(ctx, name, filePath);
      if (!authorization.approved) return text("Denied by user.");
      const fullPath = authorization.fullPath;
      await recordTurnBackup({ backupDir: ctx.backupDir, relativePath: filePath, fullPath });
      const content = await fs.readFile(fullPath, "utf-8");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) return text("Error: oldText not found in file.", true);
      if (occurrences > 1) return text(`Error: oldText matched ${occurrences} times. Make it unique.`, true);
      const newContent = content.replace(oldText, newText);
      await fs.writeFile(fullPath, newContent, "utf-8");
      const message = `Successfully replaced the block in ${authorization.displayPath}.`;
      const diff = buildUnifiedFileDiff(authorization.displayPath, content, newContent);
      const output = diff ? `${message}\n${diff}` : message;
      return text(await appendLspDiagnostics(output, ctx, filePath, newContent, fullPath));
    },
  };
}

type WriteAuthorization = {
  approved: boolean;
  fullPath: string;
  displayPath: string;
};

async function authorizeWrite(
  ctx: ToolExecutionContext,
  toolName: string,
  filePath: string,
): Promise<WriteAuthorization> {
  const fullPath = resolveToolPath(filePath, ctx);
  const outsideWorkspace = isOutsideWorkspace(fullPath, ctx);
  const displayPath = outsideWorkspace ? fullPath : filePath;
  if (!outsideWorkspace && ctx.settings?.autoApproveWorkspaceEdits) {
    return { approved: true, fullPath, displayPath };
  }
  const response = await ctx.confirm({
    toolName,
    args: JSON.stringify({
      filePath,
      ...(outsideWorkspace ? {
        resolvedPath: fullPath,
        outsideWorkspace: true,
        workspaceRoot: ctx.workspaceRoot,
      } : {}),
    }),
    filePath: displayPath,
    action: outsideWorkspace
      ? "warning"
      : existsSync(fullPath) ? "overwrite" : "create",
    warning: outsideWorkspace
      ? `Target is outside the workspace. Review carefully before approving.\nTarget: ${fullPath}\nWorkspace: ${ctx.workspaceRoot}`
      : undefined,
  });
  return { approved: response.approved, fullPath, displayPath };
}

function resolveToolPath(inputPath: string, ctx: ToolExecutionContext): string {
  return path.resolve(ctx.workspaceRoot, inputPath);
}

async function appendLspDiagnostics(
  output: string,
  ctx: ToolExecutionContext,
  filePath: string,
  content: string,
  fullPath: string,
): Promise<string> {
  if (!ctx.lsp || isOutsideWorkspace(fullPath, ctx)) return output;
  const diagnostics = await ctx.lsp.syncTouchedFile({
    filePath,
    content,
    abortSignal: ctx.abortSignal,
  });
  return diagnostics ? `${output}\n\n${diagnostics}` : output;
}

async function resolveWorkspacePath(inputPath: string, ctx: ToolExecutionContext): Promise<string> {
  const resolved = resolveToolPath(inputPath, ctx);
  if (isOutsideWorkspace(resolved, ctx)) {
    throw new Error(`Path is outside the workspace: ${inputPath}`);
  }
  return resolved;
}

function isOutsideWorkspace(resolvedPath: string, ctx: ToolExecutionContext): boolean {
  const relative = path.relative(ctx.workspaceRoot, resolvedPath);
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
