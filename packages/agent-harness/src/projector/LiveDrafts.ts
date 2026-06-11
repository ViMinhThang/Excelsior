import type { ProjectedBlock, ProjectedSubAgent, ProjectedTurn } from "@excelsior/core";
import type { AssistantDraft, ToolDraft } from "./types.js";
import { TurnStore } from "./TurnStore.js";
import {
  toolBlockFromDraft,
} from "./utils.js";

export class LiveDrafts {
  private assistant: AssistantDraft | null = null;
  private reasoning: AssistantDraft | null = null;
  private tool: ToolDraft | null = null;
  private readonly displayIdCounts = new Map<string, number>();

  constructor(
    private readonly turns: TurnStore,
    private readonly subAgentStates: Map<string, ProjectedSubAgent>,
  ) {}

  reset(): void {
    this.assistant = null;
    this.reasoning = null;
    this.tool = null;
    this.displayIdCounts.clear();
  }

  get activeTool(): ToolDraft | null {
    return this.tool;
  }

  startAssistant(input: AssistantDraft, turnId?: string): void {
    this.flushTool(true);
    this.assistant = input;
    if (turnId && !this.turns.currentId) this.turns.currentId = turnId;
  }

  updateAssistant(input: { id: string; delta: string; timestamp: string }, turnId?: string): void {
    this.flushTool(true);
    const previousContent = this.assistant?.id === input.id ? this.assistant.content : "";
    this.assistant = {
      id: input.id,
      content: `${previousContent}${input.delta}`,
      timestamp: input.timestamp,
      frozen: false,
    };
    if (turnId && !this.turns.currentId) this.turns.currentId = turnId;
  }

  finishAssistant(input: AssistantDraft, turnId?: string): void {
    this.flushTool(true);
    this.assistant = input;
    this.flushAssistant(true, turnId);
  }

  finishReasoning(input: AssistantDraft, turnId?: string): void {
    this.flushAll(true, turnId);
    this.reasoning = input;
    this.flushReasoning(true, turnId);
  }

  startTool(input: ToolDraft, turnId?: string): void {
    this.flushAssistant(true, turnId);
    this.flushTool(true);
    this.tool = input;
  }

  updateTool(input: { id: string; delta: string; timestamp: string }): void {
    if (!this.tool || this.tool.id !== input.id) return;
    this.tool = {
      ...this.tool,
      toolArgs: `${this.tool.toolArgs}${input.delta}`,
      timestamp: input.timestamp,
    };
  }

  finishTool(input: ToolDraft): void {
    this.tool = {
      ...input,
      startTimestamp: this.tool?.id === input.id ? this.tool.startTimestamp : input.startTimestamp,
    };
    this.flushTool(true);
  }

  flushAssistant(forceFrozen?: boolean, turnId?: string): void {
    if (!this.assistant) return;
    if (this.assistant.content.trim()) {
      this.turns.upsertBlock(turnId, {
        type: "assistant",
        id: this.nextDisplayBlockId(this.assistant.id),
        content: this.assistant.content,
        timestamp: this.assistant.timestamp,
        ...(forceFrozen || this.assistant.frozen ? { isFrozen: true as const } : {}),
      });
    }
    this.assistant = null;
  }

  flushTool(forceFrozen?: boolean): void {
    if (!this.tool) return;
    this.upsertTool(this.tool, forceFrozen);
    this.tool = null;
  }

  flushReasoning(forceFrozen?: boolean, turnId?: string): void {
    if (!this.reasoning) return;
    this.turns.upsertBlock(turnId, {
      type: "reasoning",
      id: this.reasoning.id,
      content: this.reasoning.content,
      timestamp: this.reasoning.timestamp,
      ...(forceFrozen || this.reasoning.frozen ? { isFrozen: true as const } : {}),
    });
    this.reasoning = null;
  }

  flushAll(forceFrozen?: boolean, turnId?: string): void {
    this.flushAssistant(forceFrozen, turnId);
    this.flushTool(forceFrozen);
    this.flushReasoning(forceFrozen, turnId);
  }

  upsertTool(draft: ToolDraft, forceFrozen?: boolean): void {
    const block = toolBlockFromDraft(draft, forceFrozen, this.subAgentStates.get(draft.id));
    this.turns.upsertBlock(draft.id.split(":")[0], block);
  }

  materialize(): ProjectedTurn[] {
    const turns = this.turns.snapshot();
    const activeTurn = this.ensureMaterializedActiveTurn(turns);
    if (!activeTurn) return turns;

    if (this.assistant?.content.trim()) {
      activeTurn.blocks = upsertSnapshotBlock(activeTurn.blocks, {
        type: "assistant",
        id: this.snapshotBlockId(this.assistant.id, activeTurn.blocks),
        content: this.assistant.content,
        timestamp: this.assistant.timestamp,
        ...(this.assistant.frozen ? { isFrozen: true as const } : {}),
      });
    }

    if (this.reasoning) {
      activeTurn.blocks = upsertSnapshotBlock(activeTurn.blocks, {
        type: "reasoning",
        id: this.snapshotBlockId(this.reasoning.id, activeTurn.blocks),
        content: this.reasoning.content,
        timestamp: this.reasoning.timestamp,
        ...(this.reasoning.frozen ? { isFrozen: true as const } : {}),
      });
    }

    if (this.tool) {
      activeTurn.blocks = upsertSnapshotBlock(
        activeTurn.blocks,
        toolBlockFromDraft(this.tool, false, this.subAgentStates.get(this.tool.id)),
      );
    }

    return turns;
  }

  private ensureMaterializedActiveTurn(turns: ProjectedTurn[]): ProjectedTurn | null {
    let activeTurnId = this.turns.currentId;
    if (!activeTurnId) {
      if (turns.length === 0 && !this.assistant && !this.reasoning && !this.tool) {
        return null;
      }
      activeTurnId = this.turns.list().at(-1)?.id ?? "turn_default";
      this.turns.currentId = activeTurnId;
    }

    let activeTurn = turns.find((turn) => turn.id === activeTurnId);
    if (!activeTurn) {
      activeTurn = {
        id: activeTurnId,
        status: "in-progress",
        blocks: [],
      };
      turns.push(activeTurn);
    }
    return activeTurn;
  }

  private nextDisplayBlockId(id: string): string {
    const count = this.displayIdCounts.get(id) ?? 0;
    this.displayIdCounts.set(id, count + 1);
    return count === 0 ? id : `${id}:${count + 1}`;
  }

  private snapshotBlockId(id: string, blocks: readonly ProjectedBlock[]): string {
    if (!blocks.some((block) => block.id === id)) return id;
    let suffix = 2;
    while (blocks.some((block) => block.id === `${id}:${suffix}`)) suffix++;
    return `${id}:${suffix}`;
  }
}

function upsertSnapshotBlock(blocks: ProjectedBlock[], block: ProjectedBlock): ProjectedBlock[] {
  const existingIndex = blocks.findIndex((item) => item.id === block.id);
  if (existingIndex === -1) return [...blocks, block];
  const next = [...blocks];
  next[existingIndex] = block;
  return next;
}
