import { randomUUID } from "node:crypto";
import type {
  AgentMode,
  AskQuestionResponse,
  CommandResult,
  Session,
  Workspace,
} from "@excelsior/core";
import { HISTORY_COMPACTED } from "../events.js";
import type { EventBus } from "../events/EventBus.js";
import {
  buildCompactionNotice,
  buildCompactionSummary,
} from "../context/index.js";
import { revertLastCompletedTurn } from "../history/revert.js";
import { restoreTurnBackups } from "../history/turnBackups.js";
import { copyHarnessEvents, replayHarnessEvents } from "../inspector/index.js";
import type { LspManager } from "../lsp/LspManager.js";
import type { CommandRegistry, ProviderRegistry, ToolRegistry } from "../registries/registries.js";
import type { FileHarnessStorage } from "./FileHarnessStorage.js";
import type { EventRepository } from "../repository/EventRepository.js";
import type { SessionManager } from "./SessionManager.js";
import type { EventStore } from "../events/EventStore.js";
import type { SettingsStore } from "./SettingsStore.js";
import { ActiveRunManager } from "../run/ActiveRunManager.js";
import { RunOrchestrator } from "../run/RunOrchestrator.js";
import type { ReflectionRunManager, ReflectionTrigger } from "../reflection/ReflectionRunManager.js";
import { bootstrapHarness } from "../bootstrap/HarnessBootstrap.js";
import { ConfirmationCoordinator } from "./ConfirmationCoordinator.js";
import { SessionCoordinator } from "./SessionCoordinator.js";
import { SnapshotManager } from "./SnapshotManager.js";
import { MessageComposer } from "../events/MessageComposer.js";
import type {
  AgentHarness,
  ConfirmationApi,
  HarnessCatalog,
  HarnessConfig,
  HarnessInspectionSnapshot,
  HarnessReplayReport,
  HarnessSettings,
  HarnessSnapshot,
  InspectionApi,
  RunApi,
  RunInput,
  SessionApi,
  SettingsApi,
} from "../types.js";

export function createAgentHarness(config: HarnessConfig = {}): AgentHarness {
  return new HarnessStore(config);
}

class DeferredNotifier {
  private callback: () => void = () => {};
  bind(callback: () => void): void {
    this.callback = callback;
  }
  notify(): void {
    this.callback();
  }
}

class HarnessStore implements AgentHarness, RunApi, SessionApi, SettingsApi, ConfirmationApi, InspectionApi {
  private readonly storage: FileHarnessStorage;
  private readonly eventRepository: EventRepository;
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
  private readonly runOrchestrator: RunOrchestrator;

  private mode: AgentMode = "act";
  private skillsList?: string;

  constructor(config: HarnessConfig) {
    const notify = new DeferredNotifier();
    const boot = bootstrapHarness({
      config,
      notify: () => notify.notify(),
      currentMode: () => this.mode,
      sendSkill: (input) => this.send(input),
    });

    this.storage = boot.storage;
    this.eventRepository = boot.eventRepository;
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
      notify: () => notify.notify(),
    });
    this.sessions = new SessionCoordinator({
      workspaceId: this.workspace.id,
      eventRepository: this.eventRepository,
      sessionManager: this.sessionManager,
      eventStore: this.eventStore,
      eventBus: this.eventBus,
      notify: () => notify.notify(),
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
    notify.bind(() => this.snapshots.notify());
    this.runOrchestrator = new RunOrchestrator({
      workspace: this.workspace,
      storage: this.storage,
      providers: this.providers,
      tools: this.tools,
      sessionManager: this.sessionManager,
      settingsStore: this.settingsStore,
      eventStore: this.eventStore,
      eventBus: this.eventBus,
      activeRun: this.activeRun,
      confirmations: this.confirmations,
      reflectionRun: this.reflectionRun,
      lsp: this.lsp,
      skillsList: this.skillsList,
      sessions: this.sessions,
      project: (events) => this.snapshots.project(events),
      notify: () => notify.notify(),
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

  send(input: RunInput): Promise<void> {
    return this.runOrchestrator.send(input);
  }

  cancel(): void {
    this.runOrchestrator.cancel();
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
    this.runOrchestrator.cancel();
    return this.sessions.createSession(title);
  }

  async switchSession(sessionId: string): Promise<void> {
    this.runOrchestrator.cancel();
    await this.sessions.switchSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.runOrchestrator.cancel();
    await this.sessions.deleteSession(sessionId);
  }

  async deleteAllSessions(): Promise<void> {
    this.runOrchestrator.cancel();
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
      return await command.execute(parsed.args, {
        run: this,
        sessions: this,
        settings: this,
        confirmations: this,
        inspection: this,
      });
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

  getSettings(): HarnessSettings {
    return this.settingsStore.settings;
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
    const messages = new MessageComposer(this.eventBus.createEmitter(runId, session.id, turnId));
    messages.assistantMessage(buildCompactionNotice(summary));
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
    this.runOrchestrator.cancel();
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
