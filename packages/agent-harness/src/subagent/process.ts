import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildOutput } from "@excelsior/core";
import { SUB_AGENT_EVENT } from "../events.js";
import type { ToolExecutionContext, ToolResult } from "../types.js";
import { PROGRESS_BATCH_CHARS, PROGRESS_BATCH_INTERVAL_MS, ProgressBatcher } from "../context/ProgressBatcher.js";
import { ChildOutputLineReader } from "./protocol.js";

type ProgressDelta =
  | { type: "text_delta"; delta: string }
  | { type: "tool_update"; toolCallId: string; delta: string };

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
    let stderr = "";
    let finalOutput = "";
    let settled = false;

    const progress = new ProgressBatcher<ProgressDelta>({
      intervalMs: PROGRESS_BATCH_INTERVAL_MS,
      chars: PROGRESS_BATCH_CHARS,
      count: (delta) => delta.delta.length,
      onFlush: (payloads) => {
        for (const delta of payloads) {
          emitChildEvent(delta);
        }
      },
    });

    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: input.ctx.workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    });

    const finish = (content: string, isError = false) => {
      if (settled) return;
      settled = true;
      progress.flush();
      input.ctx.abortSignal?.removeEventListener("abort", abort);
      if (isError) {
        emitChildEvent({ type: "error", message: content });
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

    const reader = new ChildOutputLineReader((output) => {
      if (output.type === "final") {
        finalOutput = output.content;
        progress.flush();
        emitChildEvent(output);
      } else if (output.type === "text_delta" || output.type === "tool_update") {
        progress.append(output);
      } else if (output.type === "tool_start" || output.type === "tool_end" || output.type === "error") {
        progress.flush();
        emitChildEvent(output);
      }
    });

    child.stdout.on("data", (data) => {
      reader.push(String(data));
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
      reader.flush();
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

    function emitChildEvent(event: ChildOutput): void {
      input.ctx.emit?.(SUB_AGENT_EVENT, {
        parentToolCallId: input.parentToolCallId,
        event,
      }, { relatedToolCallId: input.parentToolCallId });
    }
  });
}

function resolveChildRunner(workspaceRoot: string): { command: string; args: string[] } {
  const workspaceBuiltRunner = join(workspaceRoot, "packages/agent-harness/dist/subagent/childRunner.js");
  const workspaceSourceRunner = join(workspaceRoot, "packages/agent-harness/src/subagent/childRunner.ts");

  const isElectron = process.versions.electron !== undefined;
  const nodeCommand = isElectron ? "node" : process.execPath;

  if (existsSync(workspaceBuiltRunner)) {
    return { command: nodeCommand, args: [workspaceBuiltRunner] };
  }
  if (existsSync(workspaceSourceRunner)) {
    const tsxCli = join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");
    return { command: nodeCommand, args: [tsxCli, workspaceSourceRunner] };
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const builtRunner = join(currentDir, "childRunner.js");
  if (existsSync(builtRunner)) {
    return { command: nodeCommand, args: [builtRunner] };
  }

  const sourceRunner = join(currentDir, "childRunner.ts");
  const tsxCli = join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return { command: nodeCommand, args: [tsxCli, sourceRunner] };
}
