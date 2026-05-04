import { ProviderError, normalizeProviderError } from "../../infra/errors.js";
import { DEFAULT_MAX_STEPS } from "../../infra/constants.js";
import type { z } from "zod";
import {
  AgentDefinition,
  AgentRunInput,
  AgentRunResult,
  AgentTextResult,
} from "./types.js";
import { extractJsonObject } from "./utils.js";
import {
  buildAgentPrompt,
  buildTextPrompt,
} from "./prompts.js";
import { AgentRegistry } from "./registry.js";
import { type PlannerOutput } from "./dynamic.js";
import { executeAgentTurn } from "./runner.js";
import { synthesizeOutcomes } from "./synthesize.js";
import { executePlannedSubagents } from "./dynamic.js";

export class Agent<TOutput = unknown> {
  readonly name: string;
  readonly role: string;
  readonly instructions: string;
  readonly tools: string[];
  readonly maxSteps: number;
  readonly requiredProvider: boolean;
  readonly planner: Agent<PlannerOutput> | undefined;
  readonly synthesizer: Agent<TOutput> | undefined;
  private readonly outputSchema: z.ZodTypeAny;

  constructor(definition: AgentDefinition<TOutput>) {
    this.name = definition.name;
    this.role = definition.role;
    this.instructions = definition.instructions;
    this.tools = definition.tools;
    this.outputSchema = definition.outputSchema;
    this.maxSteps = definition.maxSteps ?? DEFAULT_MAX_STEPS;
    this.requiredProvider = definition.requiredProvider ?? true;
    this.planner = definition.planner;
    this.synthesizer = definition.synthesizer;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult<TOutput>> {
    if (this.planner) {
      return this.runWithPlanner(input);
    }
    return this.runDirect(input);
  }

  async runText(input: AgentRunInput): Promise<AgentTextResult> {
    const prompt = buildTextPrompt({ taskPrompt: input.prompt, tools: this.tools });
    const result = await this.execute(input, prompt);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason === "missing-provider" ? "missing-provider" : "provider-error",
        message: result.message,
      };
    }
    return { ok: true, text: result.raw };
  }

  // ── Direct: single LLM call, parse JSON output ──

  private async runDirect(input: AgentRunInput): Promise<AgentRunResult<TOutput>> {
    const prompt = buildAgentPrompt({ taskPrompt: input.prompt, tools: this.tools });
    const result = await this.execute(input, prompt);

    if (!result.ok) return result as AgentRunResult<TOutput>;

    const parsedJson = extractJsonObject(result.raw);
    if (!parsedJson) {
      return {
        ok: false,
        reason: "invalid-output",
        message: "Agent did not return a JSON object.",
        raw: result.raw,
      };
    }

    try {
      return {
        ok: true,
        value: this.outputSchema.parse(JSON.parse(parsedJson)) as TOutput,
        raw: result.raw,
      };
    } catch (error) {
      return {
        ok: false,
        reason: "invalid-output",
        message: `Agent returned invalid output: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async execute(
    input: AgentRunInput,
    prompt: string,
  ): Promise<{ ok: true; raw: string } | { ok: false; reason: string; message: string }> {
    if (!input.runtime.provider) {
      return {
        ok: false,
        reason: "missing-provider",
        message: `${this.name} skipped because no LLM provider is configured.`,
      };
    }

    try {
      const raw = await executeAgentTurn(this, input, prompt);
      return { ok: true, raw };
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : normalizeProviderError(error);
      return {
        ok: false,
        reason: "provider-error",
        message: providerError.message,
      };
    }
  }

  private async runWithPlanner(
    input: AgentRunInput,
  ): Promise<AgentRunResult<TOutput>> {
    if (!input.runtime.provider || !this.planner) {
      return {
        ok: false,
        reason: "missing-provider",
        message: `${this.name} skipped because no LLM provider is configured.`,
      };
    }

    const abortController = new AbortController();
    const signal = input.signal
      ? AbortSignal.any([input.signal, abortController.signal])
      : abortController.signal;

    try {
      const plan = await this.runPlanner(input, signal);

      if (plan.subagents.length === 0) {
        return this.runDirect(input);
      }

      const outcomes = await executePlannedSubagents(
        input,
        plan.subagents,
        signal,
      );
      return synthesizeOutcomes(this.synthesizer, input, outcomes);
    } catch (error) {
      return {
        ok: false,
        reason: "invalid-output",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      abortController.abort();
    }
  }

  private async runPlanner(
    input: AgentRunInput,
    signal: AbortSignal,
  ): Promise<PlannerOutput> {
    const plannerInput: AgentRunInput = {
      ...input,
      prompt: [
        input.prompt,
        `Available agents: ${AgentRegistry.list().join(", ") || "(none)"}`,
      ].join("\n\n"),
      signal,
    };

    const result = await this.planner!.run(plannerInput);
    if (!result.ok) {
      throw new Error(`Planner failed: ${result.message}`);
    }
    return result.value;
  }
}
