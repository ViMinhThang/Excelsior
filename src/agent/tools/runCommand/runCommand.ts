import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { runCommandSchema } from "./type.js";

const execPromise = promisify(exec);

export const runCommandTool = tool({
  description: "Run a shell command in the current directory",
  inputSchema: runCommandSchema,
  execute: async ({ command }) => {
    try {
      const { stdout, stderr } = await execPromise(command);
      return stdout || stderr || "Command executed successfully (no output)";
    } catch (error: any) {
      return `Error executing command: ${error.message}`;
    }
  },
});
