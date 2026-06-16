import { resolve } from "node:path";
import type { AgentMessage, AgentMode } from "@excelsior/core";
import type { HarnessEventEmitter } from "../events.js";
import type { ProviderRegistry, ToolRegistry } from "../registries.js";
import type { HarnessSettings, ToolExecutionContext } from "../types.js";
import type { LspClient } from "../lsp/LspManager.js";
import { buildRunContext, type RunContext } from "./contextBuilder.js";
import { loadProjectInstructions } from "./projectInstructions.js";

export interface RunAssemblyInput {
  workspaceRoot: string;
  storageRoot: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  turnId: string;
  priorMessages: readonly AgentMessage[];
  userContent: string;
  mode: AgentMode;
  abortSignal?: AbortSignal;
  settings: HarnessSettings;
  providers: ProviderRegistry;
  tools: ToolRegistry;
  skillsList?: string;
  reflectionMemoryContext?: string;
  lsp?: LspClient;
  confirm: ToolExecutionContext["confirm"];
  askQuestion: ToolExecutionContext["askQuestion"];
  createEmitter(runId: string, sessionId: string, turnId: string): HarnessEventEmitter;
}

export interface RunAssembly {
  runContext: RunContext;
  toolContext: ToolExecutionContext;
  emit: HarnessEventEmitter;
}

export function buildRunAssembly(input: RunAssemblyInput): RunAssembly {
  const workspaceRoot = resolve(input.workspaceRoot);
  const mode = input.mode;
  const projectInstructions = loadProjectInstructions(workspaceRoot);
  const emit = input.createEmitter(input.runId, input.sessionId, input.turnId);

  const runContext = buildRunContext({
    priorMessages: input.priorMessages,
    userContent: input.userContent,
    mode,
    skillsList: input.skillsList,
    projectInstructions: projectInstructions?.content,
    reflectionMemoryContext: input.reflectionMemoryContext,
  });

  return {
    runContext,
    emit,
    toolContext: {
      workspaceRoot,
      mode,
      abortSignal: input.abortSignal,
      confirm: input.confirm,
      askQuestion: input.askQuestion,
      sendSubAgent: async ({ role, prompt }) => {
        const modePrefix = mode === "plan" ? "Plan-only analysis" : "Focused analysis";
        return `${modePrefix} from ${role}:\n${prompt}`;
      },
      emit,
      settings: input.settings,
      providers: input.providers,
      tools: input.tools,
      skillsList: input.skillsList,
      projectInstructions: projectInstructions?.content,
      backupDir: resolve(input.storageRoot, "backups", input.workspaceId, input.sessionId, input.turnId),
      lsp: input.lsp,
    },
  };
}
