import type { AgentMessage, AgentMode } from "@excelsior/core";
import { buildSystemPrompt } from "./systemPrompt.js";

export interface RunContextInput {
  priorMessages: readonly AgentMessage[];
  userContent: string;
  mode: AgentMode;
  skillsList?: string;
  projectInstructions?: string;
  reflectionMemoryContext?: string;
}

export interface RunContext {
  messages: AgentMessage[];
  systemPrompt: string;
}

export function buildRunContext(input: RunContextInput): RunContext {
  const priorMessages = input.priorMessages;
  const modeMessage: AgentMessage = {
    role: "system",
    content: `current mode: ${input.mode} timestamp: ${new Date().toISOString()}`,
  };
  return {
    messages: [
      ...priorMessages,
      modeMessage,
      ...(input.reflectionMemoryContext
        ? [{ role: "system" as const, content: input.reflectionMemoryContext }]
        : []),
      { role: "user", content: input.userContent },
    ],
    systemPrompt: buildSystemPrompt({
      mode: input.mode,
      skillsList: input.skillsList,
      projectInstructions: input.projectInstructions,
    }),
  };
}
