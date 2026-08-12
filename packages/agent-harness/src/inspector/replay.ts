import type { ProjectedTurn } from "@excelsior/core";
import {
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TURN_END,
  TURN_START,
  type AnyHarnessEvent,
} from "../events.js";
import { projectEvents } from "../projection/index.js";
import type { HarnessInspectionSnapshot, HarnessReplayReport } from "../types.js";
import { groupTurns } from "./shared.js";

interface ReplayValidation {
  errors: string[];
  partialIssues: string[];
}

export function replayHarnessEvents(input: HarnessInspectionSnapshot): HarnessReplayReport {
  if (!input.session || input.events.length === 0) {
    return {
      ok: true,
      partial: false,
      eventCount: input.events.length,
      turnCount: 0,
      blockCount: 0,
      historyCount: 0,
      issues: [],
    };
  }

  const validation = validateEvents(input);
  const readModel = projectEvents(input.events);
  const projectionIssues = validateProjection(readModel.turns, input.snapshot.turns);
  const errors = [...validation.errors, ...projectionIssues];
  const partial = validation.partialIssues.length > 0;
  const turnCount = groupTurns(input.events).length;

  return {
    ok: errors.length === 0,
    partial,
    eventCount: input.events.length,
    turnCount,
    blockCount: readModel.turns.reduce((sum, turn) => sum + turn.blocks.length, 0),
    historyCount: readModel.aiHistory.length,
    issues: [...errors, ...validation.partialIssues],
  };
}

function validateEvents(input: HarnessInspectionSnapshot): ReplayValidation {
  const errors: string[] = [];
  const partialIssues: string[] = [];
  const eventIds = new Set<string>();
  const openTurns = new Map<string, AnyHarnessEvent>();
  const openTools = new Map<string, AnyHarnessEvent>();
  const openAssistantMessages = new Map<string, AnyHarnessEvent>();
  let previousSequence: number | null = null;
  const workspaceId = input.snapshot.workspace.id;
  const sessionId = input.snapshot.currentSessionId ?? input.session?.id;

  for (const event of input.events) {
    if (eventIds.has(event.id)) errors.push(`Duplicate event id: ${event.id}`);
    eventIds.add(event.id);

    if (previousSequence !== null && event.sequence !== previousSequence + 1) {
      errors.push(`Sequence gap before ${event.id}: expected ${previousSequence + 1}, got ${event.sequence}`);
    }
    previousSequence = event.sequence;

    if (event.workspaceId !== workspaceId) {
      errors.push(`Wrong workspace on ${event.id}: expected ${workspaceId}, got ${event.workspaceId}`);
    }
    if (sessionId && event.sessionId !== sessionId) {
      errors.push(`Wrong session on ${event.id}: expected ${sessionId}, got ${event.sessionId}`);
    }

    if (event.type === TURN_START) {
      if (!event.turnId) errors.push(`turn_start without turnId: ${event.id}`);
      if (event.turnId) openTurns.set(event.turnId, event);
    } else if (event.type === TURN_END) {
      if (!event.turnId) errors.push(`turn_end without turnId: ${event.id}`);
      if (event.turnId && !openTurns.delete(event.turnId)) {
        errors.push(`turn_end without matching turn_start: ${event.turnId}`);
      }
    } else if (event.type === TOOL_EXECUTION_START) {
      openTools.set(event.data.toolCallId, event);
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      if (!openTools.has(event.data.toolCallId)) {
        errors.push(`tool_execution_update without matching start: ${event.data.toolCallId}`);
      }
    } else if (event.type === TOOL_EXECUTION_END) {
      if (!openTools.delete(event.data.toolCallId)) {
        errors.push(`tool_execution_end without matching start: ${event.data.toolCallId}`);
      }
    } else if (event.type === MESSAGE_START && event.data.message.role === "assistant") {
      openAssistantMessages.set(event.data.message.id, event);
    } else if (event.type === MESSAGE_UPDATE) {
      if (!openAssistantMessages.has(event.data.messageId)) {
        errors.push(`message_update without assistant message_start: ${event.data.messageId}`);
      }
    } else if (event.type === MESSAGE_END && event.data.message.role === "assistant") {
      if (!openAssistantMessages.delete(event.data.message.id)) {
        errors.push(`assistant message_end without matching start: ${event.data.message.id}`);
      }
    }
  }

  moveActiveOpenItemsToPartial({
    input,
    openTurns,
    openTools,
    openAssistantMessages,
    errors,
    partialIssues,
  });

  return { errors, partialIssues };
}

function moveActiveOpenItemsToPartial(input: {
  input: HarnessInspectionSnapshot;
  openTurns: Map<string, AnyHarnessEvent>;
  openTools: Map<string, AnyHarnessEvent>;
  openAssistantMessages: Map<string, AnyHarnessEvent>;
  errors: string[];
  partialIssues: string[];
}): void {
  const active = input.input.snapshot.isLoading;
  for (const [turnId] of input.openTurns) {
    const issue = `Missing turn_end for ${turnId}`;
    if (active) input.partialIssues.push(`Partial: ${issue}`);
    else input.errors.push(issue);
  }
  for (const [toolCallId] of input.openTools) {
    const issue = `Missing tool_execution_end for ${toolCallId}`;
    if (active) input.partialIssues.push(`Partial: ${issue}`);
    else input.errors.push(issue);
  }
  for (const [messageId] of input.openAssistantMessages) {
    const issue = `Missing assistant message_end for ${messageId}`;
    if (active) input.partialIssues.push(`Partial: ${issue}`);
    else input.errors.push(issue);
  }
}

function validateProjection(
  replayedTurns: readonly ProjectedTurn[],
  snapshotTurns: readonly ProjectedTurn[],
): string[] {
  if (replayedTurns.length !== snapshotTurns.length) {
    return [
      `Projection mismatch: replayed ${replayedTurns.length} turns, snapshot has ${snapshotTurns.length}`,
    ];
  }
  if (JSON.stringify(replayedTurns) === JSON.stringify(snapshotTurns)) return [];
  return [
    `Projection mismatch: replayed ${replayedTurns.length} turns, snapshot has ${snapshotTurns.length} (content mismatch)`,
  ];
}
