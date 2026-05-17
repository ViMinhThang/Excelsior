import type { AnyAgentEvent } from "@excelsior/agent-host/testing/runtime";

export function makeEvent(
  overrides: Partial<AnyAgentEvent> & { type: AnyAgentEvent["type"] },
): AnyAgentEvent {
  return {
    id: `evt_${Math.random()}`,
    runId: "run_test",
    sequence: 0,
    version: 1,
    causationId: "",
    correlationId: "run_test",
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  } as unknown as AnyAgentEvent;
}

export function makeChildRun(events: readonly AnyAgentEvent[]) {
  return {
    getSnapshot: () => events,
  };
}
