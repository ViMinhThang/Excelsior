import type { AgentMessage, ProjectedBlock, Session, Workspace } from "@excelsior/core";
import type { AnyHarnessEvent } from "./events.js";
import type { HarnessSnapshot } from "./types.js";
import { AssistantStateMachine } from "./context/index.js";

interface CanonicalReadModel {
  displayBlocks: ProjectedBlock[];
  aiHistory: AgentMessage[];
}

export function projectHarnessState(input: {
  events: readonly AnyHarnessEvent[];
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  mode: HarnessSnapshot["mode"];
  pendingConfirmation: HarnessSnapshot["pendingConfirmation"];
  pendingQuestion: HarnessSnapshot["pendingQuestion"];
}): HarnessSnapshot {
  const readModel = projectEvents(input.events);
  return {
    displayBlocks: readModel.displayBlocks,
    isLoading: input.isLoading,
    sessions: input.sessions,
    currentSessionId: input.currentSessionId,
    workspace: input.workspace,
    mode: input.mode,
    pendingConfirmation: input.pendingConfirmation,
    pendingQuestion: input.pendingQuestion,
  };
}

export function projectEventsToMessages(events: readonly AnyHarnessEvent[]): AgentMessage[] {
  return projectEvents(events).aiHistory;
}

export function projectEventsToDisplayBlocks(events: readonly AnyHarnessEvent[]): ProjectedBlock[] {
  return projectEvents(events).displayBlocks;
}

export function projectEvents(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
  const stateMachine = new AssistantStateMachine();
  for (const event of events) {
    stateMachine.applyEvent(event);
  }
  return stateMachine.getCanonicalReadModel();
}
