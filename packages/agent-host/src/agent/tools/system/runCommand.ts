import { z } from "zod";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import type { ToolContext } from "../core/context.js";
import { classifyCommandRisk } from "../core/commandRisk.js";
import { authorizeToolAction } from "../core/policy.js";
import { getWorkspaceRoot } from "../core/workspace.js";
import { defineTool } from "../core/toolBuilder.js";

export const runCommandSchema = z.object({
  command: z.string().describe('The executable to run (e.g., "npm", "git", "node", "ls", "cat")'),
  args: z.array(z.string()).describe('The arguments for the command'),
});

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

const isWindows = process.platform === "win32";

const WINDOWS_SCRIPT_EXTENSIONS = new Set([".bat", ".cmd"]);
const SAFE_WINDOWS_COMMAND_NAME = /^[A-Za-z0-9_.-]+$/;

function getWindowsPathEntries(): string[] {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path");
  const rawPath = pathKey ? process.env[pathKey] : process.env.PATH;
  return (rawPath ?? "").split(path.delimiter).filter(Boolean);
}

function getWindowsPathExtensions(): string[] {
  return (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hasDirectorySegment(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

function candidateCommandNames(command: string): string[] {
  if (path.extname(command)) return [command];
  return [command, ...getWindowsPathExtensions().map((ext) => command + ext)];
}

function findWindowsScriptShim(command: string, cwd: string): string | null {
  const searchDirs = hasDirectorySegment(command)
    ? [""]
    : [cwd, ...getWindowsPathEntries()];

  for (const dir of searchDirs) {
    for (const candidate of candidateCommandNames(command)) {
      const fullPath = path.resolve(dir || cwd, candidate);
      if (
        WINDOWS_SCRIPT_EXTENSIONS.has(path.extname(fullPath).toLowerCase()) &&
        existsSync(fullPath)
      ) {
        return fullPath;
      }
    }
  }

  return null;
}

function windowsShellCompatibility(
  command: string,
  args: string[],
  ctx?: ToolContext,
): { command: string; args: string[] } | null {
  if (!isWindows) return null;

  if (command.toLowerCase() === "which") {
    return {
      command: "where.exe",
      args,
    };
  }

  if (command.toLowerCase() === "date" && args.length === 0) {
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-Date"],
    };
  }

  if (!SAFE_WINDOWS_COMMAND_NAME.test(command)) return null;
  if (!findWindowsScriptShim(command, getWorkspaceRoot(ctx))) return null;

  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/c", command, ...args],
  };
}

interface ProcessResult {
  output: string;
  notFound: boolean;
}

function runProcess(command: string, args: string[], ctx?: ToolContext): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let totalLength = 0;
    let settled = false;

    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      ctx?.abortSignal?.removeEventListener("abort", abortCommand);
      resolve(result);
    };

    const child = spawn(command, args, {
      cwd: getWorkspaceRoot(ctx),
      shell: false,
    });

    let timeoutTimer: ReturnType<typeof setTimeout>;

    const killAndResolve = (msg: string) => {
      try { child.kill(); } catch (err) {
        process.stderr.write(`runCommand: kill failed: ${err}\n`);
      }
      finish({ output: msg, notFound: false });
    };
    const abortCommand = () => killAndResolve("Command cancelled.");
    ctx?.abortSignal?.addEventListener("abort", abortCommand, { once: true });

    timeoutTimer = setTimeout(() => {
      killAndResolve("Command timed out");
    }, DEFAULT_TIMEOUT);

    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      if (totalLength < MAX_OUTPUT_LENGTH) {
        stdout += chunk;
        totalLength += chunk.length;
      } else {
        child.kill();
      }
    });

    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      if (totalLength < MAX_OUTPUT_LENGTH) {
        stderr += chunk;
        totalLength += chunk.length;
      } else {
        child.kill();
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        finish({ output: `Error: Executable not found: ${command}`, notFound: true });
      } else {
        finish({ output: `Error executing command: ${err.message}`, notFound: false });
      }
    });

    child.on("close", (code) => {
      const output = stdout || stderr || (code === 0 ? "Command executed successfully (no output)" : `Command failed with exit code ${code}`);
      finish({
        output: totalLength >= MAX_OUTPUT_LENGTH
          ? output.slice(0, MAX_OUTPUT_LENGTH) + "\n[Output truncated]"
          : output,
        notFound: false,
      });
    });
  });
}

export const createRunCommandTool = defineTool({
  name: "runCommand",
  description: "Run an executable with distinct parameters in the current directory",
  inputSchema: runCommandSchema,
  errorAction: "executing command",
  execute: async ({ command, args }, ctx) => {
    const normalizedArgs = args || [];
    const classification = classifyCommandRisk(command, normalizedArgs);
    if (classification.blockedMessage) return classification.blockedMessage;
    if (ctx?.abortSignal?.aborted) return "Command cancelled.";

    const authorization = await authorizeToolAction(ctx, {
      toolName: "runCommand",
      capability: "shell",
      modePolicy: classification.kind === "write" ? "write" : "shell",
      risk: classification.risk,
      confirmation: classification.kind === "write"
        ? {
            toolName: "runCommand",
            args: JSON.stringify({ command, args }),
          }
        : undefined,
    });
    if (!authorization.allowed) return authorization.message;

    const result = await runProcess(command, normalizedArgs, ctx);
    if (!result.notFound) return result.output;

    const compatibleCommand = windowsShellCompatibility(command, normalizedArgs, ctx);
    if (!compatibleCommand) return result.output;

    return (await runProcess(compatibleCommand.command, compatibleCommand.args, ctx)).output;
  },
});
