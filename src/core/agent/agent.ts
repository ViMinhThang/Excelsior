import { ProviderError, normalizeProviderError } from "../llm/errors.js";
import type { z } from "zod";
import { 
  AgentDefinition, 
  AgentRunInput, 
  AgentRunResult, 
  AgentTextResult, 
  SubagentOutcome, 
  SubagentSlot 
} from "./types.js";
import { extractJsonObject, serializeOutcomes } from "./utils.js";
import { buildAgentPrompt, buildSystemPrompt, buildTextPrompt } from "./prompts.js";

export class Agent<TOutput = unknown> {
  readonly name: string;
  readonly role: string;
  readonly instructions: string;
  readonly tools: string[];
  readonly maxSteps: number;
  readonly requiredProvider: boolean;
  readonly subagents?: SubagentSlot[] | undefined;
  readonly synthesizer?: Agent<TOutput> | undefined;
  private readonly outputSchema: z.ZodTypeAny;

  constructor(definition: AgentDefinition<TOutput>) {
    this.name = definition.name;
    this.role = definition.role;
    this.instructions = definition.instructions;
    this.tools = definition.tools;
    this.outputSchema = definition.outputSchema;
    this.maxSteps = definition.maxSteps ?? 6;
    this.requiredProvider = definition.requiredProvider ?? true;
    this.subagents = definition.subagents;
    this.synthesizer = definition.synthesizer;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult<TOutput>> {
    if (this.subagents && this.subagents.length > 0) {
      return this.runWithSubagents(input);
    }

    if (!input.runtime.provider) {
      return {
        ok: false,
        reason: "missing-provider",
        message: `${this.name} skipped because no LLM provider is configured.`,
      };
    }

    const prompt = buildAgentPrompt({
      taskPrompt: input.prompt,
      tools: this.tools,
    });

    try {
      const raw = await this.callProvider(input, prompt);

      const parsedJson = extractJsonObject(raw);
      if (!parsedJson) {
        return {
          ok: false,
          reason: "invalid-output",
          message: "Agent did not return a JSON object.",
          raw,
        };
      }

      return {
        ok: true,
        value: this.outputSchema.parse(JSON.parse(parsedJson)) as TOutput,
        raw,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: "invalid-output",
        message: `Agent returned invalid output: ${message}`,
      };
    }
  }

  private async runWithSubagents(input: AgentRunInput): Promise<AgentRunResult<TOutput>> {
    this.validateProvider(input);

    const abortController = new AbortController();
    const signal = this.createCombinedSignal(input.signal, abortController.signal);

    try {
      const outcomes = await this.executeSubagents(input, signal, abortController);

      if (!this.synthesizer) {
        return this.createDirectResult(outcomes);
      }

      return await this.synthesizeSubagentOutcomes(input, outcomes);
    } catch (error) {
      abortController.abort();
      return this.handleSubagentError(error);
    }
  }

  private validateProvider(input: AgentRunInput): void {
    if (!input.runtime.provider) {
      throw new Error(`${this.name} skipped because no LLM provider is configured.`);
    }
  }

  private createCombinedSignal(inputSignal?: AbortSignal, controllerSignal?: AbortSignal): AbortSignal {
    return inputSignal ? AbortSignal.any([inputSignal, controllerSignal!]) : controllerSignal!;
  }

  private async executeSubagents(
    input: AgentRunInput,
    signal: AbortSignal,
    abortController: AbortController,
  ): Promise<SubagentOutcome[]> {
    return Promise.all(
      (this.subagents || []).map((slot) => this.runSingleSubagent(slot, input, signal, abortController)),
    );
  }

  private async runSingleSubagent(
    slot: SubagentSlot,
    input: AgentRunInput,
    signal: AbortSignal,
    abortController: AbortController,
  ): Promise<SubagentOutcome> {
    const startedAt = Date.now();
    try {
      const result = await slot.agent.run({ ...input, signal });
      if (!result.ok) throw new Error(result.message);

      return {
        ok: true,
        agentName: slot.agent.name,
        durationMs: Date.now() - startedAt,
        value: result.value,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (slot.required) {
        abortController.abort();
        throw new Error(`Subagent '${slot.agent.name}' failed: ${message}`);
      }
      return {
        ok: false,
        agentName: slot.agent.name,
        durationMs: Date.now() - startedAt,
        error: message,
      };
    }
  }

  private createDirectResult(outcomes: SubagentOutcome[]): AgentRunResult<TOutput> {
    return {
      ok: true,
      value: outcomes as unknown as TOutput,
      raw: JSON.stringify(outcomes),
    };
  }

  private async synthesizeSubagentOutcomes(
    input: AgentRunInput,
    outcomes: SubagentOutcome[],
  ): Promise<AgentRunResult<TOutput>> {
    const synthPrompt = [input.prompt, "Subagent results:", serializeOutcomes(outcomes)].join("\n\n");
    const result = await this.synthesizer!.run({ ...input, prompt: synthPrompt });

    if (!result.ok) return result as AgentRunResult<TOutput>;
    return { ok: true, value: result.value as TOutput, raw: result.raw };
  }

  private handleSubagentError(error: unknown): AgentRunResult<TOutput> {
    return {
      ok: false,
      reason: "invalid-output",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  async runText(input: AgentRunInput): Promise<AgentTextResult> {
    if (!input.runtime.provider) {
      return {
        ok: false,
        reason: "missing-provider",
        message: `${this.name} skipped because no LLM provider is configured.`,
      };
    }

    try {
      const text = await this.callProvider(input, buildTextPrompt({
        taskPrompt: input.prompt,
        tools: this.tools,
      }));
      return { ok: true, text };
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : normalizeProviderError(error);
      return {
        ok: false,
        reason: "provider-error",
        message: providerError.message,
      };
    }
  }

  private async callProvider(input: AgentRunInput, prompt: string): Promise<string> {
    if (!input.runtime.provider) {
      throw new ProviderError("MissingProvider", `${this.name} skipped because no LLM provider is configured.`);
    }

    return input.runtime.provider.runTurn({
      systemPrompt: buildSystemPrompt(this.buildRolePrompt(), input.runtime.memory, input.mode),
      prompt,
      cwd: input.cwd ?? input.runtime.workspaceRoot,
      maxSteps: input.maxSteps ?? this.maxSteps,
      tools: this.tools,
      signal: input.signal,
    });
  }

  private buildRolePrompt(): string {
    return [
      `Agent: ${this.name}`,
      `Role: ${this.role}`,
      this.instructions,
    ].join("\n\n");
  }
}
