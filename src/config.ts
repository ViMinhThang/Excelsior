import fs from "node:fs";

import { z } from "zod";

import { CONFIG_DIR, ENV_PATH } from "./constants.js";
import { getProviderIds, PROVIDER_REGISTRY } from "./core/llm/registry.js";
import type { ProviderDefinition } from "./core/llm/types.js";

export const providerSchema = z.enum(getProviderIds() as [string, ...string[]]);

export type ProviderName = (typeof PROVIDER_REGISTRY)[number]["id"];

export type Config = {
  LLM_PROVIDER: ProviderName;
  GITHUB_TOKEN?: string | undefined;
  [key: string]: string | undefined;
};

function buildConfigSchema(providers: readonly ProviderDefinition[]) {
  const entries: [string, z.ZodTypeAny][] = [];
  for (const p of providers) {
    entries.push([p.apiKeyField, z.string().optional()]);
    entries.push([p.modelField, z.string().default(p.modelDefault)]);
  }
  return z.object(Object.fromEntries(entries));
}

const providerFieldsSchema = buildConfigSchema(PROVIDER_REGISTRY);

const configSchema = providerFieldsSchema.merge(
  z.object({
    LLM_PROVIDER: providerSchema.default("google"),
    GITHUB_TOKEN: z.string().optional(),
    // Universal LLM call options (parsed to numbers in provider.ts)
    LLM_TEMPERATURE: z.string().optional(),
    LLM_TOP_P: z.string().optional(),
    LLM_MAX_OUTPUT_TOKENS: z.string().optional(),
    LLM_TIMEOUT: z.string().optional(),
    LLM_MAX_RETRIES: z.string().optional(),
  }),
);

class DotEnvFile {
  static parse(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!match || !match[1]) continue;
      let value = (match[2] || "").trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      result[match[1]] = value;
    }
    return result;
  }

  static serialize(entries: Record<string, string>): string {
    return (
      Object.entries(entries)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}="${v}"`)
        .join("\n") + "\n"
    );
  }
}

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const parsedConfig = readConfigFile();
  const merged = { ...parsedConfig, ...process.env };
  const result = configSchema.parse(merged);

  const normalized: Config = { ...result } as unknown as Config;
  for (const provider of PROVIDER_REGISTRY) {
    normalized[provider.apiKeyField] = normalizeCredential(
      (result as Record<string, string | undefined>)[provider.apiKeyField],
    );
  }
  normalized.GITHUB_TOKEN = normalizeCredential(
    (result as Record<string, string | undefined>).GITHUB_TOKEN,
  );

  return normalized;
}

export function saveConfig(updates: Partial<Config>): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    process.env[key] = value;
  }

  const existing = DotEnvFile.parse(
    fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "",
  );
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      existing[key] = value;
    }
  }
  fs.writeFileSync(ENV_PATH, DotEnvFile.serialize(existing), "utf-8");
}

function readConfigFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  return DotEnvFile.parse(fs.readFileSync(ENV_PATH, "utf-8"));
}

function normalizeCredential(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  const looksLikePlaceholder =
    normalized === "changeme" ||
    normalized.startsWith("your_") ||
    normalized.startsWith("example_") ||
    normalized.includes("api_key_here") ||
    normalized.includes("token_here");

  return looksLikePlaceholder ? undefined : trimmed;
}
