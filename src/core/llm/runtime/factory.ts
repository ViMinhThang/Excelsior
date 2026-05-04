import { loadConfig, type Config } from "../../../infra/config.js";
import { loadConfigJson } from "../registry/custom-provider.js";
import { getProvider } from "../registry/registry.js";
import { parseVariantModel } from "../metadata/variants.js";
import type { AgentProvider } from "./types.js";
import { resolveOptions } from "./options.js";
import { runTurn } from "./runner.js";
import { determineToolSupport, applyModelVariants } from "../metadata/capabilities.js";

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

  const rawModelName = config[entry.modelField] ?? entry.modelDefault;
  const { baseModelId, effort } = parseVariantModel(rawModelName);
  const model = entry.createModel(config, baseModelId);

  return {
    provider: providerId,
    label: entry.label,
    model: rawModelName,
    async runTurn({ systemPrompt, prompt, cwd, maxSteps = 5, tools, signal }) {
      const configJson = loadConfigJson();
      const options = resolveOptions(config, configJson, entry.defaultOptions, entry.id);

      options.providerOptions = applyModelVariants(entry.id, effort, options.providerOptions);

      const supportsTools = determineToolSupport(entry, baseModelId, effort);

      return runTurn({
        model,
        systemPrompt,
        prompt,
        cwd,
        options,
        maxSteps,
        tools: tools ?? [],
        ...(signal ? { signal } : {}),
        supportsTools,
      });
    },
  };
}
