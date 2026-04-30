import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { getProviderIds, PROVIDER_REGISTRY } from "./core/providers/registry.js";

export const providerSchema = z.enum(getProviderIds() as [string, ...string[]]);

const configSchema = z.object({
  LLM_PROVIDER: providerSchema.default("google"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
  GITHUB_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
export type ProviderName = z.infer<typeof providerSchema>;

export const CONFIG_DIR = path.join(os.homedir(), ".excelsior");
export const ENV_PATH = path.join(CONFIG_DIR, ".env");

if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadConfig(): Config {
  const parsedConfig = readConfigFile();
  const merged = { ...parsedConfig, ...process.env };
  const result = configSchema.parse(merged);

  const normalized: any = { ...result };
  for (const provider of PROVIDER_REGISTRY) {
    const key = provider.apiKeyField as keyof Config;
    normalized[key] = normalizeCredential(result[key] as string | undefined);
  }
  normalized.GITHUB_TOKEN = normalizeCredential(result.GITHUB_TOKEN);

  return normalized;
}

export function saveConfig(updates: Partial<Config>): void {
  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const lines = envContent.length > 0 ? envContent.split("\n") : [];
  const envMap = new Map<string, number>();

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    const key = match?.[1];
    if (key) {
      envMap.set(key, index);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    process.env[key] = value;

    const existingIndex = envMap.get(key);
    if (existingIndex === undefined) {
      lines.push(`${key}="${value}"`);
      continue;
    }

    lines[existingIndex] = `${key}="${value}"`;
  }

  fs.writeFileSync(
    ENV_PATH,
    lines.filter((line) => line.trim().length > 0).join("\n") + "\n",
    "utf-8",
  );
}

function readConfigFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }

  const envContent = fs.readFileSync(ENV_PATH, "utf-8");
  const parsedConfig: Record<string, string> = {};

  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (!key) {
      continue;
    }
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    parsedConfig[key] = value;
  }

  return parsedConfig;
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
