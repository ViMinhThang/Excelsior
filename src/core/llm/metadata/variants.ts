export interface ModelVariant {
  id: string;
  label: string;
  modelId: string;
  effort: string;
  providerOptions: Record<string, Record<string, unknown>>;
}

const VARIANT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

type VariantMapper = (
  effort: string,
) => Record<string, Record<string, unknown>>;

const PROVIDER_VARIANT_MAP: Record<string, VariantMapper> = {
  anthropic: (effort) => {
    const budgetTokens: Record<string, number> = {
      low: 2048,
      medium: 8192,
      high: 16384,
      xhigh: 32768,
      max: 65536,
    };
    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: budgetTokens[effort] ?? 8192,
        },
      },
    };
  },
  openai: (effort) => ({
    openai: {
      reasoningEffort: effort === "xhigh" || effort === "max" ? "high" : effort,
    },
  }),
  google: (effort) => {
    const levels: Record<string, string> = {
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
      max: "high",
    };
    return {
      google: {
        thinkingConfig: { thinkingLevel: levels[effort] ?? "medium" },
      },
    };
  },
  "github-copilot": (effort) => ({
    copilot: {
      reasoningEffort: effort === "xhigh" || effort === "max" ? "high" : effort,
    },
  }),
};

export function getVariantOptions(
  providerId: string,
  effort: string,
): Record<string, Record<string, unknown>> {
  const mapper = PROVIDER_VARIANT_MAP[providerId];
  if (!mapper) return {};
  return mapper(effort);
}

export function getModelVariants(
  providerId: string,
  modelId: string,
  modelName: string,
): ModelVariant[] {
  const mapper = PROVIDER_VARIANT_MAP[providerId];
  if (!mapper) return [];

  return VARIANT_EFFORTS.map((effort) => ({
    id: `${modelId}:${effort}`,
    label: `${modelName} (${effort.charAt(0).toUpperCase() + effort.slice(1)})`,
    modelId,
    effort,
    providerOptions: mapper(effort),
  }));
}

export function isVariantModel(modelId: string): boolean {
  return VARIANT_EFFORTS.some((e) => modelId.endsWith(`:${e}`));
}

export function parseVariantModel(modelId: string): {
  baseModelId: string;
  effort?: string;
} {
  for (const e of VARIANT_EFFORTS) {
    if (modelId.endsWith(`:${e}`)) {
      return { baseModelId: modelId.slice(0, -e.length - 1), effort: e };
    }
  }
  return { baseModelId: modelId };
}
