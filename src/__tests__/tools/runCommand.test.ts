import { describe, it, expect } from "vitest";
import { createRunCommandTool } from "../../../packages/agent-host/src/agent/tools/runCommand/runCommand.js";
import { runCommandSchema } from "../../../packages/agent-host/src/agent/tools/runCommand/type.js";
import { PLAN_MODE_BLOCKED_MESSAGE } from "../../../packages/agent-host/src/lib/runtime/agentMode.js";

const runCommandTool = createRunCommandTool();

describe("runCommandTool", () => {
  describe("schema validation", () => {
    it("accepts a valid command object", () => {
      const result = runCommandSchema.safeParse({ command: "node", args: ["--version"] });
      expect(result.success).toBe(true);
    });

    it("rejects missing command", () => {
      const result = runCommandSchema.safeParse({ args: ["--version"] });
      expect(result.success).toBe(false);
    });

    it("rejects missing args", () => {
      const result = runCommandSchema.safeParse({ command: "node" });
      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("executes a simple command", async () => {
      const result = await (runCommandTool as any).execute({ 
        command: 'node', 
        args: ['-e', 'console.log("test123")'] 
      });
      expect(result).toContain("test123");
    });

    it("handles commands with no output", async () => {
      const result = await (runCommandTool as any).execute({ 
        command: 'node', 
        args: ['-e', 'process.exit(0)'] 
      });
      expect(result).toContain("executed successfully");
    });

    it("returns error for invalid commands", async () => {
      const result = await (runCommandTool as any).execute({ command: "nonexistent_command_xyz", args: [] });
      expect(result).toContain("Error");
    });

    it.runIf(process.platform === "win32")("supports Windows date command compatibility", async () => {
      const result = await (runCommandTool as any).execute({ command: "date", args: [] });
      expect(result.trim().length).toBeGreaterThan(0);
      expect(result).not.toContain("Executable not found");
    });

    it("blocks write-like commands in plan mode", async () => {
      const tool = createRunCommandTool({ mode: "plan", capabilities: new Set(["shell"]) });
      const result = await (tool as any).execute({ command: "mkdir", args: ["new-dir"] });
      expect(result).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    });

    it("allows non-mutating commands in plan mode", async () => {
      const tool = createRunCommandTool({ mode: "plan", capabilities: new Set(["shell"]) });
      const result = await (tool as any).execute({
        command: "node",
        args: ["-e", "console.log('plan ok')"],
      });
      expect(result).toContain("plan ok");
    });
  });

  describe("sandbox - dangerous commands", () => {
    it("blocks rm -rf /", async () => {
      const result = await (runCommandTool as any).execute({ command: "rm", args: ["-rf", "/"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks rm -rf /*", async () => {
      const result = await (runCommandTool as any).execute({ command: "rm", args: ["-rf", "/*"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks mkfs", async () => {
      const result = await (runCommandTool as any).execute({ command: "mkfs.ext4", args: ["/dev/sda"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks shutdown", async () => {
      const result = await (runCommandTool as any).execute({ command: "shutdown", args: ["now"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks reboot", async () => {
      const result = await (runCommandTool as any).execute({ command: "reboot", args: [] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks fork bomb pattern", async () => {
      const result = await (runCommandTool as any).execute({ command: ":(){ :|:& };:", args: [] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks chmod 777 on root", async () => {
      const result = await (runCommandTool as any).execute({ command: "chmod", args: ["-R", "777", "/etc"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("allows safe commands through", async () => {
      const result = await (runCommandTool as any).execute({ 
        command: 'node', 
        args: ['-e', 'console.log("safe")'] 
      });
      expect(result).toContain("safe");
      expect(result).not.toContain("Blocked");
    });

    it("allows rm without dangerous path", async () => {
      const result = await (runCommandTool as any).execute({ 
        command: 'node', 
        args: ['-e', 'console.log("rm -rf foo")'] 
      });
      expect(result).toContain("rm -rf foo");
      expect(result).not.toContain("Blocked");
    });
  });
});
