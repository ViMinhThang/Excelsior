import { TURN_END, type AnyHarnessEvent } from "../events.js";

export interface RevertLastTurnResult {
  events: AnyHarnessEvent[];
  revertedTurnId?: string;
}

export function revertLastCompletedTurn(events: readonly AnyHarnessEvent[]): RevertLastTurnResult | null {
  const lastTurnEnd = findLastCompletedTurnEnd(events);
  if (!lastTurnEnd?.turnId) return null;

  const turnStartIndex = events.findIndex((event) => event.turnId === lastTurnEnd.turnId);
  if (turnStartIndex === -1) return null;

  return {
    events: events.slice(0, turnStartIndex),
    revertedTurnId: lastTurnEnd.turnId,
  };
}

function findLastCompletedTurnEnd(events: readonly AnyHarnessEvent[]): AnyHarnessEvent | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type === TURN_END && !event.data.cancelled) return event;
  }
  return null;
}
