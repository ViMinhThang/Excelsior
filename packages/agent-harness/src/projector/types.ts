import type { AgentMessage, ProjectedBlock, ProjectedSubAgent, ProjectedTurn } from "@excelsior/core";
import type { AnyHarnessEvent, HarnessEventType } from "../events.js";

export interface AssistantDraft {
  id: string;
  content: string;
  timestamp: string;
  frozen: boolean;
}

export interface ToolDraft {
  id: string;
  toolName: string;
  toolArgs: string;
  status: "pending" | "completed" | "error";
  result: string;
  timestamp: string;
  startTimestamp: string;
  endTimestamp?: string;
}

export interface ProjectionState {
  turns: ProjectedTurn[];
  currentTurnId: string | null;
  aiHistory: AgentMessage[];
  displayIdCounts: Map<string, number>;
  assistant: AssistantDraft | null;
  reasoning: AssistantDraft | null;
  tool: ToolDraft | null;
  subAgentStates: Map<string, ProjectedSubAgent>;
}

export interface ProjectionHandler {
  handles: ReadonlySet<HarnessEventType>;
  apply(event: AnyHarnessEvent, state: ProjectionState): void;
}
