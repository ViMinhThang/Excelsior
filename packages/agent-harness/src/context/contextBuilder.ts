import type { AgentMessage, AgentMode } from "@excelsior/core";
import type { AnyHarnessEvent } from "../events.js";
import { projectEventsToMessages } from "../projection.js";
import { buildSystemPrompt } from "./systemPrompt.js";

export interface RunContextInput {
  events: readonly AnyHarnessEvent[];
  userContent: string;
  mode: AgentMode;
  skillsList?: string;
  projectInstructions?: string;
}

export interface RunContext {
  messages: AgentMessage[];
  systemPrompt: string;
}

export function buildRunContext(input: RunContextInput): RunContext {
  const priorMessages = projectEventsToMessages(input.events);
  const modeMessage: AgentMessage = {
    role: "system",
    content: `current mode: ${input.mode} timestamp: ${new Date().toISOString()}`,
  };
  return {
    messages: [
      ...priorMessages,
      modeMessage,
      { role: "user", content: input.userContent },
    ],
    systemPrompt: buildSystemPrompt({
      mode: input.mode,
      skillsList: input.skillsList,
      projectInstructions: input.projectInstructions,
    }),
  };
}
