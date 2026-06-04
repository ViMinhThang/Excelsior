import { spawn } from "node:child_process";
import { z } from "zod";
import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";
import type { HarnessTool, ToolExecutionContext } from "../types.js";
import { text } from "./fs.js";

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

const runCommandSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
});

export function createRunCommandTool(): HarnessTool<z.infer<typeof runCommandSchema>> {
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

export function runProcess(command: string, args: string[], ctx: ToolExecutionContext): Promise<string> {
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
