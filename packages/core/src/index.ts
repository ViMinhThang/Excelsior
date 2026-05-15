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

export interface Session {
  id: string;
  startedAt: string;
  updatedAt: string;
  metadata: { userInput: string } & Record<string, unknown>;
  workspaceId?: string;
  title?: string;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
}

export interface ToolCallInfo {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
}

export type ToolCallStatus = "pending" | "completed" | "error";

export type ProjectedBlock =
  | {
      type: "user";
      id: string;
      content: string;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "assistant";
      id: string;
      content: string;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "tool-call";
      id: string;
      toolName: string;
      toolArgs: string;
      status: ToolCallStatus;
      content: string;
      timestamp: string;
      isFrozen?: true;
    }
  | {
      type: "sub-agent";
      id: string;
      role: string;
      state: ProjectedSubAgent;
      timestamp: string;
      isFrozen?: true;
    };

export interface ProjectedSubAgent {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentProjectionPart[];
  startTime?: number;
  endTime?: number;
}

export type SubAgentProjectionPart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      toolArgs: string;
      toolCallId: string;
      status: "pending" | "completed" | "error";
    };

export interface SubAgentViewModel {
  toolCallId: string;
  role: string;
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  outputParts: SubAgentProjectionPart[];
  toolCalls: ToolCallInfo[];
  startTime?: number;
  endTime?: number;
}

export function toSubAgentViewModel(
  display: ProjectedSubAgent,
  toolCallId: string,
  role: string,
): SubAgentViewModel {
  return {
    toolCallId,
    role,
    status: display.status,
    latestLine: display.latestLine,
    fullOutput: display.fullOutput,
    outputParts: display.parts,
    toolCalls: display.toolCalls,
    startTime: display.startTime,
    endTime: display.endTime,
  };
}

export type DiffAction = "create" | "overwrite" | "edit";

export type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: DiffAction;
};

export interface AppSettings {
  deepseekApiKey: string;
  githubToken: string;
}

export interface SendOptions {
  displayContent?: string;
  silent?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
}

export type CommandNavigationTarget = "settings";

export interface CommandResult {
  handled: boolean;
  message?: string;
  openPanelId?: string;
  navigate?: CommandNavigationTarget;
  clearInput?: boolean;
}

export interface AgentClientState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  mode: AgentMode;
  pendingConfirmation: ConfirmRequest | null;
}

export const SESSION_PICKER_PANEL_ID = "session.picker";
