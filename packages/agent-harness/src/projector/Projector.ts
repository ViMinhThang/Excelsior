import type { AgentMessage, ProjectedBlock, ProjectedTurn } from "@excelsior/core";
import type { AnyHarnessEvent, HarnessEventType } from "../events.js";
import { MessageHandler } from "./MessageHandler.js";
import { ToolHandler } from "./ToolHandler.js";
import { SubAgentHandler } from "./SubAgentHandler.js";
import { ReasoningHandler } from "./ReasoningHandler.js";
import { LifecycleHandler } from "./LifecycleHandler.js";
import type { ProjectionHandler, ProjectionState } from "./types.js";
import {
  toolBlockFromDraft,
  ensureTurn,
  upsertBlockInTurn,
} from "./utils.js";

export class Projector {
  private handlers = new Map<HarnessEventType, ProjectionHandler>();
  private state!: ProjectionState;
  private appliedCount = 0;
  private lastEventId: string | undefined;

  constructor() {
    this.reset();
    this.registerHandlers([
      new MessageHandler(),
      new ToolHandler(),
      new SubAgentHandler(),
      new ReasoningHandler(),
      new LifecycleHandler(),
    ]);
  }

  private registerHandlers(handlers: ProjectionHandler[]): void {
    for (const handler of handlers) {
      for (const eventType of handler.handles) {
        this.handlers.set(eventType, handler);
      }
    }
  }

  public reset(): void {
    this.state = {
      turns: [],
      currentTurnId: null,
      aiHistory: [],
      displayIdCounts: new Map(),
      assistant: null,
      reasoning: null,
      tool: null,
      subAgentStates: new Map(),
    };
    this.appliedCount = 0;
    this.lastEventId = undefined;
  }

  private canApplyIncrementally(events: readonly AnyHarnessEvent[]): boolean {
    if (this.appliedCount === 0) return true;
    if (this.appliedCount > events.length) return false;
    return events[this.appliedCount - 1]?.id === this.lastEventId;
  }

  public project(events: readonly AnyHarnessEvent[]): { turns: ProjectedTurn[]; aiHistory: AgentMessage[] } {
    if (!this.canApplyIncrementally(events)) {
      this.reset();
    }

    for (let i = this.appliedCount; i < events.length; i++) {
      const event = events[i]!;
      const handler = this.handlers.get(event.type);
      if (handler) {
        handler.apply(event, this.state);
      }
    }

    this.appliedCount = events.length;
    this.lastEventId = events.at(-1)?.id;

    return {
      turns: this.materializeTurns(),
      aiHistory: [...this.state.aiHistory],
    };
  }

  private materializeTurns(): ProjectedTurn[] {
    const turns: ProjectedTurn[] = this.state.turns.map(t => ({
      ...t,
      blocks: [...t.blocks],
    }));

    // If there is an active/current turn ID, locate it or ensure it in the materialized output
    let activeTurnId = this.state.currentTurnId;
    if (!activeTurnId) {
      if (turns.length === 0 && !this.state.assistant && !this.state.reasoning && !this.state.tool) {
        return [];
      }
      if (this.state.turns.length > 0) {
        activeTurnId = this.state.turns[this.state.turns.length - 1].id;
      } else {
        activeTurnId = "turn_default";
      }
      this.state.currentTurnId = activeTurnId;
    }

    let activeTurn = turns.find(t => t.id === activeTurnId);
    if (!activeTurn && activeTurnId) {
      activeTurn = {
        id: activeTurnId,
        status: "in-progress",
        blocks: [],
      };
      turns.push(activeTurn);
    }

    if (activeTurn) {
      if (this.state.assistant?.content.trim()) {
        activeTurn.blocks = upsertSnapshotBlockInBlocks(activeTurn.blocks, {
          type: "assistant",
          id: this.snapshotBlockId(this.state.assistant.id, activeTurn.blocks),
          content: this.state.assistant.content,
          timestamp: this.state.assistant.timestamp,
          ...(this.state.assistant.frozen ? { isFrozen: true as const } : {}),
        });
      }
      if (this.state.reasoning) {
        activeTurn.blocks = upsertSnapshotBlockInBlocks(activeTurn.blocks, {
          type: "reasoning",
          id: this.snapshotBlockId(this.state.reasoning.id, activeTurn.blocks),
          content: this.state.reasoning.content,
          timestamp: this.state.reasoning.timestamp,
          ...(this.state.reasoning.frozen ? { isFrozen: true as const } : {}),
        });
      }
      if (this.state.tool) {
        activeTurn.blocks = upsertSnapshotBlockInBlocks(activeTurn.blocks, toolBlockFromDraft(
          this.state.tool,
          false,
          this.state.subAgentStates.get(this.state.tool.id),
        ));
      }
    }

    return turns;
  }

  private snapshotBlockId(id: string, blocks: readonly ProjectedBlock[]): string {
    if (!blocks.some((block) => block.id === id)) return id;
    let suffix = 2;
    while (blocks.some((block) => block.id === `${id}:${suffix}`)) suffix++;
    return `${id}:${suffix}`;
  }
}

// Internal helper for materialization to avoid mutating the core state's blocks directly
function upsertSnapshotBlockInBlocks(blocks: ProjectedBlock[], block: ProjectedBlock): ProjectedBlock[] {
  const existingIndex = blocks.findIndex((item) => item.id === block.id);
  if (existingIndex === -1) return [...blocks, block];
  const next = [...blocks];
  next[existingIndex] = block;
  return next;
}
