import type { SubAgentEventSink } from "../../lib/runtime/subAgentEventSink.js";

export function subscribeSubAgentNotifications(
  subAgentEvents: SubAgentEventSink,
  scheduleNotify: () => void,
): Array<() => void> {
  return [
    subAgentEvents.on("spawned", scheduleNotify),
    subAgentEvents.on("output", scheduleNotify),
    subAgentEvents.on("done", scheduleNotify),
  ];
}
