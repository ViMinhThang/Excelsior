import type { ProviderDefinition } from "./types.js";
import { getVariantOptions } from "./variants.js";

/**
 * Determines if a model supports tool calling based on its registry metadata
 * or a fallback naming heuristic.
 */
export function determineToolSupport(
  entry: ProviderDefinition,
  baseModelId: string,
  effort?: string,
): boolean {
  const modelInfo = entry.models?.[baseModelId];

  if (modelInfo) {
    return modelInfo.capabilities.toolCall;
  }

  const isReasoningName =
    baseModelId.toLowerCase().includes("reasoning") ||
    baseModelId.toLowerCase().includes("thinking");

  return !isReasoningName && !effort;
}

export function applyModelVariants(
  providerId: string,
  effort: string | undefined,
  existingOptions: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  if (!effort) return existingOptions;

  const variantOpts = getVariantOptions(providerId, effort);
  return {
    ...existingOptions,
    ...variantOpts,
  };
}
