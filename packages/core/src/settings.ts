export const AGENT_TOOL_LOOP_STEPS_SETTING = "AGENT_TOOL_LOOP_STEPS";
export const DEFAULT_AGENT_TOOL_LOOP_STEPS = "unlimited";

export function normalizeAgentToolLoopSteps(
  value: string | null | undefined,
): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === DEFAULT_AGENT_TOOL_LOOP_STEPS) {
    return DEFAULT_AGENT_TOOL_LOOP_STEPS;
  }

  const stepLimit = Number(normalized);
  if (!Number.isInteger(stepLimit) || stepLimit < 1) {
    return DEFAULT_AGENT_TOOL_LOOP_STEPS;
  }

  return String(stepLimit);
}

export interface AppSettings {
  deepseekApiKey: string;
  githubToken: string;
  agentToolLoopSteps: string;
  autoReflectionEnabled: boolean;
  reflectionMemoryEnabled?: boolean;
  autoApproveWorkspaceEdits?: boolean;
}
