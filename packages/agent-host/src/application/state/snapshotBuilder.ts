import type { AgentMode, Session, Workspace } from "@excelsior/core";
import type { AgentRun } from "../../runtime/agentRun.js";
import type { AnyAgentEvent } from "../../runtime/events.js";
import { ProjectionPolicy } from "../projection/ProjectionPolicy.js";
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
  projection: ProjectionPolicy,
): ChatSessionState {
  const projected = projection.project({
    liveEvents: input.liveEvents,
    persistedEvents: input.persistedEvents,
    childRuns: input.childRuns,
  });

  return {
    displayBlocks: projected.displayBlocks,
    isLoading: input.isLoading,
    sessions: input.sessions,
    activeRun: input.activeRun,
    currentSessionId: input.currentSessionId,
    workspace: input.workspace,
    mode: input.mode,
  };
}
