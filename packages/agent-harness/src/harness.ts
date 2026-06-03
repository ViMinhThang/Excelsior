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
  HISTORY_COMPACTED,
  TEXT_DELTA,
  USER_INPUT,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
  type HarnessEventType,
} from "./events.js";
import { runHarnessAgent } from "./agent.js";
import { createBuiltInCommands } from "./commands.js";
import { GitHubReviewService } from "./github.js";
import { createDeepSeekProvider } from "./provider.js";
import { projectEventsToMessages, projectHarnessState } from "./projection.js";
import { CommandRegistry, ExtensionRegistry, ProviderRegistry, ToolRegistry } from "./registries.js";
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
  return new FileBackedAgentHarness(config);
}

class FileBackedAgentHarness implements AgentHarness {
  private readonly storage: FileHarnessStorage;
  private readonly providers = new ProviderRegistry();
  private readonly tools = new ToolRegistry();
  private readonly commands = new CommandRegistry();
  private readonly extensions: ExtensionRegistry;
  private readonly listeners = new Set<() => void>();
  private readonly workspace: Workspace;
  private settings: HarnessSettings;
  private sessions: Session[] = [];
  private currentSessionId: string | null = null;
  private events: AnyHarnessEvent[] = [];
  private mode: AgentMode = "act";
  private abortController: AbortController | null = null;
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
    this.mode = input.mode;

    this.abortController = new AbortController();
    const runId = `run_${randomUUID()}`;
    const priorMessages = projectEventsToMessages(this.events);

    if (!input.silent) {
      this.emit(runId, USER_INPUT, { content: input.displayContent ?? content });
    }

    const messages = [
      ...priorMessages,
      { role: "user" as const, content },
    ];

    await runHarnessAgent({
      messages,
      mode: this.mode,
      settings: this.settings,
      providers: this.providers,
      tools: this.tools,
      toolContext: this.createToolContext(),
      signal: this.abortController.signal,
      emit: this.createEmitter(runId, session.id),
    });

    this.abortController = null;
    this.refreshSessions();
    this.notify();
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.notify();
  }

  clear(): void {
    const session = this.currentSession();
    if (session) {
      this.events = [];
      this.storage.replaceEvents(this.workspace.id, session, []);
    }
    this.notify();
  }

  createSession(title = "Untitled"): Session {
    const session = this.storage.createSession(this.workspace.id, title);
    this.currentSessionId = session.id;
    this.events = [];
    this.sequence = 0;
    this.refreshSessions();
    this.notify();
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
    this.notify();
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.storage.deleteSession(this.workspace.id, sessionId);
    this.refreshSessions();
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions[0]?.id ?? null;
      this.events = this.currentSessionId ? this.storage.loadEvents(this.workspace.id, this.currentSessionId) : [];
    }
    this.notify();
  }

  async deleteAllSessions(): Promise<void> {
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
    this.notify();
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
    const lastUserIndex = findLastUserInputIndex(this.events);
    if (lastUserIndex === -1) return { handled: true, message: "No completed turn to revert.", clearInput: true };
    this.events = this.events.slice(0, lastUserIndex);
    this.sequence = this.events.at(-1)?.sequence ?? 0;
    this.storage.replaceEvents(this.workspace.id, session, this.events);
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
    const event = this.emit(`run_${randomUUID()}`, HISTORY_COMPACTED, {
      summary,
      compactedEventCount,
      triggerMode,
    });
    this.emit(event.runId, TEXT_DELTA, { delta: `Previous conversation compacted:\n${summary}` });
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

  private createEmitter(runId: string, sessionId: string): HarnessEventEmitter {
    return (type, data, options) => this.emit(runId, type, data, {
      sessionId,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
    });
  }

  private emit<T extends HarnessEventType>(
    runId: string,
    type: T,
    data: HarnessEventDataMap[T],
    options?: { sessionId?: string; relatedToolCallId?: string; parentEventId?: string },
  ) {
    const session = this.currentSession() ?? this.ensureSession("Untitled");
    const sessionId = options?.sessionId ?? session.id;
    const event = makeHarnessEvent({
      runId,
      sessionId,
      sequence: ++this.sequence,
      type,
      data,
      relatedToolCallId: options?.relatedToolCallId,
      parentEventId: options?.parentEventId,
    });
    const storedEvent = event as AnyHarnessEvent;
    this.events = [...this.events, storedEvent];
    if (session) {
      const updated = this.storage.appendEvent(this.workspace.id, session, storedEvent);
      this.sessions = this.sessions.map((item) => item.id === updated.id ? updated : item);
    }
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
      this.pendingConfirmation = { callId, ...request };
      this.confirmationResolvers.set(callId, (response) => {
        this.confirmationResolvers.delete(callId);
        this.pendingConfirmation = null;
        this.notify();
        resolveResponse(response);
      });
      this.notify();
    });
  }

  private requestQuestion(input: Omit<AskQuestionRequest, "callId">): Promise<AskQuestionResponse> {
    return new Promise((resolveResponse) => {
      const callId = randomUUID();
      this.pendingQuestion = { callId, ...input };
      this.questionResolvers.set(callId, (response) => {
        this.questionResolvers.delete(callId);
        this.pendingQuestion = null;
        this.notify();
        resolveResponse(response);
      });
      this.notify();
    });
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

function findLastUserInputIndex(events: readonly AnyHarnessEvent[]): number {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index].type === USER_INPUT) return index;
  }
  return -1;
}
