import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentCommand,
  AgentLlmInfo,
  AgentRequest,
  AgentResponse,
  AppSettings,
  CommandAck,
  WireDelta,
  Workspace,
} from "@excelsior/protocol";
import {
  ActPolicy,
  PlanPolicy,
  createCapabilityContextFactory,
  type PermissionPolicy,
} from "./capabilities.js";
import type { CapabilityContextFactory } from "./capabilities.js";
import { DiffEmitter, emitMetaError } from "./diffEmitter.js";
import { createTurnExecutor, type TurnExecutor } from "./executor.js";
import { InteractionManager } from "./interaction.js";
import { createMutate, type MetaState, type Mutate } from "./mutate.js";
import { createResponder } from "./responder.js";
import { RunStore } from "./runStore.js";
import { SessionStore } from "./sessionStore.js";
import { createSyncService } from "./sync.js";

export const ENGINE_SETTINGS_FILENAME = "settings.json";

export interface EngineConfig {
  workspace: Workspace;
  dataDir: string;
  settings?: Partial<AppSettings>;
  turnExecutor?: TurnExecutor;
}

export interface Engine {
  handleCommand(cmd: AgentCommand): CommandAck;
  handleRequest(req: AgentRequest): AgentResponse;
  subscribe(listener: (delta: WireDelta) => void): () => void;
  close(): void;
  meta: MetaState;
  mutate: Mutate;
  store: SessionStore;
  runStore: RunStore;
  emitter: DiffEmitter;
  executor: TurnExecutor;
}

const DEFAULT_SETTINGS: AppSettings = {
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

const DEFAULT_LLM: AgentLlmInfo = { providerName: "deepseek", modelName: "deepseek-v4-flash" };

function readSettings(dataDir: string, overrides: Partial<AppSettings> | undefined): AppSettings {
  let persisted: Partial<AppSettings> = {};
  const settingsPath = join(dataDir, ENGINE_SETTINGS_FILENAME);
  try {
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<AppSettings>;
      if (parsed && typeof parsed === "object") {
        persisted = parsed;
        delete (persisted as Record<string, unknown>).deepseekApiKey;
      }
    }
  } catch {
    // corrupt settings fall back to defaults
  }
  return { ...DEFAULT_SETTINGS, ...persisted, ...overrides };
}

function writeSettings(dataDir: string, settings: AppSettings): void {
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, ENGINE_SETTINGS_FILENAME), JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // a failed settings write must not break the engine
  }
}

/**
 * Full engine assembly: stores, mutation path, interaction manager, capability
 * policies, sync service, responder, and the turn executor. The daemon
 * entrypoint and integration tests share this object.
 */
export function createEngine(config: EngineConfig): Engine {
  const { workspace, dataDir } = config;
  const store = new SessionStore(dataDir, workspace.id);
  const runStore = new RunStore();
  const emitter = new DiffEmitter();
  const meta: MetaState = {
    currentSessionId: null,
    mode: "plan",
    settings: readSettings(dataDir, config.settings),
    workspace,
    llm: DEFAULT_LLM,
  };

  const mutate = createMutate({ store, emitter, runStore, meta });
  const interactions = new InteractionManager({ mutate, emitter, meta });

  const actPolicy = new ActPolicy(interactions);
  const planPolicy = new PlanPolicy();
  const permission: PermissionPolicy = {
    decide: (act) => (meta.mode === "act" ? actPolicy : planPolicy).decide(act),
    confirm: (act, callId) => (meta.mode === "act" ? actPolicy : planPolicy).confirm(act, callId),
    ask: (question, callId) => (meta.mode === "act" ? actPolicy : planPolicy).ask(question, callId),
  };

  const capabilityFactory: CapabilityContextFactory = createCapabilityContextFactory({
    workspace,
    settings: () => meta.settings,
    mode: () => meta.mode,
    permission,
    logger: { notice: () => undefined },
  });

  const emitError = (message: string): void => {
    emitMetaError(emitter, message);
  };

  const executor =
    config.turnExecutor ??
    createTurnExecutor({
      store,
      runStore,
      meta,
      mutate,
      capabilityFactory,
      emitError,
    });

  const syncService = createSyncService({ emitter, store, runStore, meta });
  const responder = createResponder({
    mutate,
    emitter,
    store,
    runStore,
    meta,
    syncService,
    startTurn: (content, options) => executor.start(content, options),
  });

  emitter.subscribe((delta) => {
    if (delta.delta.kind === "meta-changed") {
      writeSettings(dataDir, meta.settings);
    } else if (delta.delta.kind === "run-status" && delta.delta.status !== "running") {
      executor.abort(delta.delta.turnId);
    }
  });

  return {
    handleCommand: (cmd) => responder.handleCommand(cmd),
    handleRequest: (req) => responder.handleRequest(req),
    subscribe: (listener) => emitter.subscribe(listener),
    close: () => {
      store.flush();
    },
    meta,
    mutate,
    store,
    runStore,
    emitter,
    executor,
  };
}