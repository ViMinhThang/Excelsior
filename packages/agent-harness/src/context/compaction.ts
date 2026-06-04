import { projectEventsToMessages } from "../projection.js";
import type { AnyHarnessEvent } from "../events.js";

export interface CompactionSummaryOptions {
  maxChars?: number;
}

export function buildCompactionSummary(
  events: readonly AnyHarnessEvent[],
  options: CompactionSummaryOptions = {},
): string {
  const maxChars = options.maxChars ?? 4000;
  return projectEventsToMessages(events)
    .map((message) => `${message.role.toUpperCase()}: ${typeof message.content === "string" ? message.content : ""}`)
    .join("\n")
    .slice(-maxChars);
}

export function buildCompactionNotice(summary: string): string {
  return `Previous conversation compacted:\n${summary}`;
}
