import { tool } from "ai";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { runCommandSchema } from "./type.js";
import { confirmBus } from "../confirm.js";

const execPromise = promisify(exec);

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
  ...(isWindows ? [
    /rmdir\s+\/s\s+\\/i,
    /del\s+\/[fqs]\s+\\/i,
    /format\s+\w:|format\s+\/q/i,
    /diskpart/i,
    /reg\s+(delete|add)\s+/i,
  ] : []),
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

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked dangerous command matching pattern: ${pattern}`;
    }
  }
  return null;
}

function isWriteCommand(command: string): boolean {
  return WRITE_PATTERNS.some((pattern) => pattern.test(command));
}

export const runCommandTool = tool({
  description: "Run a shell command in the current directory",
  inputSchema: runCommandSchema,
  execute: async ({ command }) => {
    const danger = isDangerous(command);
    if (danger) return danger;

    if (isWriteCommand(command) && confirmBus.listenerCount > 0) {
      const callId = randomUUID();
      const approved = await new Promise<boolean>((resolve) => {
        confirmBus.emitRequest({
          callId,
          toolName: "runCommand",
          args: JSON.stringify({ command }),
        });
        confirmBus._pending.set(callId, resolve);
      });
      if (!approved) return "Denied by user.";
    }

    try {
      const { stdout, stderr } = await execPromise(command, {
        cwd: process.cwd(),
        timeout: DEFAULT_TIMEOUT,
        maxBuffer: MAX_OUTPUT_LENGTH,
        shell: isWindows ? "powershell.exe" : "/bin/sh",
      });
      const output = stdout || stderr || "Command executed successfully (no output)";
      if (output.length > MAX_OUTPUT_LENGTH) {
        return output.slice(0, MAX_OUTPUT_LENGTH) + "\n[Output truncated]";
      }
      return output;
    } catch (error: any) {
      if (error.killed) return "Command timed out";
      return `Error executing command: ${error.message}`;
    }
  },
});
