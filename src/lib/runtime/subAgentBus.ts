import { createChannelBus } from "./bus.js";
import { ToolCallInfo } from "../../types.js";
import { SubAgentProjectionPart } from "../projection/display.js";

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

export const subAgentBus = createChannelBus<SubAgentEvents>();
