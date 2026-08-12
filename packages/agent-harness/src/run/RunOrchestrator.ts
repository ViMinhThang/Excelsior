import { randomUUID } from "node:crypto";
import type { AgentMode, Workspace } from "@excelsior/core";
import type { EventBus } from "../events/EventBus.js";
import { buildRunAssembly } from "../context/runAssembly.js";
import type { EventStore } from "../events/EventStore.js";
import type { AnyHarnessEvent } from "../events.js";
import type { ConfirmationCoordinator } from "../harness/ConfirmationCoordinator.js";
import type { SessionCoordinator } from "../harness/SessionCoordinator.js";
import type { LspManager } from "../lsp/LspManager.js";
import { MessageComposer } from "../events/MessageComposer.js";
import type { CanonicalReadModel } from "../projection/index.js";
import type { ProviderRegistry, ToolRegistry } from "../registries/registries.js";
import type { ReflectionRunManager } from "../reflection/ReflectionRunManager.js";
import type { SessionManager } from "../harness/SessionManager.js";
import type { SettingsStore } from "../harness/SettingsStore.js";
import type { FileHarnessStorage } from "../harness/FileHarnessStorage.js";
import { ActiveRunManager } from "./ActiveRunManager.js";
import { runAgentLoop } from "./RunController.js";

export interface RunOrchestratorDeps {
  workspace: Workspace;
  storage: FileHarnessStorage;
  providers: ProviderRegistry;
  tools: ToolRegistry;
  sessionManager: SessionManager;
  settingsStore: SettingsStore;
  eventStore: EventStore;
  eventBus: EventBus;
  activeRun: ActiveRunManager;
  confirmations: ConfirmationCoordinator;
  reflectionRun: ReflectionRunManager;
  lsp: LspManager;
  skillsList?: string;
  sessions: SessionCoordinator;
  project(events: readonly AnyHarnessEvent[]): CanonicalReadModel;
  notify(): void;
}

export interface SendRunInput {
  content: string;
  mode: AgentMode;
  sessionId?: string;
  displayContent?: string;
  silent?: boolean;
}

export class RunOrchestrator {
  constructor(private readonly deps: RunOrchestratorDeps) {}

  isActive(): boolean {
    return this.deps.activeRun.isActive();
  }

  async send(input: SendRunInput): Promise<void> {
    if (this.deps.activeRun.isActive()) {
      const steering = this.deps.activeRun.acceptSteering({
        content: input.content,
        sessionId: input.sessionId,
      });
      if (!steering) return;
      const messages = new MessageComposer(
        this.deps.eventBus.createEmitter(steering.runId, steering.sessionId, steering.turnId),
      );
      messages.userMessage({
        content: steering.content,
        displayContent: input.displayContent ?? steering.content,
      });
      return;
    }

    const content = input.content.trim();
    if (!content) return;
    if (input.sessionId) await this.deps.sessions.switchSession(input.sessionId);

    const session = this.deps.sessions.ensureSession(content);
    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    const run = this.deps.activeRun.begin({
      runId,
      turnId,
      sessionId: session.id,
      mode: input.mode,
    });

    const messages = new MessageComposer(
      this.deps.eventBus.createEmitter(runId, session.id, turnId),
    );

    const assembly = buildRunAssembly({
      workspaceRoot: this.deps.workspace.rootPath,
      storageRoot: this.deps.storage.rootDir,
      workspaceId: this.deps.workspace.id,
      sessionId: session.id,
      runId,
      turnId,
      priorMessages: this.deps.project(this.deps.eventStore.events).aiHistory,
      userContent: content,
      mode: input.mode,
      abortSignal: run.signal,
      settings: this.deps.settingsStore.settings,
      lsp: this.deps.lsp,
      skillsList: this.deps.skillsList,
      reflectionMemoryContext: this.deps.reflectionRun.buildMemoryContext(
        this.deps.settingsStore.settings.reflectionMemoryEnabled ?? false,
      ),
      confirm: (request) => this.deps.confirmations.requestConfirmation(request),
      askQuestion: (request) => this.deps.confirmations.requestQuestion(request),
      createEmitter: (activeRunId, activeSessionId, activeTurnId) =>
        this.deps.eventBus.createEmitter(activeRunId, activeSessionId, activeTurnId),
    });

    if (!input.silent) {
      messages.userMessage({
        content,
        displayContent: input.displayContent ?? content,
      });
    }

    try {
      await runAgentLoop({
        messages: assembly.runContext.messages,
        systemPrompt: assembly.runContext.systemPrompt,
        settings: this.deps.settingsStore.settings,
        providers: this.deps.providers,
        tools: this.deps.tools,
        toolEnv: assembly.toolEnv,
        toolActions: assembly.toolActions,
        signal: run.signal,
        emit: assembly.emit,
        getSteeringMessages: () => this.deps.activeRun.drainSteeringMessages(),
      });
    } finally {
      this.deps.activeRun.finish(run);
      this.deps.sessionManager.refreshSessions();
      this.deps.notify();
      if (!input.silent) {
        this.deps.reflectionRun.maybeStartAutoReflection();
      }
    }
  }

  cancel(): void {
    const run = this.deps.activeRun.abort();
    if (!run) return;
    this.deps.confirmations.cancelAll();
    this.deps.activeRun.finalizeCancelled(
      run,
      this.deps.eventStore.events,
      this.deps.eventBus.createEmitter(run.runId, run.sessionId, run.turnId),
      "Cancelled by user.",
    );
    this.deps.activeRun.clear(run);
    this.deps.sessionManager.refreshSessions();
    this.deps.notify();
  }
}
