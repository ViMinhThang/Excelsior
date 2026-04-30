import { generateText } from "ai";

import { loadConfig, type Config, type ProviderName } from "../config.js";
import { getTools } from "../tools/index.js";
import { normalizeProviderError } from "./provider-errors.js";
import { getProvider, PROVIDER_REGISTRY } from "./providers/registry.js";

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

export function getProviderLabel(provider: ProviderName): string {
  return getProvider(provider)?.label ?? provider;
}

export function listProviderOptions(config: Config = loadConfig()): Array<{
  label: string;
  value: ProviderName;
  description: string;
}> {
  return PROVIDER_REGISTRY.map((entry) => {
    const configured = Boolean(config[entry.apiKeyField as keyof Config]);
    return {
      label: entry.label,
      value: entry.id as ProviderName,
      description: configured ? "configured" : "missing API key",
    };
  });
}

export function createAgentProvider(
  config: Config = loadConfig(),
): AgentProvider | null {
  const providerId = config.LLM_PROVIDER;
  const entry = getProvider(providerId);

  if (!entry) {
    return null;
  }

  const apiKey = config[entry.apiKeyField as keyof Config];

  if (!apiKey) {
    return null;
  }

  const modelName = config[entry.modelField as keyof Config] as string;
  const model = entry.createModel(config, modelName);

  return {
    provider: providerId,
    label: entry.label,
    model: modelName,
    async runTurn({ systemPrompt, prompt, cwd, maxSteps = 5, tools, signal }) {
      try {
        const supportsTools = !modelName.toLowerCase().includes("reasoning");

        const { text } = await generateText({
          model,
          system: systemPrompt,
          prompt,
          tools: supportsTools ? getTools(cwd, tools) : undefined,
          maxSteps: supportsTools ? maxSteps : 1,
          abortSignal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
            : AbortSignal.timeout(60_000),
        } as any);

        return text.trim();
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },
  };
}
