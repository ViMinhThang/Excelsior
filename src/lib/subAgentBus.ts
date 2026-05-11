import { createBus } from "./bus.js";
import { SubAgentOutputPart, ToolCallInfo } from "../types.js";

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

export const subAgentBus = createBus<SubAgentEvents>();
