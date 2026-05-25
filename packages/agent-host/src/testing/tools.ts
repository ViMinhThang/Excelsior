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
export { classifyCommandRisk } from "../tooling/commandRisk.js";
export { createToolContext } from "../tooling/context.js";
export { authorizeToolAction } from "../tooling/policy.js";
export { FileCheckpoint } from "../revert/fileCheckpoint.js";
export { getWorkspaceRoot, resolveWorkspacePath, validateWorkspacePattern } from "../tooling/workspace.js";
export type {
  CompletedFileCheckpoint,
  FileCheckpointConflict,
  FileCheckpointEntry,
  FileCheckpointRestoreResult,
} from "../revert/fileCheckpoint.js";
export type {
  ConfirmCapability,
  RevertCapability,
  ToolCapability,
  ToolContext,
} from "../tooling/context.js";
export type {
  CommandRiskClassification,
  CommandRiskKind,
} from "../tooling/commandRisk.js";
export type {
  ToolActionRequest,
  ToolAuthorizationResult,
  ToolModePolicy,
  ToolRisk,
} from "../tooling/policy.js";
export { PLAN_MODE_BLOCKED_MESSAGE };

export async function executeTool<TInput, TOptions = unknown>(
  tool: { execute?: unknown },
  input: TInput,
  options?: TOptions,
): Promise<string> {
  if (typeof tool.execute !== "function") {
    throw new Error("Tool does not expose an execute function.");
  }
  const execute = tool.execute as (input: TInput, options?: TOptions) => unknown;
  const result = await execute(input, options);
  return typeof result === "string" ? result : String(result);
}
