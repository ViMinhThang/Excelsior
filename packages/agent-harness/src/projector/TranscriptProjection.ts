import type { AgentMessage, ProjectedBlock, ProjectedSubAgent, ProjectedTurn } from "@excelsior/core";
import type { AnyHarnessEvent, HarnessMessage } from "../events.js";
import type { ProjectionContext, ProjectionHandler } from "./types.js";
import { AiHistory } from "./AiHistory.js";
import { LiveDrafts } from "./LiveDrafts.js";
import { TurnStore } from "./TurnStore.js";
import {
  readRoleFromToolArgs,
  toolBlockFromDraft,
  updateSubAgentState,
} from "./utils.js";

export interface ProjectionSnapshot {
  turns: ProjectedTurn[];
  aiHistory: AgentMessage[];
}

export class TranscriptProjection implements ProjectionContext {
  private readonly turns = new TurnStore();
  private readonly history = new AiHistory();
  private readonly subAgentStates = new Map<string, ProjectedSubAgent>();
  private readonly drafts = new LiveDrafts(this.turns, this.subAgentStates);

  public readonly messages = {
    startAssistant: (input: { id: string; content: string; turnId?: string; timestamp: string }) => {
      this.drafts.startAssistant({ ...input, frozen: false }, input.turnId);
    },
    updateAssistant: (input: { id: string; delta: string; turnId?: string; timestamp: string }) => {
      this.drafts.updateAssistant(input, input.turnId);
    },
    finishUser: (input: { message: HarnessMessage; turnId?: string; timestamp: string }) => {
      this.drafts.flushAll(true, input.turnId);
      this.turns.upsertBlock(input.turnId, {
        type: "user",
        id: this.nextDisplayBlockId(input.message.id),
        content: input.message.content,
        timestamp: input.timestamp,
        isFrozen: true,
      });
      this.history.appendMessage(input.message);
    },
    finishAssistant: (input: { message: HarnessMessage; turnId?: string; timestamp: string }) => {
      this.drafts.finishAssistant({
        id: input.message.id,
        content: input.message.content,
        timestamp: input.timestamp,
        frozen: true,
      }, input.turnId);
      if (input.message.content.trim()) {
        this.history.appendMessage(input.message);
      }
    },
    finishToolMessage: (input: { message: HarnessMessage }) => {
      this.history.appendMessage(input.message);
    },
  };

  public readonly tools = {
    start: (input: { id: string; toolName: string; toolArgs: string; turnId?: string; timestamp: string }) => {
      this.drafts.startTool({
        id: input.id,
        toolName: input.toolName,
        toolArgs: input.toolArgs,
        status: "pending",
        result: "",
        timestamp: input.timestamp,
        startTimestamp: input.timestamp,
      }, input.turnId);
    },
    update: (input: { id: string; delta: string; turnId?: string; timestamp: string }) => {
      this.drafts.updateTool(input);
    },
    finish: (input: {
      id: string;
      toolCallId: string;
      toolName: string;
      toolArgs: string;
      result: string;
      isError: boolean;
      turnId?: string;
      timestamp: string;
    }) => {
      this.history.appendToolCall({
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        toolArgs: input.toolArgs,
      });
      this.drafts.finishTool({
        id: input.id,
        toolName: input.toolName,
        toolArgs: input.toolArgs,
        status: input.isError ? "error" : "completed",
        result: input.result,
        timestamp: input.timestamp,
        startTimestamp: input.timestamp,
        endTimestamp: input.timestamp,
      });
    },
  };

  public readonly reasoning = {
    finish: (input: { id: string; content: string; turnId?: string; timestamp: string }) => {
      this.drafts.finishReasoning({
        id: input.id,
        content: input.content,
        timestamp: input.timestamp,
        frozen: true,
      }, input.turnId);
    },
  };

  public readonly lifecycle = {
    startTurn: (input: { turnId: string; timestamp: string }) => {
      this.drafts.flushAll(true, this.turns.currentId || undefined);
      this.turns.currentId = input.turnId;
      const turn = this.turns.ensure(input.turnId, input.timestamp);
      turn.status = "in-progress";
      turn.startTime = input.timestamp;
    },
    endTurn: (input: { turnId?: string; cancelled: boolean; timestamp: string }) => {
      this.drafts.flushAll(true, input.turnId);
      const turnId = input.turnId || this.turns.currentId;
      const turn = this.turns.list().find((candidate) => candidate.id === turnId);
      if (turn) {
        turn.status = input.cancelled ? "interrupted" : "completed";
        turn.endTime = input.timestamp;
      }
      if (this.turns.currentId === turnId) {
        this.turns.currentId = null;
      }
    },
    compactHistory: (input: { id: string; summary: string; turnId?: string; timestamp: string }) => {
      this.drafts.flushAll(true, input.turnId);
      this.turns.reset();
      const turn = this.turns.ensure(input.turnId, input.timestamp);
      turn.sawCompaction = true;
      turn.blocks.push({
        type: "compaction-boundary",
        id: input.id,
        summary: input.summary,
        timestamp: input.timestamp,
      });
      turn.status = "completed";
    },
    fail: (input: { id: string; message: string; turnId?: string; timestamp: string }) => {
      this.drafts.flushAll(true, input.turnId);
      this.turns.upsertBlock(input.turnId, {
        type: "assistant",
        id: input.id,
        content: `Error: ${input.message}`,
        timestamp: input.timestamp,
        isFrozen: true,
      });
      this.history.appendAssistant(`Error: ${input.message}`);
      const turnId = input.turnId || this.turns.currentId;
      const turn = this.turns.list().find((candidate) => candidate.id === turnId);
      if (turn) {
        turn.status = "failed";
        turn.error = { message: input.message };
      }
    },
  };

  public readonly subAgents = {
    apply: (input: {
      id: string;
      event: Extract<AnyHarnessEvent, { type: "sub_agent_event" }>["data"]["event"];
      turnId?: string;
      timestamp: string;
    }) => {
      const nextState = updateSubAgentState(
        this.subAgentStates.get(input.id),
        input.event,
        input.timestamp,
      );
      this.subAgentStates.set(input.id, nextState);

      if (this.drafts.activeTool?.id === input.id) {
        this.drafts.upsertTool(this.drafts.activeTool, false);
        return;
      }

      const updated = this.turns.updateBlock(input.id, (block): ProjectedBlock | null => {
        if (block.type !== "sub-agent") return null;
        return {
          ...block,
          state: nextState,
          ...(nextState.status !== "running" ? { isFrozen: true as const } : {}),
        };
      });
      if (updated) return;

      this.turns.upsertBlock(input.turnId, toolBlockFromDraft({
        id: input.id,
        toolName: "spawnSubAgent",
        toolArgs: JSON.stringify({ role: readRoleFromToolArgs("") }),
        status: "pending",
        result: "",
        timestamp: input.timestamp,
        startTimestamp: input.timestamp,
      }, false, nextState));
    },
  };

  private displayIdCounts = new Map<string, number>();

  apply(event: AnyHarnessEvent, handlers: Map<string, ProjectionHandler>): void {
    handlers.get(event.type)?.apply(event, this);
  }

  reset(): void {
    this.turns.reset();
    this.history.reset();
    this.subAgentStates.clear();
    this.drafts.reset();
    this.displayIdCounts.clear();
  }

  snapshot(): ProjectionSnapshot {
    return {
      turns: this.drafts.materialize(),
      aiHistory: this.history.snapshot(),
    };
  }

  private nextDisplayBlockId(id: string): string {
    const count = this.displayIdCounts.get(id) ?? 0;
    this.displayIdCounts.set(id, count + 1);
    return count === 0 ? id : `${id}:${count + 1}`;
  }
}
