import { describe, it, expect } from "vitest";
import { runCommandTool } from "../../agent/tools/runCommand/runCommand.js";
import { runCommandSchema } from "../../agent/tools/runCommand/type.js";

const isWin = process.platform === "win32";

function sh(command: string): string {
  // Wrap command for cross-platform shell execution
  return isWin ? command : command;
}

describe("runCommandTool", () => {
  describe("schema validation", () => {
    it("accepts a valid command string", () => {
      const result = runCommandSchema.safeParse({ command: "node --version" });
      expect(result.success).toBe(true);
    });

    it("rejects missing command", () => {
      const result = runCommandSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("executes a simple command", async () => {
      const result = await (runCommandTool as any).execute({ command: sh('node -e "console.log(\'test123\')"') });
      expect(result).toContain("test123");
    });

    it("handles commands with no output", async () => {
      const result = await (runCommandTool as any).execute({ command: sh('node -e "process.exit(0)"') });
      expect(result).toContain("executed successfully");
    });

    it("returns error for invalid commands", async () => {
      const result = await (runCommandTool as any).execute({ command: "nonexistent_command_xyz" });
      expect(result).toContain("Error executing command");
    });
  });

  describe("sandbox - dangerous commands", () => {
    it("blocks rm -rf /", async () => {
      const result = await (runCommandTool as any).execute({ command: "rm -rf /" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks rm -rf /*", async () => {
      const result = await (runCommandTool as any).execute({ command: "rm -rf /*" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks mkfs", async () => {
      const result = await (runCommandTool as any).execute({ command: "mkfs.ext4 /dev/sda" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks shutdown", async () => {
      const result = await (runCommandTool as any).execute({ command: "shutdown now" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks reboot", async () => {
      const result = await (runCommandTool as any).execute({ command: "reboot" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks fork bomb pattern", async () => {
      const result = await (runCommandTool as any).execute({ command: ":(){ :|:& };:" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks chmod 777 on root", async () => {
      const result = await (runCommandTool as any).execute({ command: "chmod -R 777 /etc" });
      expect(result).toContain("Blocked dangerous command");
    });

    it("allows safe commands through", async () => {
      const result = await (runCommandTool as any).execute({ command: sh('node -e "console.log(\'safe\')"') });
      expect(result).toContain("safe");
      expect(result).not.toContain("Blocked");
    });

    it("allows rm without dangerous path", async () => {
      const result = await (runCommandTool as any).execute({ command: sh('node -e "console.log(\'rm -rf foo\')"') });
      expect(result).toContain("rm -rf foo");
      expect(result).not.toContain("Blocked");
    });
  });
});
