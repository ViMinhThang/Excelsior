import { createChannelBus } from "../../lib/runtime/bus.js";
import { ToolCallInfo } from "../../types.js";
import { SubAgentOutputPart } from "../../lib/eventTypes.js";

export type SubAgentEvents = {
  "spawned": { toolCallId: string; role: string };
  "output": { 
    toolCallId: string; 
    latestLine: string; 
    fullOutput: string; 
    outputParts: SubAgentOutputPart[]; 
    toolCalls: ToolCallInfo[] 
  };
  "done": { toolCallId: string; fullOutput: string };
};

export const subAgentBus = createChannelBus<SubAgentEvents>("sub-agent");
