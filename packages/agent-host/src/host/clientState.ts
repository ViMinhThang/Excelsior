import type { AgentClientState, ConfirmRequest } from "@excelsior/core";
import type { ChatSessionState } from "../application/types.js";

export function createAgentClientState(
  snapshot: ChatSessionState,
  pendingConfirmation: ConfirmRequest | null,
): AgentClientState {
  return {
    displayBlocks: snapshot.displayBlocks,
    isLoading: snapshot.isLoading,
    sessions: snapshot.sessions,
    currentSessionId: snapshot.currentSessionId,
    workspace: snapshot.workspace,
    mode: snapshot.mode,
    pendingConfirmation,
  };
}
