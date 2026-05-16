export type AgentMode = "plan" | "act";

export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string | Array<{ type: string; text: string }>;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

export const PLAN_MODE_BLOCKED_MESSAGE =
  "Plan mode blocks file changes. Switch to Act mode to apply edits.";

export function formatAgentMode(mode: AgentMode): string {
  return mode === "plan" ? "Plan" : "Act";
}
