import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".excelsior");
export const ENV_PATH = path.join(CONFIG_DIR, ".env");
export const CONFIG_JSON_PATH = path.join(CONFIG_DIR, "config.json");
export const GITHUB_TOKEN_KEY = "GITHUB_TOKEN";
export const MODELS_CACHE_PATH = path.join(CONFIG_DIR, "models-cache.json");
export const DEFAULT_TIMEOUT = 60_000;
export const DEFAULT_MAX_STEPS = 6;

export const AVAILABLE_COMMANDS = [
  { name: "/pr", description: "List open pull requests for the current repo" },
  { name: "/review", description: "List pull requests or run `/review <number>`" },
  { name: "/settings", description: "Open provider and token settings" },
  { name: "/provider", description: "Select an AI provider from the catalog" },
  { name: "/model", description: "Select a model with context window and cost info" },
  { name: "/mode", description: "Switch between PLAN and ACT review modes" },
  { name: "/forget", description: "Reset session memory (coming soon)" },
  { name: "/help", description: "Show the available commands" },
];

export const SPINNER_FRAMES = ["-", "\\", "|", "/"];
