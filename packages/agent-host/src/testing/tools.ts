import { PLAN_MODE_BLOCKED_MESSAGE } from "@excelsior/core";

export { createEditTool } from "../agent/tools/fs/edit.js";
export { createGlobTool } from "../agent/tools/fs/glob.js";
export { createLsTool } from "../agent/tools/fs/ls.js";
export { createRipgrepTool } from "../agent/tools/fs/ripgrep.js";
export { createViewTool } from "../agent/tools/fs/view.js";
export { createWriteTool } from "../agent/tools/fs/write.js";
export { createRunCommandTool } from "../agent/tools/runCommand/runCommand.js";
export { runCommandSchema } from "../agent/tools/runCommand/types.js";
export { createSpawnSubAgentTool } from "../agent/spawn/spawnSubAgent.js";
export { classifyCommandRisk } from "../lib/tool/commandRisk.js";
export { createToolContext } from "../lib/tool/context.js";
export { authorizeToolAction } from "../lib/tool/policy.js";
export { FileCheckpoint } from "../lib/revert/fileCheckpoint.js";
export { getWorkspaceRoot, resolveWorkspacePath, validateWorkspacePattern } from "../lib/tool/workspace.js";
export type {
  CompletedFileCheckpoint,
  FileCheckpointConflict,
  FileCheckpointEntry,
  FileCheckpointRestoreResult,
} from "../lib/revert/fileCheckpoint.js";
export type {
  ConfirmCapability,
  RevertCapability,
  ToolCapability,
  ToolContext,
} from "../lib/tool/context.js";
export type {
  CommandRiskClassification,
  CommandRiskKind,
} from "../lib/tool/commandRisk.js";
export type {
  ToolActionRequest,
  ToolAuthorizationResult,
  ToolModePolicy,
  ToolRisk,
} from "../lib/tool/policy.js";
export { PLAN_MODE_BLOCKED_MESSAGE };

interface ExecutableTool<TInput, TResult = unknown, TOptions = unknown> {
  execute(input: TInput, options?: TOptions): TResult | Promise<TResult>;
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
