import { isLoopFinished, stepCountIs } from "ai";
import {
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
} from "@excelsior/core";

export type AgentToolLoopBudget = {
  stopWhen: ReturnType<typeof isLoopFinished>;
  stepLimit?: number;
};

export function resolveAgentToolLoopBudget(
  value: string | null | undefined,
): AgentToolLoopBudget {
  const normalized = normalizeAgentToolLoopSteps(value);

  if (normalized === DEFAULT_AGENT_TOOL_LOOP_STEPS) {
    return { stopWhen: isLoopFinished() };
  }

  const stepLimit = Number(normalized);
  return { stopWhen: stepCountIs(stepLimit), stepLimit };
}
