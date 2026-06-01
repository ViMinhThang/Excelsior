import { createBus, type Bus } from "@excelsior/run-runtime";
import type { SubAgentProjectionPart, ToolCallInfo } from "@excelsior/core";

export type SubAgentEvents = {
  "spawned": { toolCallId: string; role: string };
  "output": {
    toolCallId: string;
    latestLine: string;
    fullOutput: string;
    outputParts: SubAgentProjectionPart[];
    toolCalls: ToolCallInfo[];
  };
  "done": { toolCallId: string; fullOutput: string };
};

export type SubAgentEventSink = Pick<Bus<SubAgentEvents>, "emit" | "on">;

export function createSubAgentEventSink(): SubAgentEventSink {
  return createBus<SubAgentEvents>();
}
