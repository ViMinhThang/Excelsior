import type { AgentMode } from "./agent.js";
import type { ConfirmRequest } from "./confirmation.js";
import type { ProjectedTurn } from "./projection.js";
import type { AskQuestionRequest } from "./question.js";
import type { Session, Workspace } from "./session.js";

export interface AgentLlmInfo {
  providerName: string;
  modelName: string;
}

export interface ReflectionClientState {
  status: "idle" | "running" | "failed";
  lastRunAt?: string;
  lastSummary?: string;
  touchedFiles: string[];
  memoryRoot: string;
}

export interface AgentClientState {
  turns: ProjectedTurn[];
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  llm: AgentLlmInfo;
  mode: AgentMode;
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
  reflection: ReflectionClientState;
}
