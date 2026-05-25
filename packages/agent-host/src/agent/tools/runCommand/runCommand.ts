import { tool } from "ai";
import { spawn } from "child_process";
import type { ToolContext } from "../../../tooling/context.js";
import { classifyCommandRisk } from "../../../tooling/commandRisk.js";
import { authorizeToolAction } from "../../../tooling/policy.js";
import { getWorkspaceRoot } from "../../../tooling/workspace.js";
import { runCommandSchema } from "./types.js";

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

const isWindows = process.platform === "win32";

function windowsShellCompatibility(command: string, args: string[]): { command: string; args: string[] } | null {
  if (!isWindows || args.length > 0) return null;

  if (command.toLowerCase() === "date") {
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-Date"],
    };
  }

  return null;
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

export function createRunCommandTool(ctx?: ToolContext) {
  return tool({
    description: "Run an executable with distinct parameters in the current directory",
    inputSchema: runCommandSchema,
    execute: async ({ command, args }) => {
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

      const compatibleCommand = windowsShellCompatibility(command, normalizedArgs);
      if (!compatibleCommand) return result.output;

      return (await runProcess(compatibleCommand.command, compatibleCommand.args, ctx)).output;
    },
  });
}
