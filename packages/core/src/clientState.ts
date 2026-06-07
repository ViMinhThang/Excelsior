import type { AgentMode } from "./agent.js";
import type { ConfirmRequest } from "./confirmation.js";
import type { ProjectedBlock } from "./projection.js";
import type { AskQuestionRequest } from "./question.js";
import type { Session, Workspace } from "./session.js";

export interface AgentLlmInfo {
  providerName: string;
  modelName: string;
}

export interface AgentClientState {
  displayBlocks: ProjectedBlock[];
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  llm: AgentLlmInfo;
  mode: AgentMode;
  pendingConfirmation: ConfirmRequest | null;
  pendingQuestion: AskQuestionRequest | null;
}
