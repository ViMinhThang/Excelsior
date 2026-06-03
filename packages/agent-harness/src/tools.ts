import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import type { HarnessTool, ToolExecutionContext, ToolResult } from "./types.js";

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

export function createBuiltInTools(): HarnessTool[] {
  return [
    createLsTool(),
    createViewTool(),
    createGlobTool(),
    createRipgrepTool(),
    createWriteTool(),
    createEditTool(),
    createRunCommandTool(),
    createAskQuestionTool(),
    createSpawnSubAgentTool(),
  ];
}

const lsSchema = z.object({
  directoryPath: z.string().optional(),
});

function createLsTool(): HarnessTool<z.infer<typeof lsSchema>> {
  return {
    name: "ls",
    description: "List directory contents.",
    inputSchema: lsSchema,
    capabilities: ["fs:read"],
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

function createViewTool(): HarnessTool<z.infer<typeof viewSchema>> {
  return {
    name: "view",
    description: "Read file contents with optional 1-based line range.",
    inputSchema: viewSchema,
    capabilities: ["fs:read"],
    async execute({ filePath, lineStart, lineEnd }, ctx) {
      const fullPath = await resolveWorkspacePath(filePath, ctx);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, lineStart ?? 1);
      const end = Math.min(lines.length, lineEnd ?? lines.length);
      if (start > lines.length) return text(`File only has ${lines.length} lines. Requested start was ${start}.`);
      const padLength = String(end).length;
      return text(lines.slice(start - 1, end).map((line, index) => {
        const lineNumber = start + index;
        return `${String(lineNumber).padStart(padLength)}: ${line}`;
      }).join("\n"));
    },
  };
}

const globSchema = z.object({
  pattern: z.string(),
});

function createGlobTool(): HarnessTool<z.infer<typeof globSchema>> {
  return {
    name: "glob",
    description: "Find files by a simple glob pattern under the workspace.",
    inputSchema: globSchema,
    capabilities: ["fs:read"],
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

function createRipgrepTool(): HarnessTool<z.infer<typeof ripgrepSchema>> {
  return {
    name: "ripgrep",
    description: "Search file contents with ripgrep.",
    inputSchema: ripgrepSchema,
    capabilities: ["fs:read"],
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

function createWriteTool(): HarnessTool<z.infer<typeof writeSchema>> {
  return {
    name: "writeFile",
    description: "Create or overwrite an entire file.",
    inputSchema: writeSchema,
    capabilities: ["fs:write"],
    async execute({ filePath, content }, ctx) {
      if (ctx.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      const allowed = await authorizeWrite(ctx, "writeFile", filePath);
      if (!allowed) return text("Denied by user.");
      const fullPath = await resolveWorkspacePath(filePath, ctx);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      return text(`Successfully wrote ${content.length} characters to ${filePath}`);
    },
  };
}

const editSchema = z.object({
  filePath: z.string(),
  oldText: z.string(),
  newText: z.string(),
});

function createEditTool(): HarnessTool<z.infer<typeof editSchema>> {
  return {
    name: "editFile",
    description: "Replace one exact text block in a file.",
    inputSchema: editSchema,
    capabilities: ["fs:write"],
    async execute({ filePath, oldText, newText }, ctx) {
      if (ctx.mode === "plan") return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      const allowed = await authorizeWrite(ctx, "editFile", filePath);
      if (!allowed) return text("Denied by user.");
      const fullPath = await resolveWorkspacePath(filePath, ctx);
      const content = await fs.readFile(fullPath, "utf-8");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) return text("Error: oldText not found in file.", true);
      if (occurrences > 1) return text(`Error: oldText matched ${occurrences} times. Make it unique.`, true);
      await fs.writeFile(fullPath, content.replace(oldText, newText), "utf-8");
      return text(`Successfully replaced the block in ${filePath}.`);
    },
  };
}

const runCommandSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
});

function createRunCommandTool(): HarnessTool<z.infer<typeof runCommandSchema>> {
  return {
    name: "runCommand",
    description: "Run an executable with distinct arguments in the workspace.",
    inputSchema: runCommandSchema,
    capabilities: ["shell"],
    async execute({ command, args }, ctx) {
      const normalizedArgs = args ?? [];
      const risk = classifyCommandRisk(command, normalizedArgs);
      if (risk.blocked) return text(risk.message, true);
      if (ctx.mode === "plan" && risk.writeLike) return text(PLAN_MODE_BLOCKED_MESSAGE, true);
      if (risk.writeLike) {
        const response = await ctx.confirm({
          toolName: "runCommand",
          args: JSON.stringify({ command, args: normalizedArgs }),
          action: "warning",
        });
        if (!response.approved) return text("Denied by user.");
      }
      return text(await runProcess(command, normalizedArgs, ctx));
    },
  };
}

const askQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
  allowManual: z.boolean().optional(),
});

function createAskQuestionTool(): HarnessTool<z.infer<typeof askQuestionSchema>> {
  return {
    name: "askQuestion",
    description: "Ask the user a blocking question when a decision is required.",
    inputSchema: askQuestionSchema,
    capabilities: [],
    async execute({ question, options, allowManual }, ctx) {
      const response = await ctx.askQuestion({
        question,
        options: options ?? [],
        allowManual: allowManual ?? true,
      });
      if (response.cancelled) return text("Question cancelled.");
      return text(response.selectedOptionLabel ?? response.answer);
    },
  };
}

const spawnSubAgentSchema = z.object({
  role: z.string(),
  prompt: z.string(),
});

function createSpawnSubAgentTool(): HarnessTool<z.infer<typeof spawnSubAgentSchema>> {
  return {
    name: "spawnSubAgent",
    description: "Run a focused sub-agent for specialized analysis.",
    inputSchema: spawnSubAgentSchema,
    capabilities: ["sub-agent"],
    async execute(input, ctx) {
      return text(await ctx.sendSubAgent(input));
    },
  };
}

function text(content: string, isError?: boolean): ToolResult {
  return { content, isError };
}

async function authorizeWrite(ctx: ToolExecutionContext, toolName: string, filePath: string): Promise<boolean> {
  const response = await ctx.confirm({
    toolName,
    args: JSON.stringify({ filePath }),
    filePath,
    action: existsSync(path.resolve(ctx.workspaceRoot, filePath)) ? "overwrite" : "create",
  });
  return response.approved;
}

function resolveToolPath(inputPath: string, ctx: ToolExecutionContext): string {
  return path.resolve(ctx.workspaceRoot, inputPath);
}

async function resolveWorkspacePath(inputPath: string, ctx: ToolExecutionContext): Promise<string> {
  const resolved = resolveToolPath(inputPath, ctx);
  const relative = path.relative(ctx.workspaceRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the workspace: ${inputPath}`);
  }
  return resolved;
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

function runProcess(command: string, args: string[], ctx: ToolExecutionContext): Promise<string> {
  return new Promise((resolveProcess) => {
    let stdout = "";
    let stderr = "";
    let totalLength = 0;
    let settled = false;

    const child = spawn(command, args, {
      cwd: ctx.workspaceRoot,
      shell: false,
    });

    const finish = (output: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      ctx.abortSignal?.removeEventListener("abort", abort);
      resolveProcess(output);
    };

    const abort = () => {
      try {
        child.kill();
      } catch {
        // ignore kill failures
      }
      finish("Command cancelled.");
    };

    const timeoutTimer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore kill failures
      }
      finish("Command timed out.");
    }, DEFAULT_TIMEOUT);

    ctx.abortSignal?.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (data) => {
      const chunk = String(data);
      if (totalLength < MAX_OUTPUT_LENGTH) {
        stdout += chunk;
        totalLength += chunk.length;
      }
    });
    child.stderr?.on("data", (data) => {
      const chunk = String(data);
      if (totalLength < MAX_OUTPUT_LENGTH) {
        stderr += chunk;
        totalLength += chunk.length;
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT" ? `Error: Executable not found: ${command}` : `Error executing command: ${error.message}`);
    });
    child.on("close", (code) => {
      const output = stdout || stderr || (code === 0 ? "Command executed successfully (no output)" : `Command failed with exit code ${code}`);
      finish(totalLength >= MAX_OUTPUT_LENGTH ? `${output.slice(0, MAX_OUTPUT_LENGTH)}\n[Output truncated]` : output);
    });
  });
}

function classifyCommandRisk(command: string, args: string[]): { blocked: boolean; writeLike: boolean; message: string } {
  const textCommand = [command, ...args].join(" ").toLowerCase();
  const dangerous = [
    /rm\s+-rf\s+\/$/,
    /rm\s+-rf\s+\/\*/,
    /mkfs/,
    /shutdown/,
    /reboot/,
    /:\(\)\{\s*:\|:&\s*\};:/,
  ];
  if (dangerous.some((pattern) => pattern.test(textCommand))) {
    return { blocked: true, writeLike: false, message: "Blocked dangerous command." };
  }
  const writeLike = /\b(rm|del|move|mv|cp|copy|npm\s+install|git\s+checkout|git\s+reset|git\s+clean|mkdir|rmdir)\b/.test(textCommand);
  return { blocked: false, writeLike, message: "" };
}
