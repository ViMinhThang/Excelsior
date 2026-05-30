import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  classifyCommandRisk,
  createRunCommandTool,
  executeTool,
  PLAN_MODE_BLOCKED_MESSAGE,
  runCommandSchema,
} from "@excelsior/agent-host/testing/tools";

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

  describe("risk classification", () => {
    it("classifies dangerous commands as blocked", () => {
      expect(classifyCommandRisk("rm", ["-rf", "/"])).toMatchObject({
        kind: "dangerous",
        risk: "blocked",
      });
    });

    it("classifies write-like commands as high risk", () => {
      expect(classifyCommandRisk("mkdir", ["new-dir"])).toMatchObject({
        kind: "write",
        risk: "high",
      });
    });

    it("classifies read-like commands as low risk", () => {
      expect(classifyCommandRisk("node", ["--version"])).toMatchObject({
        kind: "read",
        risk: "low",
      });
    });
  });

  describe("execute", () => {
    it("executes a simple command", async () => {
      const result = await executeTool(runCommandTool, { 
        command: 'node', 
        args: ['-e', 'console.log("test123")'] 
      });
      expect(result).toContain("test123");
    });

    it("handles commands with no output", async () => {
      const result = await executeTool(runCommandTool, { 
        command: 'node', 
        args: ['-e', 'process.exit(0)'] 
      });
      expect(result).toContain("executed successfully");
    });

    it("returns error for invalid commands", async () => {
      const result = await executeTool(runCommandTool, {
        command: "nonexistent_command_xyz",
        args: [],
      });
      expect(result).toContain("Error");
    });

    it.runIf(process.platform === "win32")("supports Windows date command compatibility", async () => {
      const result = await executeTool(runCommandTool, { command: "date", args: [] });
      expect(result.trim().length).toBeGreaterThan(0);
      expect(result).not.toContain("Executable not found");
    });

    it.runIf(process.platform === "win32")("supports Windows command shims like npm", async () => {
      const npmResult = await executeTool(runCommandTool, { command: "npm", args: ["--version"] });
      const npxResult = await executeTool(runCommandTool, { command: "npx", args: ["--version"] });

      expect(npmResult.trim()).toMatch(/^\d+\.\d+\.\d+/);
      expect(npxResult.trim()).toMatch(/^\d+\.\d+\.\d+/);
      expect(npmResult).not.toContain("Executable not found");
      expect(npxResult).not.toContain("Executable not found");
    });

    it.runIf(process.platform === "win32")("maps which to where.exe on Windows", async () => {
      const result = await executeTool(runCommandTool, { command: "which", args: ["npm"] });
      expect(result.toLowerCase()).toContain("npm");
      expect(result).not.toContain("Executable not found");
    });

    it("blocks write-like commands in plan mode", async () => {
      const tool = createRunCommandTool({ mode: "plan", capabilities: new Set(["shell"]) });
      const result = await executeTool(tool, { command: "mkdir", args: ["new-dir"] });
      expect(result).toBe(PLAN_MODE_BLOCKED_MESSAGE);
    });

    it("allows non-mutating commands in plan mode", async () => {
      const tool = createRunCommandTool({ mode: "plan", capabilities: new Set(["shell"]) });
      const result = await executeTool(tool, {
        command: "node",
        args: ["-e", "console.log('plan ok')"],
      });
      expect(result).toContain("plan ok");
    });

    it("requests confirmation for write-like commands in act mode", async () => {
      const request = vi.fn(async () => false);
      const tool = createRunCommandTool({
        mode: "act",
        capabilities: new Set(["shell"]),
        confirm: { getListenerCount: () => 1, request },
      });

      const result = await executeTool(tool, { command: "mkdir", args: ["new-dir"] });

      expect(result).toBe("Denied by user.");
      expect(request).toHaveBeenCalledWith(
        "runCommand",
        JSON.stringify({ command: "mkdir", args: ["new-dir"] }),
        undefined,
      );
    });

    it("runs read-like commands without confirmation", async () => {
      const request = vi.fn(async () => false);
      const tool = createRunCommandTool({
        mode: "act",
        capabilities: new Set(["shell"]),
        confirm: { getListenerCount: () => 1, request },
      });

      const result = await executeTool(tool, {
        command: "node",
        args: ["-e", "console.log('read ok')"],
      });

      expect(result).toContain("read ok");
      expect(request).not.toHaveBeenCalled();
    });

    it("runs commands from the configured workspace root", async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), "excelsior-command-"));
      try {
        const tool = createRunCommandTool({
          mode: "act",
          capabilities: new Set(["shell"]),
          workspaceRoot,
        });

        const result = await executeTool(tool, {
          command: "node",
          args: ["-e", "console.log(process.cwd())"],
        });

        expect(result.trim()).toBe(workspaceRoot);
      } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
      }
    });
  });

  describe("sandbox - dangerous commands", () => {
    it("blocks rm -rf /", async () => {
      const result = await executeTool(runCommandTool, { command: "rm", args: ["-rf", "/"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks rm -rf /*", async () => {
      const result = await executeTool(runCommandTool, { command: "rm", args: ["-rf", "/*"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks mkfs", async () => {
      const result = await executeTool(runCommandTool, { command: "mkfs.ext4", args: ["/dev/sda"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks shutdown", async () => {
      const result = await executeTool(runCommandTool, { command: "shutdown", args: ["now"] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks reboot", async () => {
      const result = await executeTool(runCommandTool, { command: "reboot", args: [] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks fork bomb pattern", async () => {
      const result = await executeTool(runCommandTool, { command: ":(){ :|:& };:", args: [] });
      expect(result).toContain("Blocked dangerous command");
    });

    it("blocks chmod 777 on root", async () => {
      const result = await executeTool(runCommandTool, {
        command: "chmod",
        args: ["-R", "777", "/etc"],
      });
      expect(result).toContain("Blocked dangerous command");
    });

    it("allows safe commands through", async () => {
      const result = await executeTool(runCommandTool, { 
        command: 'node', 
        args: ['-e', 'console.log("safe")'] 
      });
      expect(result).toContain("safe");
      expect(result).not.toContain("Blocked");
    });

    it("allows rm without dangerous path", async () => {
      const result = await executeTool(runCommandTool, { 
        command: 'node', 
        args: ['-e', 'console.log("rm -rf foo")'] 
      });
      expect(result).toContain("rm -rf foo");
      expect(result).not.toContain("Blocked");
    });
  });
});
