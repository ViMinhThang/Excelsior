import type { z } from "zod";
import type { ReviewMode } from "../../review/types.js";
import type { RuntimeContext } from "../runtime.js";
import type { Agent } from "./agent.js";
import type { PlannerOutput } from "./dynamic.js";

export type SubagentOutcome =
  | { ok: true; agentName: string; durationMs: number; value: unknown }
  | { ok: false; agentName: string; durationMs: number; error: string };

export interface AgentDefinition<TOutput = unknown> {
  name: string;
  role: string;
  instructions: string;
  tools: string[];
  outputSchema: z.ZodTypeAny;
  maxSteps?: number;
  requiredProvider?: boolean;
  planner?: Agent<PlannerOutput>;
  synthesizer?: Agent<TOutput>;
}

export type AgentRunResult<TOutput> =
  | { ok: true; value: TOutput; raw: string }
  | { ok: false; reason: "missing-provider" | "invalid-output"; message: string; raw?: string };

export type AgentTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "missing-provider" | "provider-error"; message: string };

export interface AgentRunInput {
  prompt: string;
  runtime: RuntimeContext;
  mode?: ReviewMode;
  cwd?: string;
  maxSteps?: number;
  signal?: AbortSignal;
}
