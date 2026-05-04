import { DEFAULT_TIMEOUT } from "../../../constants.js";
import { parseNumber } from "../../../utils/numbers.js";
import type { ConfigJson } from "../custom-provider.js";
import type { ProviderDefaults } from "../types.js";
import type { Config } from "../../../config.js";

export interface CallOptions {
  temperature: number | undefined;
  topP: number | undefined;
  maxOutputTokens: number | undefined;
  maxRetries: number | undefined;
  timeout: number;
  providerOptions: Record<string, Record<string, unknown>>;
}

export function resolveOptions(
  config: Config,
  configJson: ConfigJson,
  providerDefaults: ProviderDefaults | undefined,
  providerId?: string,
): CallOptions {
  const timeout =
    parseNumber(config["LLM_TIMEOUT"], { integer: true }) ??
    configJson.callOptions?.timeout ??
    providerDefaults?.timeout ??
    DEFAULT_TIMEOUT;

  const temperature =
    parseNumber(config["LLM_TEMPERATURE"]) ??
    configJson.callOptions?.temperature ??
    providerDefaults?.temperature;

  const topP =
    parseNumber(config["LLM_TOP_P"]) ??
    configJson.callOptions?.topP ??
    providerDefaults?.topP;

  const maxOutputTokens =
    parseNumber(config["LLM_MAX_OUTPUT_TOKENS"], { integer: true }) ??
    configJson.callOptions?.maxOutputTokens ??
    providerDefaults?.maxOutputTokens;

  const maxRetries =
    parseNumber(config["LLM_MAX_RETRIES"], { integer: true }) ??
    configJson.callOptions?.maxRetries ??
    providerDefaults?.maxRetries;

  const providerOptions = {
    ...(providerDefaults?.providerOptions ?? {}),
    ...(providerId ? configJson.providerOptions?.[providerId] ?? {} : {}),
  } as Record<string, Record<string, unknown>>;

  return {
    temperature,
    topP,
    maxOutputTokens,
    maxRetries,
    timeout,
    providerOptions,
  };
}
