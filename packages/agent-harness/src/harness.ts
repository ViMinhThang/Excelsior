import { randomUUID } from "node:crypto";
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
import { findIncompleteEvents, emitRunFinalization } from "./history/runFinalizer.js";
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

  private mode: AgentMode = "act";
  private abortController: AbortController | null = null;
  private activeRunId: string | null = null;
  private activeTurnId: string | null = null;
  private activeSessionId: string | null = null;
  private snapshot!: HarnessSnapshot;
  private skillCatalog!: SkillCatalog;
  private skillsList?: string;
  private steeringQueue: string[] = [];
  private readonly finalizedRunIds = new Set<string>();
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
      this.finalizedRunIds,
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

    const session = this.sessionManager.createSession();
    this.eventStore.clear(session);
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
    if (this.abortController) {
      const content = input.content.trim();
      if (!content) return;
      if (input.sessionId && input.sessionId !== this.activeSessionId) return;
      if (!this.activeRunId || !this.activeTurnId || !this.activeSessionId) return;

      this.eventBus.emitUserMessage({
        runId: this.activeRunId,
        turnId: this.activeTurnId,
        sessionId: this.activeSessionId,
        content,
        displayContent: input.displayContent ?? content,
      });

      this.steeringQueue.push(content);
      return;
    }
    const content = input.content.trim();
    if (!content) return;
    if (input.sessionId) await this.switchSession(input.sessionId);

    const session = this.ensureSession(content);
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
    const abortController = new AbortController();
 
    this.mode = input.mode;
    this.abortController = abortController;
    this.activeRunId = runId;
    this.activeTurnId = turnId;
    this.activeSessionId = session.id;
    this.steeringQueue = [];
 
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
        signal: abortController.signal,
        emit: this.eventBus.createEmitter(runId, session.id, turnId),
        getSteeringMessages: () => {
          const msgs = [...this.steeringQueue];
          this.steeringQueue = [];
          return msgs;
        },
      });
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
      this.finalizedRunIds.delete(runId);
      this.activeRunId = null;
      this.activeTurnId = null;
      this.activeSessionId = null;
      this.sessionManager.refreshSessions();
      this.notify();
    }
  }

  cancel(): void {
    const abortController = this.abortController;
    if (!abortController) return;
    abortController.abort();
    this.confirmRouter.cancelAll();
    this.finalizeActiveRun("Cancelled by user.");
    this.abortController = null;
    this.activeRunId = null;
    this.activeTurnId = null;
    this.activeSessionId = null;
    this.steeringQueue = [];
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

    this.eventStore.replaceEvents(session, result.events);
    this.sessionManager.refreshSessions();
    this.notify();
    return { handled: true, message: "Reverted last turn.", clearInput: true };
  }

  async compactCurrentSession(triggerMode: "manual" | "auto" = "manual"): Promise<void> {
    const session = this.sessionManager.currentSession();
    if (!session) return;
    const compactedEventCount = this.eventStore.events.length;
    if (compactedEventCount === 0) return;

    const summary = buildCompactionSummary(this.eventStore.events);
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

  private createToolContext(runId?: string, sessionId?: string, turnId?: string): ToolExecutionContext {
    const projectInstructions = loadProjectInstructions(this.workspace.rootPath);
    return {
      workspaceRoot: resolve(this.workspace.rootPath),
      mode: this.mode,
      abortSignal: this.abortController?.signal,
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
    };
  }

  private requestConfirmation(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      const runId = this.activeRunId ?? `run_${randomUUID()}`;
      const turnId = this.activeTurnId ?? undefined;
      const sessionId = this.activeSessionId ?? this.sessionManager.currentSession()?.id;
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
      const runId = this.activeRunId ?? `run_${randomUUID()}`;
      const turnId = this.activeTurnId ?? undefined;
      const sessionId = this.activeSessionId ?? this.sessionManager.currentSession()?.id;
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

  private finalizeActiveRun(reason: string): void {
    const runId = this.activeRunId;
    const turnId = this.activeTurnId;
    const sessionId = this.activeSessionId;
    if (!runId || !turnId || !sessionId) return;

    const incomplete = findIncompleteEvents(this.eventStore.events, runId, turnId);
    emitRunFinalization(incomplete, reason, this.eventBus.createEmitter(runId, sessionId, turnId));
    this.finalizedRunIds.add(runId);
  }

  private ensureSession(firstInput: string): Session {
    const current = this.sessionManager.currentSession();
    if (current) return current;
    const title = firstInput.length > 50 ? `${firstInput.slice(0, 47)}...` : firstInput;
    return this.createSession(title || "Untitled");
  }

  private updateSnapshot(): void {
    this.snapshot = projectHarnessState({
      events: this.eventStore.events,
      readModel: this.projectionCache.project(this.eventStore.events),
      isLoading: this.abortController !== null,
      sessions: this.sessionManager.sessions,
      currentSessionId: this.sessionManager.currentSessionId,
      workspace: this.workspace,
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
    }, 33);
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

