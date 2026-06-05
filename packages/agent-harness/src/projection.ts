import type { AgentMessage, ProjectedBlock, Session, Workspace } from "@excelsior/core";
import type { AnyHarnessEvent } from "./events.js";
import type { HarnessSnapshot } from "./types.js";
import { ProjectionAssistantState } from "./context/AssistantStateMachine.js";

export interface CanonicalReadModel {
  displayBlocks: ProjectedBlock[];
  aiHistory: AgentMessage[];
}

export class ProjectionCache {
  private stateMachine = new ProjectionAssistantState();
  private appliedEventCount = 0;
  private lastAppliedEventId: string | undefined;

  project(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
    if (!this.canApplyIncrementally(events)) {
      this.reset();
    }

    for (let index = this.appliedEventCount; index < events.length; index++) {
      this.stateMachine.applyEvent(events[index]!);
    }
    this.appliedEventCount = events.length;
    this.lastAppliedEventId = events.at(-1)?.id;
    return this.stateMachine.getCanonicalReadModel();
  }

  reset(): void {
    this.stateMachine = new ProjectionAssistantState();
    this.appliedEventCount = 0;
    this.lastAppliedEventId = undefined;
  }

  private canApplyIncrementally(events: readonly AnyHarnessEvent[]): boolean {
    if (this.appliedEventCount === 0) return true;
    if (this.appliedEventCount > events.length) return false;
    return events[this.appliedEventCount - 1]?.id === this.lastAppliedEventId;
  }
}

export function projectHarnessState(input: {
  events: readonly AnyHarnessEvent[];
  readModel?: CanonicalReadModel;
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  mode: HarnessSnapshot["mode"];
  pendingConfirmation: HarnessSnapshot["pendingConfirmation"];
  pendingQuestion: HarnessSnapshot["pendingQuestion"];
}): HarnessSnapshot {
  const readModel = input.readModel ?? projectEvents(input.events);
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
  return new ProjectionCache().project(events);
}
