import { tool } from "ai";
import { spawn } from "child_process";
import type { ToolContext } from "../../../lib/tool/context.js";
import { runCommandSchema } from "./type.js";

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

const isWindows = process.platform === "win32";

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+~(\/|\s|$)/i,
  /rm\s+-rf\s+\/\*/i,
  /mkfs/i,
  /dd\s+if=/i,
  /:\s*\(\)\s*\{/, // fork bomb
  />\s*\/dev\/sd/i,
  /chmod\s+(-R\s+)?777\s+\//i,
  /shutdown/i,
  /reboot/i,
  /halt/i,
  /poweroff/i,
  // Windows-specific dangerous patterns
  ...(isWindows
    ? [
        /rmdir\s+\/s\s+\\/i,
        /del\s+\/[fqs]\s+\\/i,
        /format\s+\w:|format\s+\/q/i,
        /diskpart/i,
        /reg\s+(delete|add)\s+/i,
      ]
    : []),
];

const baseWritePatterns: RegExp[] = [
  // Redirection (write to file)
  /(?:>>|(?:^|[|;])\s*>)/i,
  // Write-like bash commands
  /\b(rm|mv|cp|mkdir|touch|chmod|chown|ln|dd)\b\s/i,
  /\bsed\s+-i\b/i,
  /\b(npm|pnpm|yarn|npx)\s+(install|add|publish|remove|update|init|config\s+set)\b/i,
  /\bgit\s+(commit|push|reset|merge|rebase|revert|cherry-pick|branch\s+-[dD]|tag|checkout\s+-b|remote\s+(add|rm)|fetch\s+\S+\s+--force)\b/i,
  /\b(docker\s+(build|push|tag|commit|rm|rmi|network\s+rm|volume\s+rm))\b/i,
];

if (isWindows) {
  baseWritePatterns.push(
    // PowerShell write cmdlets
    /\b(Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Clear-Content)\b/i,
    // cmd write commands
    /\b(copy|move|del|erase|rename|mkdir|mklink)\b\s/i,
  );
}

const WRITE_PATTERNS = baseWritePatterns;

function isDangerous(commandString: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(commandString)) {
      return `Blocked dangerous command matching pattern: ${pattern}`;
    }
  }
  return null;
}

function isWriteCommand(commandString: string): boolean {
  return WRITE_PATTERNS.some((pattern) => pattern.test(commandString));
}

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
      cwd: process.cwd(),
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
      const fullString = [command, ...(args || [])].join(" ");
      const danger = isDangerous(fullString);
      if (danger) return danger;
      if (ctx?.abortSignal?.aborted) return "Command cancelled.";

      if (ctx?.confirm && ctx.confirm.getListenerCount() > 0 && isWriteCommand(fullString)) {
        const approved = await ctx.confirm.request(
          "runCommand",
          JSON.stringify({ command, args }),
        );
        if (!approved) return "Denied by user.";
      }

      const normalizedArgs = args || [];
      const result = await runProcess(command, normalizedArgs, ctx);
      if (!result.notFound) return result.output;

      const compatibleCommand = windowsShellCompatibility(command, normalizedArgs);
      if (!compatibleCommand) return result.output;

      return (await runProcess(compatibleCommand.command, compatibleCommand.args, ctx)).output;
    },
  });
}
