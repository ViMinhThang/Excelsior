import type { ProviderName } from "../../../config.js";

export interface AgentProvider {
  provider: ProviderName;
  label: string;
  model: string;
  runTurn(args: {
    systemPrompt: string;
    prompt: string;
    cwd: string;
    maxSteps?: number | undefined;
    tools?: string[] | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<string>;
}
