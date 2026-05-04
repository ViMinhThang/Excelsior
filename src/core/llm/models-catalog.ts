import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../../constants.js";

export interface ModelsDevModel {
  id: string;
  name: string;
  family?: string;
  release_date: string;
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  tool_call: boolean;
  interleaved?: boolean | { field: "reasoning_content" | "reasoning_details" };
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
    context_over_200k?: {
      input: number;
      output: number;
      cache_read?: number;
      cache_write?: number;
    };
  };
  limit: {
    context: number;
    input?: number;
    output: number;
  };
  modalities?: {
    input: string[];
    output: string[];
  };
  status?: "alpha" | "beta" | "deprecated";
  provider?: {
    npm?: string;
    api?: string;
  };
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  api?: string;
  env: string[];
  npm?: string;
  models: Record<string, ModelsDevModel>;
}

type Catalog = Record<string, ModelsDevProvider>;

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_FILE = path.join(CONFIG_DIR, "models-cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

let _catalog: Catalog | null = null;
let _loadPromise: Promise<Catalog> | null = null;
let _refreshTimer: ReturnType<typeof setInterval> | null = null;

function isCacheFresh(): boolean {
  try {
    if (!fs.existsSync(CACHE_FILE)) return false;
    const stat = fs.statSync(CACHE_FILE);
    return Date.now() - stat.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function loadFromCache(): Catalog | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(data) as Catalog;
  } catch {
    return null;
  }
}

function saveToCache(catalog: Catalog): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(catalog), "utf-8");
  } catch {
    // cache is optional
  }
}

async function fetchCatalog(): Promise<Catalog> {
  const response = await fetch(MODELS_DEV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev: ${response.status}`);
  }
  return response.json() as Promise<Catalog>;
}

export async function get(): Promise<Catalog> {
  if (_catalog) return _catalog;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    if (isCacheFresh()) {
      const cached = loadFromCache();
      if (cached) {
        _catalog = cached;
        return cached;
      }
    }

    try {
      const catalog = await fetchCatalog();
      saveToCache(catalog);
      _catalog = catalog;
      return catalog;
    } catch {
      const cached = loadFromCache();
      if (cached) {
        _catalog = cached;
        return cached;
      }
      return {};
    }
  })();

  try {
    return await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

export function getProviders(): ModelsDevProvider[] {
  if (!_catalog) return [];
  return Object.values(_catalog);
}

export function getProviderById(id: string): ModelsDevProvider | undefined {
  return _catalog?.[id];
}

export function getProviderModels(providerId: string): ModelsDevModel[] {
  const provider = _catalog?.[providerId];
  if (!provider) return [];
  return Object.values(provider.models);
}

export function getModel(providerId: string, modelId: string): ModelsDevModel | undefined {
  return _catalog?.[providerId]?.models[modelId];
}

export async function refresh(force = false): Promise<void> {
  if (!force && isCacheFresh()) return;

  try {
    const catalog = await fetchCatalog();
    saveToCache(catalog);
    _catalog = catalog;
  } catch {
    // retry on next interval
  }
}

export function startBackgroundRefresh(): void {
  if (_refreshTimer) return;
  _refreshTimer = setInterval(() => { refresh(); }, REFRESH_INTERVAL_MS);
  if (_refreshTimer && typeof _refreshTimer === "object" && "unref" in _refreshTimer) {
    (_refreshTimer as NodeJS.Timeout).unref();
  }
}

export function stopBackgroundRefresh(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
