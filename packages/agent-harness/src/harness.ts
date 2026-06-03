import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
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
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  QUESTION_ANSWERED,
  QUESTION_REQUESTED,
  SESSION_CHANGED,
  TURN_END,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
  type HarnessEventType,
} from "./events.js";
import { createBuiltInCommands } from "./commands.js";
import { GitHubReviewService } from "./github.js";
import { createDeepSeekProvider } from "./provider.js";
import { projectEventsToMessages, projectHarnessState } from "./projection.js";
import { CommandRegistry, ExtensionRegistry, ProviderRegistry, ToolRegistry } from "./registries.js";
import { RunController } from "./runController.js";
import { FileHarnessStorage } from "./storage.js";
import { createBuiltInTools } from "./tools.js";
import type {
  AgentHarness,
  HarnessCatalog,
  HarnessCommand,
  HarnessConfig,
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
  private settings: HarnessSettings;
  private sessions: Session[] = [];
  private currentSessionId: string | null = null;
  private events: AnyHarnessEvent[] = [];
  private mode: AgentMode = "act";
  private abortController: AbortController | null = null;
  private activeRunId: string | null = null;
  private activeTurnId: string | null = null;
  private activeSessionId: string | null = null;
  private sequence = 0;
  private pendingConfirmation: ConfirmRequest | null = null;
  private pendingQuestion: AskQuestionRequest | null = null;
  private confirmationResolvers = new Map<string, (response: ConfirmResponse) => void>();
  private questionResolvers = new Map<string, (response: AskQuestionResponse) => void>();

  constructor(config: HarnessConfig) {
    this.storage = new FileHarnessStorage(config.dataDir);
    this.workspace = this.storage.getOrCreateWorkspace({
      id: config.workspaceId,
      rootPath: config.workspaceRoot,
    });
    this.settings = this.storage.loadSettings();
    this.extensions = new ExtensionRegistry(this.providers, this.tools, this.commands);

    this.providers.register(createDeepSeekProvider());
    for (const tool of createBuiltInTools()) this.tools.register(tool);
    for (const command of this.createCommands(config)) this.commands.register(command);
    this.extensions.load(config.extensions ?? []);

    this.refreshSessions();
    if (this.sessions[0]) {
      this.currentSessionId = this.sessions[0].id;
      this.events = this.storage.loadEvents(this.workspace.id, this.currentSessionId);
      this.sequence = this.events.at(-1)?.sequence ?? 0;
    }
  }

  getSnapshot(): HarnessSnapshot {
    return projectHarnessState({
      events: this.events,
      isLoading: this.abortController !== null,
      sessions: this.sessions,
      currentSessionId: this.currentSessionId,
      workspace: this.workspace,
      mode: this.mode,
      pendingConfirmation: this.pendingConfirmation,
      pendingQuestion: this.pendingQuestion,
    });
  }

  getCatalog(): HarnessCatalog {
    return {
      commands: this.commands.list(),
      settings: this.settings,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async send(input: { content: string; mode: AgentMode; sessionId?: string; displayContent?: string; silent?: boolean }): Promise<void> {
    if (this.abortController) return;
    const content = input.content.trim();
    if (!content) return;
    if (input.sessionId) await this.switchSession(input.sessionId);

    const session = this.ensureSession(content);
    const priorMessages = projectEventsToMessages(this.events);
    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    const abortController = new AbortController();

    this.mode = input.mode;
    this.abortController = abortController;
    this.activeRunId = runId;
    this.activeTurnId = turnId;
    this.activeSessionId = session.id;

    if (!input.silent) {
      this.emitUserMessage({
        runId,
        turnId,
        sessionId: session.id,
        content,
        displayContent: input.displayContent ?? content,
      });
    }

    try {
      await this.runController.run({
        messages: [
          ...priorMessages,
          { role: "user", content },
        ],
        mode: this.mode,
        settings: this.settings,
        providers: this.providers,
        tools: this.tools,
        toolContext: this.createToolContext(),
        signal: abortController.signal,
        emit: this.createEmitter(runId, session.id, turnId),
      });
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
      this.activeRunId = null;
      this.activeTurnId = null;
      this.activeSessionId = null;
      this.refreshSessions();
      this.notify();
    }
  }

  cancel(): void {
    if (!this.abortController) return;
    this.abortController.abort();
    this.cancelPendingInteractions();
    this.notify();
  }

  clear(): void {
    const session = this.currentSession();
    if (!session) return;
    this.events = [];
    this.sequence = 0;
    this.storage.replaceEvents(this.workspace.id, session, []);
    this.notify();
  }

  createSession(title = "Untitled"): Session {
    this.cancel();
    const session = this.storage.createSession(this.workspace.id, title);
    this.currentSessionId = session.id;
    this.events = [];
    this.sequence = 0;
    this.refreshSessions();
    this.emitSystemEvent(SESSION_CHANGED, {
      sessionId: session.id,
      reason: "created",
    });
    return session;
  }

  async switchSession(sessionId: string): Promise<void> {
    this.cancel();
    const loaded = this.storage.loadSessionFile(this.workspace.id, sessionId);
    if (!loaded.session) return;
    this.currentSessionId = sessionId;
    this.events = loaded.events ?? [];
    this.sequence = this.events.at(-1)?.sequence ?? 0;
    this.refreshSessions();
    this.emitSystemEvent(SESSION_CHANGED, {
      sessionId,
      reason: "switched",
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.cancel();
    this.storage.deleteSession(this.workspace.id, sessionId);
    this.refreshSessions();
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions[0]?.id ?? null;
      this.events = this.currentSessionId
        ? this.storage.loadEvents(this.workspace.id, this.currentSessionId)
        : [];
      this.sequence = this.events.at(-1)?.sequence ?? 0;
    }
    if (this.currentSessionId) {
      this.emitSystemEvent(SESSION_CHANGED, {
        sessionId: this.currentSessionId,
        reason: "deleted",
      });
    } else {
      this.notify();
    }
  }

  async deleteAllSessions(): Promise<void> {
    this.cancel();
    this.storage.deleteAllSessions(this.workspace.id);
    this.currentSessionId = null;
    this.events = [];
    this.sequence = 0;
    this.refreshSessions();
    this.notify();
  }

  renameSession(sessionId: string, title: string): void {
    this.storage.renameSession(this.workspace.id, sessionId, title);
    this.refreshSessions();
    if (this.currentSessionId === sessionId) {
      this.emitSystemEvent(SESSION_CHANGED, {
        sessionId,
        reason: "renamed",
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
    this.settings = this.storage.saveSettings(settings);
    this.notify();
  }

  respondToConfirmation(callId: string, approved: boolean): void {
    this.confirmationResolvers.get(callId)?.({ callId, approved });
  }

  respondToQuestion(response: AskQuestionResponse): void {
    this.questionResolvers.get(response.callId)?.(response);
  }

  async revertLastTurn(): Promise<CommandResult> {
    const session = this.currentSession();
    if (!session) return { handled: true, message: "No active session.", clearInput: true };

    const lastTurnEnd = findLastCompletedTurnEnd(this.events);
    if (!lastTurnEnd?.turnId) {
      return { handled: true, message: "No completed turn to revert.", clearInput: true };
    }

    const turnStartIndex = this.events.findIndex((event) => event.turnId === lastTurnEnd.turnId);
    if (turnStartIndex === -1) {
      return { handled: true, message: "No completed turn to revert.", clearInput: true };
    }

    this.events = this.events.slice(0, turnStartIndex);
    this.sequence = this.events.at(-1)?.sequence ?? 0;
    this.storage.replaceEvents(this.workspace.id, session, this.events);
    this.refreshSessions();
    this.notify();
    return { handled: true, message: "Reverted last turn.", clearInput: true };
  }

  async compactCurrentSession(triggerMode: "manual" | "auto" = "manual"): Promise<void> {
    const session = this.currentSession();
    if (!session) return;
    const compactedEventCount = this.events.length;
    if (compactedEventCount === 0) return;

    const summary = projectEventsToMessages(this.events)
      .map((message) => `${message.role.toUpperCase()}: ${typeof message.content === "string" ? message.content : ""}`)
      .join("\n")
      .slice(-4000);

    this.events = [];
    this.sequence = 0;
    this.storage.replaceEvents(this.workspace.id, session, []);

    const runId = `run_${randomUUID()}`;
    const turnId = `turn_${randomUUID()}`;
    this.emit(runId, HISTORY_COMPACTED, {
      summary,
      compactedEventCount,
      triggerMode,
    }, { sessionId: session.id, turnId });
    this.emitAssistantMessage(runId, turnId, session.id, `Previous conversation compacted:\n${summary}`);
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
    this.listeners.clear();
  }

  private createCommands(config: HarnessConfig): HarnessCommand[] {
    const reviewServices = config.reviewServices ?? new GitHubReviewService(() => {
      const token = this.settings.githubToken || process.env.GITHUB_TOKEN;
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

  private createEmitter(runId: string, sessionId: string, turnId: string): HarnessEventEmitter {
    return (type, data, options) => this.emit(runId, type, data, {
      sessionId,
      turnId: options?.turnId ?? turnId,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
    });
  }

  private emitUserMessage(input: {
    runId: string;
    turnId: string;
    sessionId: string;
    content: string;
    displayContent: string;
  }): void {
    const message = {
      id: `msg_${randomUUID()}`,
      role: "user" as const,
      content: input.displayContent,
      modelContent: input.content,
    };
    this.emit(input.runId, MESSAGE_START, { message }, {
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    this.emit(input.runId, MESSAGE_END, { message }, {
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
  }

  private emitAssistantMessage(runId: string, turnId: string, sessionId: string, content: string): void {
    const message = {
      id: `msg_${randomUUID()}`,
      role: "assistant" as const,
      content,
    };
    this.emit(runId, MESSAGE_START, { message }, { sessionId, turnId });
    this.emit(runId, MESSAGE_UPDATE, {
      messageId: message.id,
      role: "assistant",
      delta: content,
      content,
    }, { sessionId, turnId });
    this.emit(runId, MESSAGE_END, { message }, { sessionId, turnId });
  }

  private emitSystemEvent<T extends HarnessEventType>(
    type: T,
    data: HarnessEventDataMap[T],
  ): void {
    const session = this.currentSession();
    if (!session) {
      this.notify();
      return;
    }
    this.emit(`run_${randomUUID()}`, type, data, {
      sessionId: session.id,
    });
  }

  private emit<T extends HarnessEventType>(
    runId: string,
    type: T,
    data: HarnessEventDataMap[T],
    options?: {
      sessionId?: string;
      turnId?: string;
      relatedToolCallId?: string;
      parentEventId?: string;
    },
  ) {
    const session = options?.sessionId
      ? this.sessions.find((item) => item.id === options.sessionId)
      : this.currentSession();
    const targetSession = session ?? this.ensureSession("Untitled");
    const event = makeHarnessEvent({
      workspaceId: this.workspace.id,
      sessionId: options?.sessionId ?? targetSession.id,
      runId,
      turnId: options?.turnId,
      sequence: ++this.sequence,
      type,
      data,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
    });
    const storedEvent = event as AnyHarnessEvent;
    if (targetSession.id === this.currentSessionId) {
      this.events = [...this.events, storedEvent];
    }
    const updated = this.storage.appendEvent(this.workspace.id, targetSession, storedEvent);
    this.sessions = this.sessions.map((item) => item.id === updated.id ? updated : item);
    this.extensions.emit(storedEvent);
    this.notify();
    return event;
  }

  private createToolContext(): ToolExecutionContext {
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
    };
  }

  private requestConfirmation(request: Omit<ConfirmRequest, "callId">): Promise<ConfirmResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      const runId = this.activeRunId ?? `run_${randomUUID()}`;
      const turnId = this.activeTurnId ?? undefined;
      const sessionId = this.activeSessionId ?? this.currentSession()?.id;
      const confirmRequest = { callId, ...request };
      this.pendingConfirmation = confirmRequest;
      this.confirmationResolvers.set(callId, (response) => {
        this.confirmationResolvers.delete(callId);
        this.pendingConfirmation = null;
        if (sessionId) {
          this.emit(runId, CONFIRMATION_ANSWERED, { response }, { sessionId, turnId });
        }
        resolveResponse(response);
        this.notify();
      });
      if (sessionId) {
        this.emit(runId, CONFIRMATION_REQUESTED, { request: confirmRequest }, { sessionId, turnId });
      }
      this.notify();
    });
  }

  private requestQuestion(input: Omit<AskQuestionRequest, "callId">): Promise<AskQuestionResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      const runId = this.activeRunId ?? `run_${randomUUID()}`;
      const turnId = this.activeTurnId ?? undefined;
      const sessionId = this.activeSessionId ?? this.currentSession()?.id;
      const request = { callId, ...input };
      this.pendingQuestion = request;
      this.questionResolvers.set(callId, (response) => {
        this.questionResolvers.delete(callId);
        this.pendingQuestion = null;
        if (sessionId) {
          this.emit(runId, QUESTION_ANSWERED, { response }, { sessionId, turnId });
        }
        resolveResponse(response);
        this.notify();
      });
      if (sessionId) {
        this.emit(runId, QUESTION_REQUESTED, { request }, { sessionId, turnId });
      }
      this.notify();
    });
  }

  private cancelPendingInteractions(): void {
    if (this.pendingConfirmation) {
      const request = this.pendingConfirmation;
      this.respondToConfirmation(request.callId, false);
    }
    if (this.pendingQuestion) {
      const request = this.pendingQuestion;
      this.respondToQuestion({
        callId: request.callId,
        answer: "",
        isManual: true,
        cancelled: true,
      });
    }
  }

  private ensureSession(firstInput: string): Session {
    const current = this.currentSession();
    if (current) return current;
    const title = firstInput.length > 50 ? `${firstInput.slice(0, 47)}...` : firstInput;
    return this.createSession(title || "Untitled");
  }

  private currentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.find((session) => session.id === this.currentSessionId) ?? null;
  }

  private refreshSessions(): void {
    this.sessions = this.storage.listSessions(this.workspace.id);
  }

  private notify(): void {
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

function findLastCompletedTurnEnd(events: readonly AnyHarnessEvent[]): AnyHarnessEvent | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type === TURN_END && !event.data.cancelled) return event;
  }
  return null;
}
