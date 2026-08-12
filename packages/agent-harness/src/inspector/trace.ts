import {
  ERROR,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TURN_END,
  type AnyHarnessEvent,
} from "../events.js";
import type { HarnessInspectionSnapshot, HarnessReplayReport } from "../types.js";
import { groupTurns, type TurnGroup } from "./shared.js";

const DEFAULT_TRACE_MAX_CHARS = 12_000;

export interface HarnessTraceOptions {
  mode?: "latest" | "all" | "turn";
  turnIdPrefix?: string;
  maxChars?: number;
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
