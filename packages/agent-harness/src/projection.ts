import type { AgentLlmInfo, AgentMessage, ProjectedTurn, ReflectionClientState, Session, Workspace } from "@excelsior/core";
import type { AnyHarnessEvent } from "./events.js";
import type { HarnessSnapshot } from "./types.js";
import { Projector } from "./projector/Projector.js";

export interface CanonicalReadModel {
  turns: ProjectedTurn[];
  aiHistory: AgentMessage[];
}

export class ProjectionCache {
  private projector = new Projector();

  project(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
    return this.projector.project(events);
  }

  reset(): void {
    this.projector.reset();
  }
}

export function projectHarnessState(input: {
  events: readonly AnyHarnessEvent[];
  readModel?: CanonicalReadModel;
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  llm: AgentLlmInfo;
  mode: HarnessSnapshot["mode"];
  pendingConfirmation: HarnessSnapshot["pendingConfirmation"];
  pendingQuestion: HarnessSnapshot["pendingQuestion"];
  reflection: ReflectionClientState;
}): HarnessSnapshot {
  const readModel = input.readModel ?? projectEvents(input.events);
  return {
    turns: readModel.turns,
    isLoading: input.isLoading,
    sessions: input.sessions,
    currentSessionId: input.currentSessionId,
    workspace: input.workspace,
    llm: input.llm,
    mode: input.mode,
    pendingConfirmation: input.pendingConfirmation,
    pendingQuestion: input.pendingQuestion,
    reflection: input.reflection,
  };
}

export function projectEventsToMessages(events: readonly AnyHarnessEvent[]): AgentMessage[] {
  return projectEvents(events).aiHistory;
}

export function projectEventsToTurns(events: readonly AnyHarnessEvent[]): ProjectedTurn[] {
  return projectEvents(events).turns;
}

export function projectEvents(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
  return new ProjectionCache().project(events);
}
