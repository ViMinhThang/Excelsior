import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { SkillCatalog } from "./skills/SkillCatalog.js";
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
import { EventBus } from "./EventBus.js";
import { registerSkills } from "./skills/register.js";
import { createBuiltInCommands } from "./commands.js";
import {
  buildCompactionNotice,
  buildCompactionSummary,
  buildRunContext,
  loadProjectInstructions,
} from "./context/index.js";
import { GitHubReviewService } from "./github.js";
import { revertLastCompletedTurn } from "./history/revert.js";
import { copyHarnessEvents, replayHarnessEvents } from "./inspector.js";
import { createDeepSeekProvider } from "./provider.js";
import { projectHarnessState, ProjectionCache } from "./projection.js";
import { CommandRegistry, ExtensionRegistry, ProviderRegistry, ToolRegistry } from "./registries.js";
import { RunController } from "./runController.js";
import { FileHarnessStorage } from "./storage.js";
import { SessionManager } from "./SessionManager.js";
import { EventStore } from "./EventStore.js";
import { SettingsStore } from "./SettingsStore.js";
import { ConfirmationRouter } from "./ConfirmationRouter.js";
import { ActiveRunManager } from "./activeRun.js";
import { createBuiltInTools } from "./tools/index.js";
import type {
  AgentHarness,
  HarnessCatalog,
  HarnessCommand,
  HarnessConfig,
  HarnessInspectionSnapshot,
  HarnessReplayReport,
  HarnessSettings,
  HarnessSnapshot,
  ToolExecutionContext,
} from "./types.js";

export function createAgentHarness(config: HarnessConfig = {}): AgentHarness {
  return new HarnessStore(config);
}

class HarnessStore implements AgentHarness {
  private readonly storage: FileHarnessStorage;
  private readonly providers = new ProviderRegistry();
  private readonly tools = new ToolRegistry();
  private readonly commands = new CommandRegistry();
  private readonly runController = new RunController();
  private readonly extensions: ExtensionRegistry;
  private readonly listeners = new Set<() => void>();
  private readonly workspace: Workspace;

  private readonly sessionManager: SessionManager;
  private readonly eventStore: EventStore;
  private readonly settingsStore: SettingsStore;
  private readonly confirmRouter: ConfirmationRouter;
  private readonly activeRun = new ActiveRunManager();

  private mode: AgentMode = "act";
  private snapshot!: HarnessSnapshot;
  private skillCatalog!: SkillCatalog;
  private skillsList?: string;
  private readonly eventBus: EventBus;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly projectionCache = new ProjectionCache();

  constructor(config: HarnessConfig) {
    this.storage = new FileHarnessStorage(config.dataDir);
    this.workspace = this.storage.getOrCreateWorkspace({
      id: config.workspaceId,
      rootPath: config.workspaceRoot,
    });
    this.sessionManager = new SessionManager(this.storage, this.workspace.id);
    this.eventStore = new EventStore(this.storage, this.workspace.id);
    this.settingsStore = new SettingsStore(this.storage);
    this.confirmRouter = new ConfirmationRouter();
    this.extensions = new ExtensionRegistry(this.providers, this.tools, this.commands);

    this.eventBus = new EventBus(
      this.workspace.id,
      this.sessionManager,
      this.eventStore,
      this.extensions,
      () => this.notify(),
      (runId) => this.activeRun.isRunFinalized(runId),
    );

    this.providers.register(createDeepSeekProvider());
    for (const tool of createBuiltInTools()) this.tools.register(tool);

    this.skillCatalog = SkillCatalog.discover(this.workspace.rootPath, { reader: config.skillsReader });
    const skills = this.skillCatalog.getSkills();
    if (skills.length > 0) {
      this.skillsList = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
      registerSkills(
        this.skillCatalog,
        this.tools,
        this.commands,
        async (body, name) => {
          await this.send({
            content: body,
            mode: this.mode,
            displayContent: `Running skill: ${name}`,
          });
        },
      );
    }

    for (const command of this.createCommands(config)) this.commands.register(command);

    this.extensions.load(config.extensions ?? []);
    this.loadCurrentSessionEvents();
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
    // load AGENTS.md
    const projectInstructions = loadProjectInstructions(this.workspace.rootPath);
    const runContext = buildRunContext({
      events: this.eventStore.events,
      userContent: content,
      mode: this.mode,
      skillsList: this.skillsList,
      projectInstructions: projectInstructions?.content,
    });
    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    const run = this.activeRun.begin({ runId, turnId, sessionId: session.id });

    this.mode = input.mode;

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
      await this.runController.run({
        messages: runContext.messages,
        systemPrompt: runContext.systemPrompt,
        settings: this.settingsStore.settings,
        providers: this.providers,
        tools: this.tools,
        toolContext: this.createToolContext(runId, session.id, turnId),
        signal: run.signal,
        emit: this.eventBus.createEmitter(runId, session.id, turnId),
        getSteeringMessages: () => this.activeRun.drainSteeringMessages(),
      });
    } finally {
      this.activeRun.finish(run);
      this.sessionManager.refreshSessions();
      this.notify();
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
    return command.execute(parsed.args, this);
  }

  saveSettings(settings: Partial<HarnessSettings>): void {
    this.settingsStore.saveSettings(settings);
    this.notify();
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.confirmRouter.resolveConfirmation(callId, approved);
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

    await this.restoreBackups(session.id, result.revertedTurnId);

    this.eventStore.replaceEvents(session, result.events);
    this.sessionManager.refreshSessions();
    this.notify();
    return { handled: true, message: "Reverted last turn.", clearInput: true };
  }

  private async restoreBackups(sessionId: string, turnId?: string): Promise<void> {
    if (!turnId) return;
    const backupDir = resolve(this.storage.rootDir, "backups", this.workspace.id, sessionId, turnId);
    const manifestPath = resolve(backupDir, "manifest.json");
    if (!existsSync(manifestPath)) return;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Array<{ path: string; action: "modify" | "create" }>;
      for (const entry of manifest) {
        const workspacePath = resolve(this.workspace.rootPath, entry.path);
        if (entry.action === "modify") {
          const backupFilePath = resolve(backupDir, entry.path);
          if (existsSync(backupFilePath)) {
            const content = readFileSync(backupFilePath, "utf-8");
            writeFileSync(workspacePath, content, "utf-8");
          }
        } else if (entry.action === "create") {
          if (existsSync(workspacePath)) {
            unlinkSync(workspacePath);
          }
        }
      }
    } catch (err) {
      console.error("Failed to restore backups:", err);
    }
  }

  async compactCurrentSession(triggerMode: "manual" | "auto" = "manual"): Promise<void> {
    const session = this.sessionManager.currentSession();
    if (!session) return;
    const compactedEventCount = this.eventStore.events.length;
    if (compactedEventCount === 0) return;

    const summary = await buildCompactionSummary(this.eventStore.events, {
      providers: this.providers,
      settings: this.settingsStore.settings,
    });
    this.eventStore.clear(session);

    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    this.eventBus.emit(runId, HISTORY_COMPACTED, {
      summary,
      compactedEventCount,
      triggerMode,
    }, { sessionId: session.id, turnId });
    this.eventBus.emitAssistantMessage(runId, turnId, session.id, buildCompactionNotice(summary));
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.notify();
  }

  toggleMode(): AgentMode {
    this.mode = this.mode === "act" ? "plan" : "act";
    this.notify();
    return this.mode;
  }

  dispose(): void {
    this.cancel();
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    this.listeners.clear();
  }

  private createCommands(config: HarnessConfig): HarnessCommand[] {
    const reviewServices = config.reviewServices ?? new GitHubReviewService(() => {
      const token = this.settingsStore.settings.githubToken || process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error("GITHUB_TOKEN is not configured.");
      }
      return token;
    });
    return createBuiltInCommands({
      getDefinitions: () => this.commandsForHelp(),
      reviewServices,
    });
  }

  private commandsForHelp(): readonly HarnessCommand[] {
    const definitions = this.commands.list();
    return definitions.map((definition) => ({
      definition,
      execute: () => ({ handled: true }),
    }));
  }

  private loadCurrentSessionEvents(): void {
    const session = this.sessionManager.currentSession();
    if (!session) {
      this.eventStore.replaceEvents(null, []);
      return;
    }

    this.eventStore.replaceEvents(
      session,
      this.storage.loadEvents(this.workspace.id, session.id),
    );
  }

  private createToolContext(runId?: string, sessionId?: string, turnId?: string): ToolExecutionContext {
    const projectInstructions = loadProjectInstructions(this.workspace.rootPath);
    return {
      workspaceRoot: resolve(this.workspace.rootPath),
      mode: this.mode,
      abortSignal: this.activeRun.currentSignal(),
      confirm: (request) => this.requestConfirmation(request),
      askQuestion: (request) => this.requestQuestion(request),
      sendSubAgent: async ({ role, prompt }) => {
        const modePrefix = this.mode === "plan" ? "Plan-only analysis" : "Focused analysis";
        return `${modePrefix} from ${role}:\n${prompt}`;
      },
      emit: runId && sessionId && turnId ? this.eventBus.createEmitter(runId, sessionId, turnId) : undefined,
      settings: this.settingsStore.settings,
      providers: this.providers,
      tools: this.tools,
      skillsList: this.skillsList,
      projectInstructions: projectInstructions?.content,
      backupDir: sessionId && turnId ? resolve(this.storage.rootDir, "backups", this.workspace.id, sessionId, turnId) : undefined,
    };
  }

  private requestConfirmation(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      const active = this.activeRun.currentIdentity();
      const runId = active?.runId ?? `run_${randomUUID()}`;
      const turnId = active?.turnId;
      const sessionId = active?.sessionId ?? this.sessionManager.currentSession()?.id;
      const confirmRequest = { callId, ...request };
      this.confirmRouter.pendingConfirmation = confirmRequest;
      this.confirmRouter.addConfirmationResolver(callId, (response) => {
        this.confirmRouter.pendingConfirmation = null;
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
      this.confirmRouter.pendingQuestion = request;
      this.confirmRouter.addQuestionResolver(callId, (response) => {
        this.confirmRouter.pendingQuestion = null;
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
      isLoading: this.activeRun.isLoading(),
      sessions: this.sessionManager.sessions,
      currentSessionId: this.sessionManager.currentSessionId,
      workspace: this.workspace,
      llm: {
        providerName: provider.displayName,
        modelName: provider.modelId,
      },
      mode: this.mode,
      pendingConfirmation: this.confirmRouter.pendingConfirmation,
      pendingQuestion: this.confirmRouter.pendingQuestion,
    });
  }

  private notify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.flushNotify();
    }, 0);
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

