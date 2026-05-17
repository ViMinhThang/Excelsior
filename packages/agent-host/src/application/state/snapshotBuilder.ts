import type { AgentMode, Session, Workspace } from "@excelsior/core";
import type { AgentRun } from "../../lib/runtime/agentRun.js";
import type { AnyAgentEvent } from "../../lib/runtime/events.js";
import type { ProjectionService } from "../projection/ProjectionService.js";
import type { ChatSessionState } from "../types.js";

export interface AgentSnapshotInput {
  sessions: Session[];
  persistedEvents: AnyAgentEvent[];
  activeRun: AgentRun | null;
  childRuns: Map<string, AgentRun>;
  liveEvents: readonly AnyAgentEvent[];
  isLoading: boolean;
  currentSessionId: string | null;
  workspace: Workspace;
  mode: AgentMode;
}

export function buildChatSessionSnapshot(
  input: AgentSnapshotInput,
  projection: ProjectionService,
): ChatSessionState {
  return {
    displayBlocks: projection.buildDisplayBlocks({
      liveEvents: input.liveEvents,
      persistedEvents: input.persistedEvents,
      childRuns: input.childRuns,
    }),
    isLoading: input.isLoading,
    sessions: input.sessions,
    activeRun: input.activeRun,
    currentSessionId: input.currentSessionId,
    workspace: input.workspace,
    mode: input.mode,
  };
}
