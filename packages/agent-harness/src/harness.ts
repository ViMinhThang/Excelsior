import { randomUUID } from "node:crypto";
import type {
  AgentMode,
  AskQuestionResponse,
  CommandResult,
  Session,
  Workspace,
} from "@excelsior/core";
import { HISTORY_COMPACTED } from "./events.js";
import type { EventBus } from "./EventBus.js";
import {
  buildCompactionNotice,
  buildCompactionSummary,
} from "./context/index.js";
import { buildRunAssembly } from "./context/runAssembly.js";
import { revertLastCompletedTurn } from "./history/revert.js";
import { restoreTurnBackups } from "./history/turnBackups.js";
import { copyHarnessEvents, replayHarnessEvents } from "./inspector.js";
import type { LspManager } from "./lsp/LspManager.js";
import type { CommandRegistry, ProviderRegistry, ToolRegistry } from "./registries.js";
import { runAgentLoop } from "./run/RunController.js";
import type { FileHarnessStorage } from "./storage.js";
import type { SessionManager } from "./SessionManager.js";
import type { EventStore } from "./EventStore.js";
import type { SettingsStore } from "./SettingsStore.js";
import { ActiveRunManager } from "./run/ActiveRunManager.js";
import type { ReflectionRunManager, ReflectionTrigger } from "./reflection/ReflectionRunManager.js";
import { bootstrapHarness } from "./bootstrap/HarnessBootstrap.js";
import { ConfirmationCoordinator } from "./harness/ConfirmationCoordinator.js";
import { SessionCoordinator } from "./harness/SessionCoordinator.js";
import { SnapshotManager } from "./harness/SnapshotManager.js";
import type {
  AgentHarness,
  HarnessCatalog,
  HarnessConfig,
  HarnessInspectionSnapshot,
  HarnessReplayReport,
  HarnessSettings,
  HarnessSnapshot,
} from "./types.js";

export function createAgentHarness(config: HarnessConfig = {}): AgentHarness {
  return new HarnessStore(config);
}

class HarnessStore implements AgentHarness {
  private readonly storage: FileHarnessStorage;
  private readonly providers: ProviderRegistry;
  private readonly tools: ToolRegistry;
  private readonly commands: CommandRegistry;

  private readonly workspace: Workspace;
  private readonly sessionManager: SessionManager;
  private readonly eventStore: EventStore;
  private readonly settingsStore: SettingsStore;
  private readonly activeRun = new ActiveRunManager();
  private readonly reflectionRun: ReflectionRunManager;
  private readonly lsp: LspManager;
  private readonly eventBus: EventBus;
  private readonly confirmations: ConfirmationCoordinator;
  private readonly sessions: SessionCoordinator;
  private readonly snapshots!: SnapshotManager;

  private mode: AgentMode = "act";
  private skillsList?: string;

  constructor(config: HarnessConfig) {
    const boot = bootstrapHarness({
      config,
      activeRun: this.activeRun,
      notify: () => this.snapshots?.notify(),
      currentMode: () => this.mode,
      sendSkill: (input) => this.send(input),
    });

    this.storage = boot.storage;
    this.providers = boot.providers;
    this.tools = boot.tools;
    this.commands = boot.commands;
    this.workspace = boot.workspace;
    this.sessionManager = boot.sessionManager;
    this.eventStore = boot.eventStore;
    this.settingsStore = boot.settingsStore;
    this.lsp = boot.lsp;
    this.reflectionRun = boot.reflectionRun;
    this.eventBus = boot.eventBus;
    this.skillsList = boot.skillsList;

    this.confirmations = new ConfirmationCoordinator({
      eventBus: this.eventBus,
      activeRun: this.activeRun,
      sessionManager: this.sessionManager,
      notify: () => this.snapshots?.notify(),
    });
    this.sessions = new SessionCoordinator({
      workspaceId: this.workspace.id,
      storage: this.storage,
      sessionManager: this.sessionManager,
      eventStore: this.eventStore,
      eventBus: this.eventBus,
      cancel: () => this.cancel(),
      notify: () => this.snapshots?.notify(),
    });
    this.snapshots = new SnapshotManager({
      providers: this.providers,
      eventStore: this.eventStore,
      sessionManager: this.sessionManager,
      workspace: this.workspace,
      activeRun: this.activeRun,
      confirmations: this.confirmations,
      reflectionRun: this.reflectionRun,
      getMode: () => this.mode,
    });
  }

  getSnapshot(): HarnessSnapshot {
    return this.snapshots.getSnapshot();
  }

  getCatalog(): HarnessCatalog {
    return {
      commands: this.commands.list(),
      settings: this.settingsStore.settings,
    };
  }

  inspectCurrentSession(): HarnessInspectionSnapshot {
    const session = this.sessionManager.currentSession();
    return {
      session: session ? { ...session, metadata: { ...session.metadata } } : null,
      events: copyHarnessEvents(this.eventStore.events),
      snapshot: this.getSnapshot(),
    };
  }

  replayCurrentSession(): HarnessReplayReport {
    return replayHarnessEvents(this.inspectCurrentSession());
  }

  subscribe(listener: () => void): () => void {
    return this.snapshots.subscribe(listener);
  }

  async send(input: { content: string; mode: AgentMode; sessionId?: string; displayContent?: string; silent?: boolean }): Promise<void> {
    if (this.activeRun.isActive()) {
      const steering = this.activeRun.acceptSteering({ content: input.content, sessionId: input.sessionId });
      if (!steering) return;
      this.eventBus.emitUserMessage({
        runId: steering.runId,
        turnId: steering.turnId,
        sessionId: steering.sessionId,
        content: steering.content,
        displayContent: input.displayContent ?? steering.content,
      });
      return;
    }
    const content = input.content.trim();
    if (!content) return;
    if (input.sessionId) await this.switchSession(input.sessionId);

    const session = this.sessions.ensureSession(content);
    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    const runMode = input.mode;
    const run = this.activeRun.begin({
      runId,
      turnId,
      sessionId: session.id,
      mode: runMode,
    });

    const assembly = buildRunAssembly({
      workspaceRoot: this.workspace.rootPath,
      storageRoot: this.storage.rootDir,
      workspaceId: this.workspace.id,
      sessionId: session.id,
      runId,
      turnId,
      priorMessages: this.snapshots.project(this.eventStore.events).aiHistory,
      userContent: content,
      mode: runMode,
      abortSignal: run.signal,
      settings: this.settingsStore.settings,
      providers: this.providers,
      tools: this.tools,
      lsp: this.lsp,
      skillsList: this.skillsList,
      reflectionMemoryContext: this.reflectionRun.buildMemoryContext(
        this.settingsStore.settings.reflectionMemoryEnabled ?? false,
      ),
      confirm: (request) => this.confirmations.requestConfirmation(request),
      askQuestion: (request) => this.confirmations.requestQuestion(request),
      createEmitter: (activeRunId, activeSessionId, activeTurnId) =>
        this.eventBus.createEmitter(activeRunId, activeSessionId, activeTurnId),
    });

    if (!input.silent) {
      this.eventBus.emitUserMessage({
        runId,
        turnId,
        sessionId: session.id,
        content,
        displayContent: input.displayContent ?? content,
      });
    }

    try {
      await runAgentLoop({
        messages: assembly.runContext.messages,
        systemPrompt: assembly.runContext.systemPrompt,
        settings: this.settingsStore.settings,
        providers: this.providers,
        tools: this.tools,
        toolContext: assembly.toolContext,
        signal: run.signal,
        emit: assembly.emit,
        getSteeringMessages: () => this.activeRun.drainSteeringMessages(),
      });
    } finally {
      this.activeRun.finish(run);
      this.sessionManager.refreshSessions();
      this.snapshots.notify();
      if (!input.silent) {
        this.reflectionRun.maybeStartAutoReflection();
      }
    }
  }

  cancel(): void {
    const run = this.activeRun.abort();
    if (!run) return;
    this.confirmations.cancelAll();
    this.activeRun.finalizeCancelled(
      run,
      this.eventStore.events,
      this.eventBus.createEmitter(run.runId, run.sessionId, run.turnId),
      "Cancelled by user.",
    );
    this.activeRun.clear(run);
    this.sessionManager.refreshSessions();
    this.snapshots.notify();
  }

  startReflection(trigger: ReflectionTrigger): Promise<CommandResult> {
    return this.reflectionRun.startReflection(trigger);
  }

  cancelReflection(): void {
    this.reflectionRun.cancelReflection();
  }

  clear(): void {
    const session = this.sessionManager.currentSession();
    if (!session) return;
    this.eventStore.clear(session);
    this.snapshots.notify();
  }

  createSession(title = "Untitled"): Session {
    return this.sessions.createSession(title);
  }

  async switchSession(sessionId: string): Promise<void> {
    await this.sessions.switchSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessions.deleteSession(sessionId);
  }

  async deleteAllSessions(): Promise<void> {
    await this.sessions.deleteAllSessions();
  }

  renameSession(sessionId: string, title: string): void {
    this.sessions.renameSession(sessionId, title);
  }

  async executeCommand(input: string): Promise<CommandResult> {
    const parsed = parseCommandInput(input);
    if (!parsed) return { handled: false };
    const command = this.commands.get(parsed.name);
    if (!command) {
      return {
        handled: true,
        message: `Unknown command: /${parsed.name}. Type /help for a list of commands.`,
        clearInput: true,
      };
    }
    try {
      return await command.execute(parsed.args, this);
    } catch (error) {
      return {
        handled: true,
        message: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
        clearInput: true,
      };
    }
  }

  saveSettings(settings: Partial<HarnessSettings>): void {
    this.settingsStore.saveSettings(settings);
    this.snapshots.notify();
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.confirmations.respondToConfirmation(callId, approved);
  }

  approveAllConfirmations(): void {
    this.confirmations.approveAllConfirmations();
  }

  respondToQuestion(response: AskQuestionResponse): void {
    this.confirmations.respondToQuestion(response);
  }

  async revertLastTurn(): Promise<CommandResult> {
    const session = this.sessionManager.currentSession();
    if (!session) return { handled: true, message: "No active session.", clearInput: true };

    const result = revertLastCompletedTurn(this.eventStore.events);
    if (!result) {
      return { handled: true, message: "No completed turn to revert.", clearInput: true };
    }

    restoreTurnBackups({
      storageRoot: this.storage.rootDir,
      workspaceRoot: this.workspace.rootPath,
      workspaceId: this.workspace.id,
      sessionId: session.id,
      turnId: result.revertedTurnId,
    });

    this.eventStore.replaceEvents(session, result.events);
    this.sessionManager.refreshSessions();
    this.snapshots.notify();
    return { handled: true, message: "Reverted last turn.", clearInput: true };
  }

  async compactCurrentSession(triggerMode: "manual" | "auto" = "manual"): Promise<void> {
    const session = this.sessionManager.currentSession();
    if (!session) return;
    const eventsToCompact = [...this.eventStore.events];
    const compactedEventCount = eventsToCompact.length;
    if (compactedEventCount === 0) return;

    this.eventStore.clear(session);
    this.snapshots.notifyNow();

    const summary = await buildCompactionSummary(
      this.snapshots.project(eventsToCompact).aiHistory,
      {
        providers: this.providers,
        settings: this.settingsStore.settings,
      },
    );

    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    this.eventBus.emit(runId, HISTORY_COMPACTED, {
      summary,
      compactedEventCount,
      triggerMode,
    }, { sessionId: session.id, turnId });
    this.eventBus.emitAssistantMessage(runId, turnId, session.id, buildCompactionNotice(summary));
    this.snapshots.notifyNow();
  }

  setMode(mode: AgentMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.snapshots.notifyNow();
  }

  toggleMode(): AgentMode {
    this.mode = this.mode === "act" ? "plan" : "act";
    this.snapshots.notifyNow();
    return this.mode;
  }

  dispose(): void {
    this.cancelReflection();
    this.cancel();
    this.lsp.dispose();
    this.snapshots.dispose();
  }
}

function parseCommandInput(input: string): { name: string; args: string[] } | null {
  if (!input.startsWith("/")) return null;
  const text = input.slice(1).trim();
  if (!text) return null;
  const [name, ...args] = text.split(/\s+/);
  return { name: name.toLowerCase(), args };
}
