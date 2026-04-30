import { globalMemory } from "../mem/memory-manager.js";
import type { ReviewMode } from "../review/types.js";
import { ACT_MODE_INSTRUCTIONS, BASE_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "./prompts.js";
import { ProviderError, normalizeProviderError } from "./provider-errors.js";
import type { RuntimeContext } from "./runtime.js";
import type { z } from "zod";

export interface AgentDefinition {
  name: string;
  role: string;
  instructions: string;
  tools: string[];
  outputSchema: z.ZodTypeAny;
  maxSteps?: number;
  requiredProvider?: boolean;
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
}

export class Agent<TOutput> {
  readonly name: string;
  readonly role: string;
  readonly instructions: string;
  readonly tools: string[];
  readonly maxSteps: number;
  readonly requiredProvider: boolean;
  private readonly outputSchema: z.ZodTypeAny;

  constructor(definition: AgentDefinition) {
    this.name = definition.name;
    this.role = definition.role;
    this.instructions = definition.instructions;
    this.tools = definition.tools;
    this.outputSchema = definition.outputSchema;
    this.maxSteps = definition.maxSteps ?? 6;
    this.requiredProvider = definition.requiredProvider ?? true;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult<TOutput>> {
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
      systemPrompt: buildSystemPrompt(this.buildRolePrompt(), input.mode),
      prompt,
      cwd: input.cwd ?? input.runtime.workspaceRoot,
      maxSteps: input.maxSteps ?? this.maxSteps,
      tools: this.tools,
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

export function buildSystemPrompt(rolePrompt: string, mode = globalMemory.getMode()): string {
  const memories = globalMemory.getRecentObservations();
  const modeInstructions = mode === "PLAN" ? PLAN_MODE_INSTRUCTIONS : ACT_MODE_INSTRUCTIONS;

  return [
    BASE_SYSTEM_PROMPT,
    rolePrompt,
    `Current mode: ${mode}`,
    modeInstructions,
    "Recent observations:",
    memories.length > 0 ? memories.join("\n") : "(none)",
  ].join("\n\n");
}

function buildAgentPrompt(args: { taskPrompt: string; tools: string[] }): string {
  return [
    args.taskPrompt,
    "Use the available tools before making findings when file inspection is needed.",
    `Available tools: ${args.tools.join(", ") || "(none)"}.`,
    "Return only strict JSON that matches your configured output schema. Do not wrap JSON in Markdown.",
  ].join("\n\n");
}

function buildTextPrompt(args: { taskPrompt: string; tools: string[] }): string {
  return [
    args.taskPrompt,
    "Use the available tools when file inspection is useful.",
    `Available tools: ${args.tools.join(", ") || "(none)"}.`,
    "Return a concise plain-text response.",
  ].join("\n\n");
}

function extractJsonObject(response: string): string | null {
  const trimmed = response.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}
