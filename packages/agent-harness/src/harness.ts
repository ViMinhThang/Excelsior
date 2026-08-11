import { randomUUID } from "node:crypto";
import type {
  AgentMode,
  AskQuestionRequest,
  AskQuestionResponse,
  CommandResult,
  ConfirmRequest,
  ConfirmResponse,
  Session,
  Workspace,
} from "@excelsior/core";
import {
  CONFIRMATION_ANSWERED,
  CONFIRMATION_REQUESTED,
  HISTORY_COMPACTED,
  QUESTION_ANSWERED,
  QUESTION_REQUESTED,
  SESSION_CHANGED,
} from "./events.js";
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
import { projectHarnessState, ProjectionCache } from "./projection.js";
import type { CommandRegistry, ProviderRegistry, ToolRegistry } from "./registries.js";
import { runAgentLoop } from "./run/RunController.js";
import type { FileHarnessStorage } from "./storage.js";
import type { SessionManager } from "./SessionManager.js";
import type { EventStore } from "./EventStore.js";
import type { SettingsStore } from "./SettingsStore.js";
import { ConfirmationRouter } from "./ConfirmationRouter.js";
import { ActiveRunManager } from "./run/ActiveRunManager.js";
import type { ReflectionRunManager, ReflectionTrigger } from "./reflection/ReflectionRunManager.js";
import { bootstrapHarness } from "./bootstrap/HarnessBootstrap.js";
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

  private readonly listeners = new Set<() => void>();
  private readonly workspace: Workspace;

  private readonly sessionManager: SessionManager;
  private readonly eventStore: EventStore;
  private readonly settingsStore: SettingsStore;
  private readonly confirmRouter: ConfirmationRouter;
  private readonly activeRun = new ActiveRunManager();
  private readonly reflectionRun: ReflectionRunManager;
  private readonly lsp: LspManager;

  private mode: AgentMode = "act";
  private snapshot!: HarnessSnapshot;
  private skillsList?: string;
  private readonly eventBus: EventBus;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly projectionCache = new ProjectionCache();

  constructor(config: HarnessConfig) {
    const boot = bootstrapHarness({
      config,
      activeRun: this.activeRun,
      notify: () => this.notify(),
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
    this.confirmRouter = new ConfirmationRouter();
    this.lsp = boot.lsp;
    this.reflectionRun = boot.reflectionRun;
    this.eventBus = boot.eventBus;
    this.skillsList = boot.skillsList;
    this.updateSnapshot();
  }

  getSnapshot(): HarnessSnapshot {
    this.flushPendingSnapshot();
    return this.snapshot;
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
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

    const session = this.ensureSession(content);
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
      priorMessages: this.projectionCache.project(this.eventStore.events).aiHistory,
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
      confirm: (request) => this.requestConfirmation(request),
      askQuestion: (request) => this.requestQuestion(request),
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
      this.notify();
      if (!input.silent) {
        this.reflectionRun.maybeStartAutoReflection();
      }
    }
  }

  cancel(): void {
    const run = this.activeRun.abort();
    if (!run) return;
    this.confirmRouter.cancelAll();
    this.activeRun.finalizeCancelled(
      run,
      this.eventStore.events,
      this.eventBus.createEmitter(run.runId, run.sessionId, run.turnId),
      "Cancelled by user.",
    );
    this.activeRun.clear(run);
    this.sessionManager.refreshSessions();
    this.notify();
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
    this.notify();
  }

  createSession(title = "Untitled"): Session {
    this.cancel();
    const session = this.sessionManager.createSession(title);
    this.eventStore.clear(session);
    this.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
      sessionId: session.id,
      reason: "created",
    }, {
      sessionId: session.id,
    });
    return session;
  }

  async switchSession(sessionId: string): Promise<void> {
    this.cancel();
    const loaded = this.storage.loadSessionFile(this.workspace.id, sessionId);
    if (!loaded.session) return;
    this.sessionManager.currentSessionId = sessionId;
    this.eventStore.replaceEvents(loaded.session, loaded.events ?? []);
    this.sessionManager.refreshSessions();
    this.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
      sessionId,
      reason: "switched",
    }, {
      sessionId,
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.cancel();
    this.sessionManager.deleteSession(sessionId);
    if (this.sessionManager.currentSessionId) {
      const loadedEvents = this.storage.loadEvents(this.workspace.id, this.sessionManager.currentSessionId);
      this.eventStore.replaceEvents(this.sessionManager.currentSession()!, loadedEvents);
      this.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
        sessionId: this.sessionManager.currentSessionId,
        reason: "deleted",
      }, {
        sessionId: this.sessionManager.currentSessionId,
      });
    } else {
      this.eventStore.replaceEvents(null, []);
      this.notify();
    }
  }

  async deleteAllSessions(): Promise<void> {
    this.cancel();
    this.sessionManager.deleteAllSessions();
    this.eventStore.replaceEvents(null, []);
    this.notify();
  }

  renameSession(sessionId: string, title: string): void {
    this.sessionManager.renameSession(sessionId, title);
    if (this.sessionManager.currentSessionId === sessionId) {
      this.eventBus.emit(`run_${randomUUID()}`, SESSION_CHANGED, {
        sessionId,
        reason: "renamed",
      }, {
        sessionId,
      });
    } else {
      this.notify();
    }
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
    this.notify();
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.confirmRouter.resolveConfirmation(callId, approved);
  }

  approveAllConfirmations(): void {
    this.confirmRouter.approveAllConfirmations();
  }

  respondToQuestion(response: AskQuestionResponse): void {
    this.confirmRouter.resolveQuestion(response);
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
    this.notify();
    return { handled: true, message: "Reverted last turn.", clearInput: true };
  }

  async compactCurrentSession(triggerMode: "manual" | "auto" = "manual"): Promise<void> {
    const session = this.sessionManager.currentSession();
    if (!session) return;
    const eventsToCompact = [...this.eventStore.events];
    const compactedEventCount = eventsToCompact.length;
    if (compactedEventCount === 0) return;

    this.eventStore.clear(session);
    this.notifyNow();

    const summary = await buildCompactionSummary(
      this.projectionCache.project(eventsToCompact).aiHistory,
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
    this.notifyNow();
  }

  setMode(mode: AgentMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.notifyNow();
  }

  toggleMode(): AgentMode {
    this.mode = this.mode === "act" ? "plan" : "act";
    this.notifyNow();
    return this.mode;
  }

  dispose(): void {
    this.cancelReflection();
    this.cancel();
    this.lsp.dispose();
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.listeners.clear();
  }

  private requestConfirmation(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      const active = this.activeRun.currentIdentity();
      const runId = active?.runId ?? `run_${randomUUID()}`;
      const turnId = active?.turnId;
      const sessionId = active?.sessionId ?? this.sessionManager.currentSession()?.id;
      const confirmRequest = { callId, ...request };
      this.confirmRouter.addConfirmation(confirmRequest, (response) => {
        if (sessionId) {
          this.eventBus.emit(runId, CONFIRMATION_ANSWERED, { response }, { sessionId, turnId });
        }
        resolveResponse(response);
        this.notify();
      });
      if (sessionId) {
        this.eventBus.emit(runId, CONFIRMATION_REQUESTED, { request: confirmRequest }, { sessionId, turnId });
      }
      this.notify();
    });
  }

  private requestQuestion(input: Omit<AskQuestionRequest, "callId">): Promise<AskQuestionResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      const active = this.activeRun.currentIdentity();
      const runId = active?.runId ?? `run_${randomUUID()}`;
      const turnId = active?.turnId;
      const sessionId = active?.sessionId ?? this.sessionManager.currentSession()?.id;
      const request = { callId, ...input };
      this.confirmRouter.addQuestion(request, (response) => {
        if (sessionId) {
          this.eventBus.emit(runId, QUESTION_ANSWERED, { response }, { sessionId, turnId });
        }
        resolveResponse(response);
        this.notify();
      });
      if (sessionId) {
        this.eventBus.emit(runId, QUESTION_REQUESTED, { request }, { sessionId, turnId });
      }
      this.notify();
    });
  }

  private ensureSession(firstInput: string): Session {
    const current = this.sessionManager.currentSession();
    if (current) return current;
    const title = firstInput.length > 50 ? `${firstInput.slice(0, 47)}...` : firstInput;
    return this.createSession(title || "Untitled");
  }

  private updateSnapshot(): void {
    const provider = this.providers.get();
    this.snapshot = projectHarnessState({
      events: this.eventStore.events,
      readModel: this.projectionCache.project(this.eventStore.events),
      isLoading: this.activeRun.isActive(),
      sessions: this.sessionManager.sessions,
      currentSessionId: this.sessionManager.currentSessionId,
      workspace: this.workspace,
      llm: {
        providerName: provider.displayName,
        modelName: provider.modelId,
      },
      mode: this.activeRun.currentIdentity()?.mode ?? this.mode,
      pendingConfirmation: this.confirmRouter.pendingConfirmation,
      pendingQuestion: this.confirmRouter.pendingQuestion,
      reflection: this.reflectionRun.snapshot(),
    });
  }

  private notify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.flushNotify();
    }, 0);
  }

  private notifyNow(): void {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.flushNotify();
  }

  private flushPendingSnapshot(): void {
    if (!this.notifyTimer) return;
    clearTimeout(this.notifyTimer);
    this.notifyTimer = null;
    this.updateSnapshot();
  }

  private flushNotify(): void {
    this.updateSnapshot();
    for (const listener of this.listeners) listener();
  }
}

function parseCommandInput(input: string): { name: string; args: string[] } | null {
  if (!input.startsWith("/")) return null;
  const text = input.slice(1).trim();
  if (!text) return null;
  const [name, ...args] = text.split(/\s+/);
  return { name: name.toLowerCase(), args };
}
