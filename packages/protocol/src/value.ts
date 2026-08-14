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
  githubToken: string;
  agentToolLoopSteps: string;
  autoReflectionEnabled: boolean;
  reflectionMemoryEnabled?: boolean;
  autoApproveWorkspaceEdits?: boolean;
}

export interface SendOptions {
  displayContent?: string;
  silent?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
  category?: string;
}

export type CommandNavigationTarget = "settings";

export interface CommandResult {
  handled: boolean;
  message?: string;
  openPanelId?: string;
  navigate?: CommandNavigationTarget;
  clearInput?: boolean;
}

export const SESSION_PICKER_PANEL_ID = "session.picker";

export type DiffAction = "create" | "overwrite" | "edit" | "warning";

export type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: DiffAction;
  warning?: string;
};

export type ConfirmResponse = {
  callId: string;
  approved: boolean;
};

export interface AskQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface AskQuestionRequest {
  callId: string;
  question: string;
  options: AskQuestionOption[];
  allowManual: boolean;
}

export interface AskQuestionResponse {
  callId: string;
  answer: string;
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  isManual: boolean;
  cancelled?: boolean;
}

export interface AgentLlmInfo {
  providerName: string;
  modelName: string;
}

export interface ToolCallBlock {
  id: string;
  toolName: string;
  args: string;
  result: string;
  isError: boolean;
  status: "completed" | "interrupted" | "failed";
  startedAt: number;
  endedAt: number;
}

export interface TranscriptBlock {
  id: string;
  turnId: string;
  kind: "user" | "assistant" | "tool-call" | "system";
  role?: "user" | "assistant";
  content: string;
  tool?: ToolCallBlock;
  status: "completed" | "interrupted" | "failed";
  createdAt: number;
  finalizedAt: number;
}

export interface InteractionState {
  confirmation: {
    callId: string;
    request: ConfirmRequest;
    approved: boolean | null;
  } | null;
  question: {
    callId: string;
    request: AskQuestionRequest;
    response: AskQuestionResponse | null;
  } | null;
}

export interface SessionState {
  session: Session;
  blocks: TranscriptBlock[];
  interaction: InteractionState;
  lastTurnId: string | null;
}

export type RunStatus =
  | "running"
  | "committing"
  | "committed"
  | "cancelled"
  | "failed";

export interface RunToolState {
  id: string;
  toolName: string;
  args: unknown;
  status: "streaming-input" | "executing" | "done" | "error" | "denied";
  result?: string;
  isError?: boolean;
}

export type RunItem =
  | { kind: "assistant"; content: string }
  | { kind: "tool-call"; tool: RunToolState };

export interface LiveBlock {
  id: string;
  turnId: string;
  kind: "assistant" | "tool-call";
  content: string;
  tool?: Partial<ToolCallBlock>;
}
