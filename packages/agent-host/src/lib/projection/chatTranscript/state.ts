import type { ProjectedBlock } from "../display.js";
import type { AnyAgentEvent } from "../../runtime/events.js";

export interface PendingTool {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
  result: string;
  isSubAgent: boolean;
}

export interface PendingAssistant {
  id: string;
  fullText: string;
  timestamp: string;
}

export interface ChatTranscriptProjectionState {
  blocks: ProjectedBlock[];
  pendingAssistant: PendingAssistant | null;
  pendingTool: PendingTool | null;
  childRunIdByToolCallId: Map<string, { childRunId: string; role: string }>;
}

export interface ChatTranscriptProjectionContext {
  getChildEvents?: (childRunId: string) => readonly AnyAgentEvent[];
}

export type ChatTranscriptEvent<T extends AnyAgentEvent["type"]> = Extract<
  AnyAgentEvent,
  { type: T }
>;

export function createChatTranscriptProjectionState(): ChatTranscriptProjectionState {
  return {
    blocks: [],
    pendingAssistant: null,
    pendingTool: null,
    childRunIdByToolCallId: new Map(),
  };
}
