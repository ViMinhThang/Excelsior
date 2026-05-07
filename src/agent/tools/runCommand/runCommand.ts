import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { runCommandSchema } from "./type.js";

const execPromise = promisify(exec);

const MAX_OUTPUT_LENGTH = 100_000;
const DEFAULT_TIMEOUT = 30_000;

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
];

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked dangerous command matching pattern: ${pattern}`;
    }
  }
  return null;
}

export const runCommandTool = tool({
  description: "Run a shell command in the current directory",
  inputSchema: runCommandSchema,
  execute: async ({ command }) => {
    const danger = isDangerous(command);
    if (danger) return danger;

    try {
      const { stdout, stderr } = await execPromise(command, {
        cwd: process.cwd(),
        timeout: DEFAULT_TIMEOUT,
        maxBuffer: MAX_OUTPUT_LENGTH,
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
