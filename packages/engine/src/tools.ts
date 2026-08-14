import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { PLAN_MODE_BLOCKED_MESSAGE, type AskQuestionOption } from "@excelsior/protocol";
import { classifyCommandRisk, type CapabilityContext, type PermissionDecision } from "./capabilities.js";
import { buildUnifiedDiff } from "./diff.js";

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput, cap: CapabilityContext): Promise<ToolResult>;
}

export function text(content: string, isError?: boolean): ToolResult {
  return { content, isError };
}

function isOutsideWorkspace(resolvedPath: string, cap: CapabilityContext): boolean {
  const relative = path.relative(cap.workspace.rootPath, resolvedPath);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function resolveToolPath(inputPath: string, cap: CapabilityContext): string {
  return path.resolve(cap.workspace.rootPath, inputPath);
}

async function resolveWorkspacePath(
  inputPath: string,
  cap: CapabilityContext,
): Promise<string> {
  const resolved = resolveToolPath(inputPath, cap);
  if (isOutsideWorkspace(resolved, cap)) {
    throw new Error(`Path is outside the workspace: ${inputPath}`);
  }
  return resolved;
}

function checkPolicy(decision: PermissionDecision, actDescription: string): string | null {
  if (decision.allow) return null;
  if (decision.reason === "plan-blocked") return PLAN_MODE_BLOCKED_MESSAGE;
  if (decision.reason === "blocked") return "Blocked: " + actDescription;
  return null;
}

const lsSchema = z.object({ directoryPath: z.string().optional() });

export function createLsTool(): ToolDefinition<z.infer<typeof lsSchema>> {
  return {
    name: "ls",
    description: "List directory contents.",
    inputSchema: lsSchema,
    async execute({ directoryPath }, cap) {
      const targetDir = await resolveWorkspacePath(directoryPath ?? ".", cap);
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const names = entries.map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name,
      );
      return text(names.length === 0 ? "Directory is empty." : names.join("\n"));
    },
  };
}

const viewSchema = z.object({
  filePath: z.string(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
});

export function createViewTool(): ToolDefinition<z.infer<typeof viewSchema>> {
  return {
    name: "view",
    description: "Read file contents with optional 1-based line range.",
    inputSchema: viewSchema,
    async execute({ filePath, lineStart, lineEnd }, cap) {
      const fullPath = await resolveWorkspacePath(filePath, cap);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, lineStart ?? 1);
      const end = Math.min(lines.length, lineEnd ?? lines.length);
      if (start > lines.length) {
        return text(`File only has ${lines.length} lines. Requested start was ${start}.`, true);
      }
      const padLength = String(end).length;
      const output = lines
        .slice(start - 1, end)
        .map((line, index) => `${String(start + index).padStart(padLength)}: ${line}`)
        .join("\n");
      return text(output);
    },
  };
}

const globSchema = z.object({ pattern: z.string() });

export function createGlobTool(): ToolDefinition<z.infer<typeof globSchema>> {
  return {
    name: "glob",
    description: "Find files by a simple glob pattern under the workspace.",
    inputSchema: globSchema,
    async execute({ pattern }, cap) {
      validateWorkspacePattern(pattern);
      const files = await listFiles(cap.workspace.rootPath);
      const matcher = globToRegex(pattern);
      const matches = files
        .filter((file) => matcher.test(file.replace(/\\/g, "/")))
        .map((file) => file.replace(/\\/g, "/"));
      return text(matches.length === 0 ? "No files matched." : matches.join("\n"));
    },
  };
}

const ripgrepSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

export function createRipgrepTool(): ToolDefinition<z.infer<typeof ripgrepSchema>> {
  return {
    name: "ripgrep",
    description: "Search file contents with ripgrep.",
    inputSchema: ripgrepSchema,
    async execute({ pattern, path: searchPath }, cap) {
      const target = searchPath
        ? await resolveWorkspacePath(searchPath, cap)
        : cap.workspace.rootPath;
      return text(await runProcess("rg", ["-n", pattern, target], cap));
    },
  };
}

const writeSchema = z.object({
  filePath: z.string(),
  content: z.string(),
});

export function createWriteTool(): ToolDefinition<z.infer<typeof writeSchema>> {
  return {
    name: "write",
    description: "Create or overwrite an entire file.",
    inputSchema: writeSchema,
    async execute({ filePath, content }, cap) {
      const decision = cap.permission.decide({
        kind: "write-file",
        filePath,
        mode: cap.mode,
      });
      const blocked = checkPolicy(decision, "write");
      if (blocked) return text(blocked, true);

      const auth = await authorizeWrite(cap, "write", filePath, content);
      if (!auth.approved) return text("Denied by user.");
      await fs.mkdir(path.dirname(auth.fullPath), { recursive: true });
      await fs.writeFile(auth.fullPath, content, "utf-8");
      const diff = buildUnifiedDiff(auth.displayPath, auth.oldContent, content);
      const message = `Successfully wrote ${content.length} characters to ${auth.displayPath}`;
      return text(diff ? `${message}\n${diff}` : message);
    },
  };
}

const editSchema = z.object({
  filePath: z.string(),
  oldText: z.string(),
  newText: z.string(),
});

export function createEditTool(): ToolDefinition<z.infer<typeof editSchema>> {
  return {
    name: "edit",
    description: "Replace one exact text block in a file.",
    inputSchema: editSchema,
    async execute({ filePath, oldText, newText }, cap) {
      const decision = cap.permission.decide({
        kind: "edit-file",
        filePath,
        mode: cap.mode,
      });
      const blocked = checkPolicy(decision, "edit");
      if (blocked) return text(blocked, true);

      const auth = await authorizeWrite(cap, "edit", filePath, newText);
      if (!auth.approved) return text("Denied by user.");
      const content = await fs.readFile(auth.fullPath, "utf-8");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) return text("Error: oldText not found in file.", true);
      if (occurrences > 1) {
        return text(`Error: oldText matched ${occurrences} times. Make it unique.`, true);
      }
      const newContent = content.replace(oldText, newText);
      await fs.writeFile(auth.fullPath, newContent, "utf-8");
      const message = `Successfully replaced the block in ${auth.displayPath}.`;
      const diff = buildUnifiedDiff(auth.displayPath, content, newContent);
      return text(diff ? `${message}\n${diff}` : message);
    },
  };
}

const runCommandSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
});

export function createRunCommandTool(): ToolDefinition<z.infer<typeof runCommandSchema>> {
  return {
    name: "runCommand",
    description: "Run an executable with distinct arguments in the workspace.",
    inputSchema: runCommandSchema,
    async execute({ command, args }, cap) {
      const normalizedArgs = args ?? [];
      const risk = classifyCommandRisk(command, normalizedArgs);
      if (risk.blocked) return text(risk.message, true);
      const decision = cap.permission.decide({
        kind: "run-command",
        command,
        mode: cap.mode,
      });
      const blocked = checkPolicy(decision, "command");
      if (blocked) return text(blocked, true);
      if (decision.reason === "needs-approval") {
        const approved = await cap.permission.confirm(
          {
            kind: "run-command",
            command,
            mode: cap.mode,
          },
          cap.callId,
        );
        if (!approved) return text("Denied by user.");
      }
      return text(await runProcess(command, normalizedArgs, cap));
    },
  };
}

const askQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string(), description: z.string().optional() })).optional(),
  allowManual: z.boolean().optional(),
});

export function createAskQuestionTool(): ToolDefinition<z.infer<typeof askQuestionSchema>> {
  return {
    name: "askQuestion",
    description: "Ask the user a question and wait for their answer.",
    inputSchema: askQuestionSchema,
    async execute({ question, options, allowManual }, cap) {
      const response = await cap.permission.ask(
        {
          callId: cap.callId,
          question,
          options: (options ?? []) as AskQuestionOption[],
          allowManual: allowManual ?? true,
        },
        cap.callId,
      );
      if (response.cancelled) return text("Question cancelled.", true);
      if (response.selectedOptionLabel) {
        return text(`User answered: ${response.selectedOptionLabel}`);
      }
      return text(response.answer);
    },
  };
}

type WriteAuthorization = {
  approved: boolean;
  fullPath: string;
  displayPath: string;
  oldContent: string;
};

async function authorizeWrite(
  cap: CapabilityContext,
  toolName: "write" | "edit",
  filePath: string,
  content: string,
): Promise<WriteAuthorization> {
  const fullPath = resolveToolPath(filePath, cap);
  const outsideWorkspace = isOutsideWorkspace(fullPath, cap);
  const displayPath = outsideWorkspace ? fullPath : filePath;
  const oldContent = existsSync(fullPath) ? await fs.readFile(fullPath, "utf-8") : "";

  if (!outsideWorkspace && cap.settings.autoApproveWorkspaceEdits) {
    return { approved: true, fullPath, displayPath, oldContent };
  }

  const diff = buildUnifiedDiff(displayPath, oldContent, content);
  const action = outsideWorkspace ? "warning" : existsSync(fullPath) ? "overwrite" : "create";
  const warning = outsideWorkspace
    ? `Target is outside the workspace. Review carefully before approving.\nTarget: ${fullPath}\nWorkspace: ${cap.workspace.rootPath}`
    : undefined;

  const approved = await cap.permission.confirm(
    {
      kind: toolName === "write" ? "write-file" : "edit-file",
      filePath: displayPath,
      mode: cap.mode,
      action,
      diff,
      warning,
    },
    cap.callId,
  );
  return { approved, fullPath, displayPath, oldContent };
}

function runProcess(command: string, args: string[], cap: CapabilityContext): Promise<string> {
  return new Promise((resolveProcess) => {
    let stdout = "";
    let stderr = "";
    let totalLength = 0;
    let settled = false;

    const child = spawn(command, args, {
      cwd: cap.workspace.rootPath,
      shell: false,
    });

    const emitOutput = (delta: string) => {
      if (!delta) return;
      cap.onOutput?.(delta);
    };

    const finish = (output: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      resolveProcess(output);
    };

    const timeoutTimer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore kill failures
      }
      finish("Command timed out.");
    }, DEFAULT_TIMEOUT);

    child.stdout?.on("data", (data) => {
      const chunk = String(data);
      if (totalLength < MAX_OUTPUT_LENGTH) {
        stdout += chunk;
        totalLength += chunk.length;
        emitOutput(chunk);
      }
    });
    child.stderr?.on("data", (data) => {
      const chunk = String(data);
      if (totalLength < MAX_OUTPUT_LENGTH) {
        stderr += chunk;
        totalLength += chunk.length;
        emitOutput(chunk);
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(
        error.code === "ENOENT"
          ? `Error: Executable not found: ${command}`
          : `Error executing command: ${error.message}`,
      );
    });
    child.on("close", (code) => {
      const output =
        stdout || stderr || (code === 0 ? "Command executed successfully (no output)" : `Command failed with exit code ${code}`);
      finish(
        totalLength >= MAX_OUTPUT_LENGTH
          ? `${output.slice(0, MAX_OUTPUT_LENGTH)}\n[Output truncated]`
          : output,
      );
    });
  });
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
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, fullPath)));
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

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  createViewTool(),
  createLsTool(),
  createGlobTool(),
  createRipgrepTool(),
  createWriteTool(),
  createEditTool(),
  createRunCommandTool(),
  createAskQuestionTool(),
];
