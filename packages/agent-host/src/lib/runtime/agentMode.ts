export type AgentMode = "plan" | "act";

export const PLAN_MODE_BLOCKED_MESSAGE = "Plan mode blocks file changes. Switch to Act mode to apply edits.";

export function formatAgentMode(mode: AgentMode): string {
  return mode === "plan" ? "Plan" : "Act";
}
