import { PLAN_MODE_BLOCKED_MESSAGE } from "../lib/runtime/agentMode.js";
import type { ToolContext } from "../lib/tool/context.js";

export { createEditTool } from "../agent/tools/fs/edit.js";
export { createGlobTool } from "../agent/tools/fs/glob.js";
export { createRipgrepTool } from "../agent/tools/fs/ripgrep.js";
export { createViewTool } from "../agent/tools/fs/view.js";
export { createWriteTool } from "../agent/tools/fs/write.js";
export { createRunCommandTool } from "../agent/tools/runCommand/runCommand.js";
export { runCommandSchema } from "../agent/tools/runCommand/type.js";
export { createSpawnSubAgentTool } from "../agent/spawn/spawnSubAgent.js";
export { createToolContext } from "../lib/tool/context.js";
export type { ConfirmCapability, ToolCapability, ToolContext } from "../lib/tool/context.js";
export { PLAN_MODE_BLOCKED_MESSAGE };

export interface ExecutableTool<TInput, TResult = unknown, TOptions = unknown> {
  execute(input: TInput, options?: TOptions): TResult | Promise<TResult>;
}

export function createTestToolContext(
  overrides: Partial<ToolContext> = {},
): ToolContext {
  return {
    capabilities: new Set(["fs:read", "fs:write", "shell"]),
    workspaceRoot: process.cwd(),
    ...overrides,
  };
}

export async function executeTool<TInput, TResult = unknown, TOptions = unknown>(
  tool: ExecutableTool<TInput, TResult, TOptions>,
  input: TInput,
  options?: TOptions,
): Promise<TResult> {
  if (typeof tool.execute !== "function") {
    throw new Error("Tool does not expose an execute function.");
  }
  return tool.execute(input, options);
}
