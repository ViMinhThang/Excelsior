import type { StreamCapableAgent } from "../../runtime/events.js";
import type { RunContext } from "./runSession.js";
import type { AgentMode } from "@excelsior/core";

export interface AgentFactory {
  create(input: {
    runContext: RunContext;
    instructions?: string;
    mode: AgentMode;
  }): StreamCapableAgent;
}
