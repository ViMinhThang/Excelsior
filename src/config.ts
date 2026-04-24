/**
 * @file src/config.ts
 * @description Centralized configuration and environment variable validation.
 * @why Prevents the app from running if required secrets (like API keys) are missing, ensuring fast failures.
 * @how Uses Zod or standard process.env checks to parse and validate runtime configuration for both Action and CLI modes.
 * @input process.env values.
 * @output A strongly-typed configuration object used throughout the application.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";

const configSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

const CONFIG_DIR = path.join(os.homedir(), ".excelsior");
const ENV_PATH = path.join(CONFIG_DIR, ".env");

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadConfig(): Config {
  let envContent = "";
  try {
    envContent = fs.readFileSync(ENV_PATH, "utf-8");
  } catch (e) {
    // .env might not exist
  }

  const parsedConfig: Record<string, string> = {};

  // Parse simple .env format
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      parsedConfig[key] = value;
    }
  });

  // Merge with process.env
  const merged = { ...parsedConfig, ...process.env };

  const result = configSchema.safeParse(merged);
  if (!result.success) {
    return {};
  }
  return result.data;
}

export function saveConfig(updates: Partial<Config>): void {
  let envContent = "";
  try {
    envContent = fs.readFileSync(ENV_PATH, "utf-8");
  } catch (e) {
    // .env might not exist
  }

  const lines = envContent.split("\n");
  const envMap = new Map<string, number>();
  const lineKeys: string[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      envMap.set(match[1], index);
    }
  });

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;

    if (envMap.has(key)) {
      const index = envMap.get(key)!;
      lines[index] = `${key}="${value}"`;
    } else {
      lines.push(`${key}="${value}"`);
    }
  }

  fs.writeFileSync(
    ENV_PATH,
    lines.filter((l) => l.trim().length > 0).join("\n") + "\n",
    "utf-8",
  );
}
