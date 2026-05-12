import { tool } from "ai";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { ConfirmBus } from "../../../types.js";
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

export function createRunCommandTool(confirmBus?: ConfirmBus) {
  return tool({
    description: "Run an executable with distinct parameters in the current directory",
    inputSchema: runCommandSchema,
    execute: async ({ command, args }) => {
      const fullString = [command, ...(args || [])].join(" ");
      const danger = isDangerous(fullString);
      if (danger) return danger;

      if (confirmBus && confirmBus.getListenerCount("request") > 0 && isWriteCommand(fullString)) {
        const callId = randomUUID();
        const approved = await new Promise<boolean>((resolve) => {
          const unsub = confirmBus.on("response", (resp) => {
            if (resp.callId === callId) {
              unsub();
              resolve(resp.approved);
            }
          });
          confirmBus.emit("request", {
            callId,
            toolName: "runCommand",
            args: JSON.stringify({ command, args }),
          });
        });
        if (!approved) return "Denied by user.";
      }

      return new Promise<string>((resolve) => {
        let stdout = "";
        let stderr = "";
        let totalLength = 0;

        const child = spawn(command, args || [], {
          cwd: process.cwd(),
          shell: false,
        });

        const killAndResolve = (msg: string) => {
          try { child.kill(); } catch {}
          resolve(msg);
        };

        const timeoutTimer = setTimeout(() => {
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

        child.on("error", (err: any) => {
          clearTimeout(timeoutTimer);
          if (err.code === 'ENOENT') {
            resolve(`Error: Executable not found: ${command}`);
          } else {
            resolve(`Error executing command: ${err.message}`);
          }
        });

        child.on("close", (code) => {
          clearTimeout(timeoutTimer);
          const output = stdout || stderr || (code === 0 ? "Command executed successfully (no output)" : `Command failed with exit code ${code}`);
          if (totalLength >= MAX_OUTPUT_LENGTH) {
             resolve(output.slice(0, MAX_OUTPUT_LENGTH) + "\n[Output truncated]");
          } else {
             resolve(output);
          }
        });
      });
    },
  });
}
