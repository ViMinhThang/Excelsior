import { EventfulRun } from "@excelsior/run-runtime";
import { AgentEventDataMap, EVENT_SCHEMA_VERSION } from "./events.js";
import { RUN_END } from "./eventNames.js";

export interface AgentRunOptions {
  sessionId?: string;
  parentEventId?: string;
  correlationId?: string;
  parentSignal?: AbortSignal;
}

export class AgentRun extends EventfulRun<AgentEventDataMap> {
  constructor(
    sessionIdOrOptions?: string | AgentRunOptions,
    parentEventId?: string,
    correlationId?: string,
    parentSignal?: AbortSignal,
  ) {
    const options =
      typeof sessionIdOrOptions === "object"
        ? sessionIdOrOptions
        : {
            sessionId: sessionIdOrOptions,
            parentEventId,
            correlationId,
            parentSignal,
          };

    super({
      idPrefix: "run",
      eventVersion: EVENT_SCHEMA_VERSION,
      terminalEventTypes: [RUN_END],
      ...options,
    });
  }
}
