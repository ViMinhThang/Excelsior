import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUB_AGENT_EVENT } from "./events.js";
import type { ToolExecutionContext, ToolResult } from "./types.js";

type ChildOutput =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; toolArgs: string }
  | { type: "tool_update"; toolCallId: string; delta: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; toolArgs: string; isError: boolean }
  | { type: "final"; content: string }
  | { type: "error"; message: string };

interface RunSpawnedSubAgentInput {
  role: string;
  prompt: string;
  parentToolCallId: string;
  ctx: ToolExecutionContext;
}

export function runSpawnedSubAgent(input: RunSpawnedSubAgentInput): Promise<ToolResult> {
  const settings = input.ctx.settings;
  if (!settings) return Promise.resolve({ content: "Subagent settings are unavailable.", isError: true });
  if (!input.ctx.emit) return Promise.resolve({ content: "Subagent event emitter is unavailable.", isError: true });

  const spawnSpec = resolveChildRunner(input.ctx.workspaceRoot);
  return new Promise((resolveResult) => {
    let stdoutBuffer = "";
    let stderr = "";
    let finalOutput = "";
    let settled = false;

    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: input.ctx.workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (content: string, isError = false) => {
      if (settled) return;
      settled = true;
      input.ctx.abortSignal?.removeEventListener("abort", abort);
      if (isError) {
        input.ctx.emit?.(SUB_AGENT_EVENT, {
          parentToolCallId: input.parentToolCallId,
          event: { type: "error", message: content },
        }, { relatedToolCallId: input.parentToolCallId });
      }
      resolveResult({ content, isError });
    };

    const abort = () => {
      try {
        child.kill();
      } catch {
        // best effort
      }
      finish("Subagent cancelled.", true);
    };

    input.ctx.abortSignal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (data) => {
      stdoutBuffer += String(data);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        handleLine(line);
      }
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT"
        ? `Subagent runner not found: ${spawnSpec.command}`
        : `Subagent runner failed: ${error.message}`, true);
    });
    child.on("close", (code) => {
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
      if (settled) return;
      if (code === 0) {
        finish(finalOutput || "(no output)");
        return;
      }
      finish(finalOutput || stderr.trim() || `Subagent failed with exit code ${code}.`, true);
    });

    child.stdin.end(JSON.stringify({
      workspaceRoot: input.ctx.workspaceRoot,
      role: input.role,
      prompt: input.prompt,
      settings,
      projectInstructions: input.ctx.projectInstructions,
      skillsList: input.ctx.skillsList,
    }));

    function handleLine(line: string): void {
      if (!line.trim()) return;
      let parsed: ChildOutput;
      try {
        parsed = JSON.parse(line) as ChildOutput;
      } catch {
        return;
      }
      if (parsed.type === "final") {
        finalOutput = parsed.content;
      }
      input.ctx.emit?.(SUB_AGENT_EVENT, {
        parentToolCallId: input.parentToolCallId,
        event: parsed,
      }, { relatedToolCallId: input.parentToolCallId });
    }
  });
}

function resolveChildRunner(workspaceRoot: string): { command: string; args: string[] } {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const builtRunner = join(currentDir, "subagentChildRunner.js");
  if (existsSync(builtRunner)) {
    return { command: process.execPath, args: [builtRunner] };
  }

  const sourceRunner = join(currentDir, "subagentChildRunner.ts");
  const tsxCli = join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return { command: process.execPath, args: [tsxCli, sourceRunner] };
}
