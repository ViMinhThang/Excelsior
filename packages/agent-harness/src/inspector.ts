import type { ProjectedTurn } from "@excelsior/core";
import {
  ERROR,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TURN_END,
  TURN_START,
  type AnyHarnessEvent,
} from "./events.js";
import { projectEvents } from "./projection.js";
import type { HarnessInspectionSnapshot, HarnessReplayReport } from "./types.js";

const DEFAULT_TRACE_MAX_CHARS = 12_000;

export interface HarnessTraceOptions {
  mode?: "latest" | "all" | "turn";
  turnIdPrefix?: string;
  maxChars?: number;
}

interface TurnGroup {
  turnId: string;
  runId: string;
  events: AnyHarnessEvent[];
}

interface ReplayValidation {
  errors: string[];
  partialIssues: string[];
}

export function copyHarnessEvents(events: readonly AnyHarnessEvent[]): AnyHarnessEvent[] {
  return events.map((event) => JSON.parse(JSON.stringify(event)) as AnyHarnessEvent);
}

export function formatHarnessTrace(
  input: HarnessInspectionSnapshot,
  options: HarnessTraceOptions = {},
): string {
  if (!input.session) return "No active session.";
  if (input.events.length === 0) {
    return `No events in current session: ${input.session.title ?? input.session.id}`;
  }

  const mode = options.mode ?? "latest";
  const turnGroups = groupTurns(input.events);
  const maxChars = options.maxChars ?? DEFAULT_TRACE_MAX_CHARS;
  const header = [
    `Trace: ${input.session.title ?? input.session.id}`,
    `session=${input.session.id}`,
    `events=${input.events.length}`,
    `turns=${turnGroups.length}`,
  ].join(" | ");

  if (mode === "all") {
    return capText([header, "", ...formatAllTurns(turnGroups, input.events)].join("\n"), maxChars);
  }

  const group = mode === "turn"
    ? findTurnByPrefix(turnGroups, options.turnIdPrefix ?? "")
    : latestTurn(turnGroups);

  if (typeof group === "string") {
    return capText([header, "", group].join("\n"), maxChars);
  }

  if (!group) {
    return capText([header, "", ...formatSessionEvents(input.events)].join("\n"), maxChars);
  }

  return capText([header, "", ...formatDetailedTurn(group)].join("\n"), maxChars);
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

export function formatHarnessReplayReport(
  report: HarnessReplayReport,
  input: HarnessInspectionSnapshot,
): string {
  if (!input.session) return "No active session.";
  if (report.eventCount === 0) {
    return `Replay: no events in current session: ${input.session.title ?? input.session.id}`;
  }

  const status = report.ok
    ? report.partial ? "OK (partial active run)" : "OK"
    : report.partial ? "FAILED (partial active run)" : "FAILED";
  const lines = [
    `Replay: ${status}`,
    `session=${input.session.id}`,
    `events=${report.eventCount}`,
    `turns=${report.turnCount}`,
    `blocks=${report.blockCount}`,
    `history=${report.historyCount}`,
  ];

  if (report.issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of report.issues) lines.push(`- ${issue}`);
  }

  return lines.join("\n");
}

function groupTurns(events: readonly AnyHarnessEvent[]): TurnGroup[] {
  const groups = new Map<string, TurnGroup>();
  for (const event of events) {
    if (!event.turnId) continue;
    const existing = groups.get(event.turnId);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(event.turnId, {
        turnId: event.turnId,
        runId: event.runId,
        events: [event],
      });
    }
  }
  return [...groups.values()].sort((left, right) =>
    (left.events.at(-1)?.sequence ?? 0) - (right.events.at(-1)?.sequence ?? 0),
  );
}

function latestTurn(groups: readonly TurnGroup[]): TurnGroup | null {
  return groups.at(-1) ?? null;
}

function findTurnByPrefix(groups: readonly TurnGroup[], prefix: string): TurnGroup | string | null {
  if (!prefix.trim()) return "Usage: /trace <turnIdPrefix>";
  const matches = groups.filter((group) => group.turnId.startsWith(prefix));
  if (matches.length === 0) return `No turn matching prefix: ${prefix}`;
  if (matches.length > 1) {
    return [
      `Multiple turns match prefix: ${prefix}`,
      ...matches.slice(0, 8).map((group) => `- ${shortId(group.turnId)} (${group.events.length} events)`),
    ].join("\n");
  }
  return matches[0] ?? null;
}

function formatAllTurns(groups: readonly TurnGroup[], events: readonly AnyHarnessEvent[]): string[] {
  if (groups.length === 0) return formatSessionEvents(events);
  const lines = groups.map((group) => {
    const user = firstUserMessage(group.events);
    const tools = group.events.filter((event) => event.type === TOOL_EXECUTION_START).length;
    const errors = group.events.filter((event) => event.type === ERROR).length;
    const status = turnStatus(group.events);
    return [
      shortId(group.turnId),
      `run=${shortId(group.runId)}`,
      `events=${group.events.length}`,
      `tools=${tools}`,
      `errors=${errors}`,
      `status=${status}`,
      user ? `user="${preview(user)}"` : "user=-",
    ].join(" | ");
  });
  const sessionEventCount = events.filter((event) => !event.turnId).length;
  if (sessionEventCount > 0) lines.push(`session-events=${sessionEventCount}`);
  return lines;
}

function formatDetailedTurn(group: TurnGroup): string[] {
  const lines = [
    `Turn ${group.turnId}`,
    `run=${group.runId}`,
    `events=${group.events.length}`,
    `status=${turnStatus(group.events)}`,
    "",
  ];
  for (const event of group.events) {
    lines.push(`${String(event.sequence).padStart(4, " ")} ${event.type} ${formatEventDetail(event)}`);
  }
  return lines;
}

function formatSessionEvents(events: readonly AnyHarnessEvent[]): string[] {
  const sessionEvents = events.filter((event) => !event.turnId);
  if (sessionEvents.length === 0) return ["No turn events in current session."];
  return [
    "Session events:",
    ...sessionEvents.map((event) =>
      `${String(event.sequence).padStart(4, " ")} ${event.type} ${formatEventDetail(event)}`,
    ),
  ];
}

function formatEventDetail(event: AnyHarnessEvent): string {
  switch (event.type) {
    case MESSAGE_START:
      return `${event.data.message.role} id=${shortId(event.data.message.id)}`;
    case MESSAGE_UPDATE:
      return `assistant +=${event.data.delta.length} chars`;
    case MESSAGE_END:
      return `${event.data.message.role} id=${shortId(event.data.message.id)} "${preview(event.data.message.content)}"`;
    case TOOL_EXECUTION_START:
      return `${event.data.toolName}(${preview(event.data.toolArgs)}) start`;
    case TOOL_EXECUTION_UPDATE:
      return `${event.data.toolName} +=${event.data.delta.length} chars`;
    case TOOL_EXECUTION_END:
      return `${event.data.toolName} ${event.data.isError ? "error" : "ok"} "${preview(event.data.result)}"`;
    case ERROR:
      return `"${preview(event.data.message)}"`;
    default:
      return "";
  }
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
  if (JSON.stringify(replayedTurns) === JSON.stringify(snapshotTurns)) return [];
  return [
    `Projection mismatch: replayed ${replayedTurns.length} turns, snapshot has ${snapshotTurns.length}`,
  ];
}

function firstUserMessage(events: readonly AnyHarnessEvent[]): string | null {
  const event = events.find((item) => item.type === MESSAGE_END && item.data.message.role === "user");
  return event?.type === MESSAGE_END ? event.data.message.content : null;
}

function turnStatus(events: readonly AnyHarnessEvent[]): string {
  const end = events.findLast((event) => event.type === TURN_END);
  if (!end) return "partial";
  return end.data.cancelled ? "cancelled" : "complete";
}

function preview(value: string, maxLength = 80): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function shortId(value: string): string {
  return value.length <= 12 ? value : value.slice(0, 12);
}

function capText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 48))}\n[trace output truncated to ${maxChars} chars]`;
}
