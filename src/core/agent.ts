import type { ProviderName } from "../config.js";
import { globalMemory } from "../mem/memory-manager.js";
import type { ReviewMode } from "../review/types.js";
import { ACT_MODE_INSTRUCTIONS, BASE_SYSTEM_PROMPT, PLAN_MODE_INSTRUCTIONS } from "./prompts.js";
import type { AgentProvider } from "./provider.js";

export interface AgentTurnInput {
  rolePrompt: string;
  prompt: string;
  cwd: string;
  maxSteps?: number;
  mode?: ReviewMode;
}

export class ExcelsiorAgent {
  constructor(private readonly provider: AgentProvider | null) {}

  get providerName(): ProviderName | "heuristic" {
    return this.provider?.provider ?? "heuristic";
  }

  get model(): string | null {
    return this.provider?.model ?? null;
  }

  clear(): void {}

  async runTurn(input: AgentTurnInput): Promise<string | null> {
    if (!this.provider) {
      return null;
    }

    const turn = {
      systemPrompt: buildSystemPrompt(input.rolePrompt, input.mode),
      prompt: input.prompt,
      cwd: input.cwd,
      ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
    };

    return this.provider.runTurn(turn);
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
