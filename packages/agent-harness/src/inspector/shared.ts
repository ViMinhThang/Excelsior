import type { AnyHarnessEvent } from "../events.js";

export interface TurnGroup {
  turnId: string;
  runId: string;
  events: AnyHarnessEvent[];
}

export function copyHarnessEvents(events: readonly AnyHarnessEvent[]): AnyHarnessEvent[] {
  return events.map((event) => JSON.parse(JSON.stringify(event)) as AnyHarnessEvent);
}

export function groupTurns(events: readonly AnyHarnessEvent[]): TurnGroup[] {
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
