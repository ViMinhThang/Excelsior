import { loadConfig, type Config } from "../../../config.js";
import { loadConfigJson } from "../custom-provider.js";
import { getProvider } from "../registry.js";
import type { AgentProvider } from "./types.js";
import { resolveOptions } from "./options.js";
import { runTurn } from "./runner.js";

export function createAgentProvider(config: Config = loadConfig()): AgentProvider | null {
  const providerId = config.LLM_PROVIDER;
  const entry = getProvider(providerId);

  if (!entry) {
    return null;
  }

  const apiKey = config[entry.apiKeyField];

  if (!apiKey) {
    return null;
  }

  const modelName = config[entry.modelField] ?? entry.modelDefault;
  const model = entry.createModel(config, modelName);

  return {
    provider: providerId,
    label: entry.label,
    model: modelName,
    async runTurn({ systemPrompt, prompt, cwd, maxSteps = 5, tools, signal }) {
      const configJson = loadConfigJson();
      const options = resolveOptions(config, configJson, entry.defaultOptions, entry.id);
      const supportsTools = !modelName.toLowerCase().includes("reasoning");

      return runTurn({
        model,
        systemPrompt,
        prompt,
        cwd,
        options,
        maxSteps,
        tools,
        signal,
        supportsTools,
      });
    },
  };
}

