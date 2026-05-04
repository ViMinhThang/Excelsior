import { type LanguageModel } from "ai";

import { anthropicProvider } from "../implementations/anthropic.js";
import { deepseekProvider } from "../implementations/deepseek.js";
import { googleProvider } from "../implementations/google.js";
import { openaiProvider } from "../implementations/openai.js";
import { openrouterProvider } from "../implementations/openrouter.js";
import {
  createCustomProvider,
  loadCustomProviderEntries,
} from "./custom-provider.js";
import {
  type ProviderDefinition,
  type ModelInfo,
  type ModelCapabilities,
} from "../metadata/types.js";
// import * as ModelsCatalog from "./models-catalog.js";

// ── Built-in providers ───────────────────────────────────────────────────────

const BUILT_IN_PROVIDERS: ProviderDefinition[] = [
  googleProvider,
  anthropicProvider,
  deepseekProvider,
  openaiProvider,
  openrouterProvider,
];

export const PROVIDER_REGISTRY: ProviderDefinition[] = [...BUILT_IN_PROVIDERS];

let _initialized = false;

// ── Bundled SDK factories (lazy-loaded, cached) ──────────────────────────────

type SdkFactory = (
  opts: Record<string, unknown>,
) => (modelId: string) => LanguageModel;

const SDK_FACTORY_LOADERS: Record<string, () => Promise<SdkFactory>> = {
  "@ai-sdk/openai": () =>
    import("@ai-sdk/openai").then(
      (m) => m.createOpenAI as unknown as SdkFactory,
    ),
  "@ai-sdk/anthropic": () =>
    import("@ai-sdk/anthropic").then(
      (m) => m.createAnthropic as unknown as SdkFactory,
    ),
  "@ai-sdk/google": () =>
    import("@ai-sdk/google").then(
      (m) => m.createGoogleGenerativeAI as unknown as SdkFactory,
    ),
  "@ai-sdk/deepseek": () =>
    import("@ai-sdk/deepseek").then(
      (m) => m.createDeepSeek as unknown as SdkFactory,
    ),
  "@ai-sdk/groq": () =>
    import("@ai-sdk/groq").then((m) => m.createGroq as unknown as SdkFactory),
  "@ai-sdk/mistral": () =>
    import("@ai-sdk/mistral").then(
      (m) => m.createMistral as unknown as SdkFactory,
    ),
  "@ai-sdk/xai": () =>
    import("@ai-sdk/xai").then((m) => m.createXai as unknown as SdkFactory),
  "@ai-sdk/perplexity": () =>
    import("@ai-sdk/perplexity").then(
      (m) => m.createPerplexity as unknown as SdkFactory,
    ),
  "@ai-sdk/openai-compatible": () =>
    import("@ai-sdk/openai-compatible").then(
      (m) => m.createOpenAICompatible as unknown as SdkFactory,
    ),
  "@openrouter/ai-sdk-provider": () =>
    import("@openrouter/ai-sdk-provider").then(
      (m) => m.createOpenRouter as unknown as SdkFactory,
    ),
};

const _sdkCache = new Map<string, SdkFactory>();

function loadSdkFactory(npm: string): Promise<SdkFactory | undefined> {
  const cached = _sdkCache.get(npm);
  if (cached) return Promise.resolve(cached);

  const loader = SDK_FACTORY_LOADERS[npm];
  if (!loader) return Promise.resolve(undefined);

  return loader().then((factory) => {
    _sdkCache.set(npm, factory);
    return factory;
  });
}

// ── Catalog-to-ProviderDefinition conversion ─────────────────────────────────

/*
function catalogModelToModelInfo(catalogModel: ModelsCatalog.ModelsDevModel): ModelInfo {
  const capabilities: ModelCapabilities = {
    temperature: catalogModel.temperature,
    reasoning: catalogModel.reasoning,
    attachment: catalogModel.attachment,
    toolCall: catalogModel.tool_call,
    input: catalogModel.modalities?.input ?? ["text"],
    output: catalogModel.modalities?.output ?? ["text"],
  };

  return {
    id: catalogModel.id,
    name: catalogModel.name,
    ...(catalogModel.family !== undefined ? { family: catalogModel.family } : {}),
    capabilities,
    cost: catalogModel.cost
      ? {
          input: catalogModel.cost.input,
          output: catalogModel.cost.output,
          ...(catalogModel.cost.cache_read !== undefined ? { cacheRead: catalogModel.cost.cache_read } : {}),
          ...(catalogModel.cost.cache_write !== undefined ? { cacheWrite: catalogModel.cost.cache_write } : {}),
        }
      : undefined,
    limit: {
      context: catalogModel.limit.context,
      ...(catalogModel.limit.input !== undefined ? { input: catalogModel.limit.input } : {}),
      output: catalogModel.limit.output,
    },
    ...(catalogModel.status !== undefined ? { status: catalogModel.status } : {}),
    releaseDate: catalogModel.release_date,
    ...(catalogModel.interleaved !== undefined ? { interleaved: catalogModel.interleaved } : {}),
  } as ModelInfo;
}

async function createCatalogProvider(
  cp: ModelsCatalog.ModelsDevProvider,
): Promise<ProviderDefinition | null> {
  const id = cp.id;
  const apiKeyField = cp.env[0] ?? `${id.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const modelField = `${id.toUpperCase().replace(/-/g, "_")}_MODEL`;

  const modelEntries = Object.entries(cp.models);
  if (modelEntries.length === 0) return null;

  const modelIds = modelEntries.map(([k]) => k);
  const modelDefault = modelIds[0]!;

  const models: Record<string, ModelInfo> = {};
  for (const [modelId, catalogModel] of modelEntries) {
    models[modelId] = catalogModelToModelInfo(catalogModel);
  }

  const recommendedModels = modelEntries
    .filter(([, m]) => !m.status || m.status !== "deprecated")
    .map(([k]) => k)
    .slice(0, 15);

  let resolvedNpm: string | undefined = cp.npm;
  let resolvedBaseURL: string | undefined;

  const sdkFactory = await loadSdkFactory(resolvedNpm ?? "");

  let factory = sdkFactory;
  if (!factory) {
    resolvedNpm = "@ai-sdk/openai-compatible";
    factory = await loadSdkFactory(resolvedNpm);
    if (factory) {
      resolvedBaseURL = `https://api.${id}.com/v1`;
    }
  }

  if (!factory) return null;

  const createModel = (config: Record<string, string | undefined>, modelName: string): LanguageModel => {
    const opts: Record<string, unknown> = { apiKey: config[apiKeyField] ?? "" };
    if (resolvedBaseURL) {
      opts.baseURL = resolvedBaseURL;
      opts.name = id;
    }
    return factory(opts)(modelName);
  };

  return {
    id,
    label: cp.name,
    apiKeyField,
    modelField,
    modelDefault,
    recommendedModels: recommendedModels.length > 0 ? recommendedModels : modelIds.slice(0, 10),
    models,
    ...(resolvedNpm !== undefined ? { npm: resolvedNpm } : {}),
    ...(cp.api !== undefined ? { api: cp.api } : {}),
    env: cp.env,
    createModel,
  } as ProviderDefinition;
}
*/

// ── Initialization ───────────────────────────────────────────────────────────

export function initRegistry(): void {
  if (_initialized) return;
  _initialized = true;

  const entries = loadCustomProviderEntries();
  for (const [pid, config] of Object.entries(entries)) {
    if (!getProvider(pid)) {
      PROVIDER_REGISTRY.push(createCustomProvider(pid, config));
    }
  }

  // initCatalogProviders().catch(() => {});
}

/*
let _catalogInited = false;

async function initCatalogProviders(): Promise<void> {
  if (_catalogInited) return;
  _catalogInited = true;

  try {
    await ModelsCatalog.get();
  } catch {
    return;
  }

  const catalogProviders = ModelsCatalog.getProviders();
  for (const cp of catalogProviders) {
    if (getProvider(cp.id)) continue;

    try {
      const def = await createCatalogProvider(cp);
      if (def) {
        PROVIDER_REGISTRY.push(def);
      }
    } catch {
      // skip
    }
  }
}
*/

initRegistry();

// ── Lookup helpers ───────────────────────────────────────────────────────────

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getProviderIds(): string[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}
