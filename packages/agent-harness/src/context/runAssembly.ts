import { resolve } from "node:path";
import type { AgentMessage, AgentMode } from "@excelsior/core";
import type { HarnessEventEmitter } from "../events.js";
import type { HarnessSettings, ToolActions, ToolEnv } from "../types.js";
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
  skillsList?: string;
  reflectionMemoryContext?: string;
  lsp?: LspClient;
  confirm: ToolActions["confirm"];
  askQuestion: ToolActions["askQuestion"];
  createEmitter(runId: string, sessionId: string, turnId: string): HarnessEventEmitter;
}

export interface RunAssembly {
  runContext: RunContext;
  toolEnv: ToolEnv;
  toolActions: ToolActions;
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
    toolEnv: {
      workspaceRoot,
      mode,
      abortSignal: input.abortSignal,
      emit,
      settings: input.settings,
      skillsList: input.skillsList,
      projectInstructions: projectInstructions?.content,
      backupDir: resolve(input.storageRoot, "backups", input.workspaceId, input.sessionId, input.turnId),
      lsp: input.lsp,
    },
    toolActions: {
      confirm: input.confirm,
      askQuestion: input.askQuestion,
    },
  };
}
