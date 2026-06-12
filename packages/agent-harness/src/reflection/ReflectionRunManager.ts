import { randomUUID } from "node:crypto";
import type { AgentMessage, CommandResult, ReflectionClientState, Session, Workspace } from "@excelsior/core";
import {
  ERROR,
  MESSAGE_END,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventDataMap,
  type HarnessEventEmitter,
  type HarnessEventType,
} from "../events.js";
import { ProjectionCache } from "../projection.js";
import type { ProviderRegistry } from "../registries.js";
import { runAgentLoop } from "../run/RunController.js";
import type { FileHarnessStorage } from "../storage.js";
import type { SessionManager } from "../SessionManager.js";
import type { SettingsStore } from "../SettingsStore.js";
import type { HarnessSettings } from "../types.js";
import { ReflectionMemoryStore, type ReflectionMemoryState } from "./ReflectionMemoryStore.js";
import { buildReflectionPrompt } from "./prompt.js";
import { createReflectionToolRegistry } from "./tools.js";

export type ReflectionTrigger = "manual" | "auto";

const AUTO_REFLECTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_REFLECTION_MIN_UPDATED_SESSIONS = 5;
const RECENT_SESSION_LIMIT = 10;
const PER_SESSION_CHAR_LIMIT = 8_000;
const TOTAL_CORPUS_CHAR_LIMIT = 30_000;
const REFLECTION_TOOL_LOOP_STEPS = "12";

export function shouldStartAutoReflection(input: {
  enabled: boolean;
  isRunning: boolean;
  sessions: readonly Session[];
  memoryState: ReflectionMemoryState;
  now?: Date;
}): boolean {
  if (!input.enabled || input.isRunning) return false;

  const nowMs = (input.now ?? new Date()).getTime();
  const lastReflectedMs = input.memoryState.lastReflectedAt
    ? Date.parse(input.memoryState.lastReflectedAt)
    : undefined;
  const hasValidLastRun = lastReflectedMs !== undefined && !Number.isNaN(lastReflectedMs);

  if (hasValidLastRun && nowMs - lastReflectedMs < AUTO_REFLECTION_INTERVAL_MS) {
    return false;
  }

  const updatedSessionCount = input.sessions.filter((session) => {
    if (!hasValidLastRun) return true;
    const updatedAt = Date.parse(session.updatedAt);
    return !Number.isNaN(updatedAt) && updatedAt > lastReflectedMs;
  }).length;

  return updatedSessionCount >= AUTO_REFLECTION_MIN_UPDATED_SESSIONS;
}

export class ReflectionRunManager {
  private readonly store: ReflectionMemoryStore;
  private currentRun: { controller: AbortController; promise: Promise<void> } | null = null;
  private status: ReflectionClientState["status"] = "idle";
  private failedSummary: string | undefined;

  constructor(
    private readonly input: {
      workspace: Workspace;
      storage: FileHarnessStorage;
      sessionManager: SessionManager;
      settingsStore: SettingsStore;
      providers: ProviderRegistry;
      onChange: () => void;
    },
  ) {
    this.store = new ReflectionMemoryStore(input.storage.reflectionMemoryDirectory(input.workspace.id));
  }

  snapshot(): ReflectionClientState {
    return this.store.snapshot(this.status, this.failedSummary);
  }

  maybeStartAutoReflection(): void {
    if (!this.canStartAutoReflection()) return;
    void this.startReflection("auto");
  }

  canStartAutoReflection(now = new Date()): boolean {
    this.input.sessionManager.refreshSessions();
    return shouldStartAutoReflection({
      enabled: this.input.settingsStore.settings.autoReflectionEnabled,
      isRunning: Boolean(this.currentRun),
      sessions: this.input.sessionManager.sessions,
      memoryState: this.store.readState(),
      now,
    });
  }

  async startReflection(trigger: ReflectionTrigger): Promise<CommandResult> {
    if (this.currentRun) {
      return {
        handled: true,
        message: "Reflection is already running. Use /reflect status or /reflect stop.",
        clearInput: true,
      };
    }

    if (trigger === "auto" && !this.canStartAutoReflection()) {
      return { handled: true, message: "Auto reflection gate did not pass.", clearInput: true };
    }

    const controller = new AbortController();
    this.status = "running";
    this.failedSummary = undefined;

    const promise = this.runReflection(trigger, controller).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      this.status = "failed";
      this.failedSummary = error instanceof Error ? error.message : String(error);
    });
    this.currentRun = { controller, promise };
    this.input.onChange();

    void promise.finally(() => {
      if (this.currentRun?.promise === promise) {
        this.currentRun = null;
      }
      if (this.status === "running") {
        this.status = "idle";
      }
      this.input.onChange();
    });

    return {
      handled: true,
      message: `Reflection started (${trigger}). Memory root: ${this.store.rootDir}`,
      clearInput: true,
    };
  }

  cancelReflection(): void {
    if (!this.currentRun) return;
    this.currentRun.controller.abort();
    this.status = "idle";
    this.failedSummary = undefined;
    this.input.onChange();
  }

  private async runReflection(trigger: ReflectionTrigger, controller: AbortController): Promise<void> {
    const runId = `run_reflection_${randomUUID()}`;
    const turnId = `turn_reflection_${randomUUID()}`;
    const events: AnyHarnessEvent[] = [];
    const touchedFiles = new Set<string>();
    const corpus = this.buildSessionCorpus();
    const tools = createReflectionToolRegistry(this.store, (filePath) => touchedFiles.add(filePath));
    const settings: HarnessSettings = {
      ...this.input.settingsStore.settings,
      agentToolLoopSteps: REFLECTION_TOOL_LOOP_STEPS,
    };
    const prompt = buildReflectionPrompt({
      trigger,
      memoryRoot: this.store.rootDir,
      generatedAt: new Date().toISOString(),
      sessionCorpus: corpus.text,
    });

    await runAgentLoop({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: "You are Excelsior's private background reflection worker. Use only memory tools.",
      settings,
      providers: this.input.providers,
      tools,
      toolContext: {
        workspaceRoot: this.store.rootDir,
        mode: "act",
        abortSignal: controller.signal,
        settings,
        providers: this.input.providers,
        tools,
        confirm: async () => ({ callId: "reflection", approved: false }),
        askQuestion: async () => ({
          callId: "reflection",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
        sendSubAgent: async () => "Reflection runs cannot spawn sub-agents.",
      },
      signal: controller.signal,
      emit: this.createEmitter(runId, turnId, events),
    });

    if (controller.signal.aborted) {
      return;
    }

    const failure = events.find((event): event is Extract<AnyHarnessEvent, { type: typeof ERROR }> =>
      event.type === ERROR,
    );
    if (failure) {
      this.status = "failed";
      this.failedSummary = failure.data.message;
      return;
    }

    this.store.recordSuccess({
      reflectedAt: new Date().toISOString(),
      summary: extractReflectionSummary(events),
      touchedFiles: [...touchedFiles],
      reviewedSessionIds: corpus.sessionIds,
    });
    this.status = "idle";
  }

  private createEmitter(
    runId: string,
    turnId: string,
    events: AnyHarnessEvent[],
  ): HarnessEventEmitter {
    let sequence = 0;
    return <T extends HarnessEventType>(
      type: T,
      data: HarnessEventDataMap[T],
      options?: Parameters<HarnessEventEmitter>[2],
    ) => {
      const event = makeHarnessEvent({
        workspaceId: this.input.workspace.id,
        sessionId: "reflection",
        runId,
        turnId: options?.turnId ?? turnId,
        sequence: ++sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
        causationId: options?.causationId,
        correlationId: options?.correlationId,
      });
      events.push(event as AnyHarnessEvent);
      return event;
    };
  }

  private buildSessionCorpus(): { text: string; sessionIds: string[] } {
    this.input.sessionManager.refreshSessions();
    const blocks: string[] = [];
    const sessionIds: string[] = [];
    let totalChars = 0;

    const cache = new ProjectionCache();

    for (const session of this.input.sessionManager.sessions.slice(0, RECENT_SESSION_LIMIT)) {
      if (totalChars >= TOTAL_CORPUS_CHAR_LIMIT) break;

      cache.reset();
      const messages = cache.project(
        this.input.storage.loadEvents(this.input.workspace.id, session.id),
      ).aiHistory;
      if (messages.length === 0) continue;

      const transcript = messages.map(formatMessage).join("\n\n");
      const block = [
        `## ${session.title || "Untitled"} (${session.id})`,
        `Updated: ${session.updatedAt}`,
        "",
        clipText(transcript, PER_SESSION_CHAR_LIMIT),
      ].join("\n");
      const remaining = TOTAL_CORPUS_CHAR_LIMIT - totalChars;
      blocks.push(clipText(block, remaining));
      sessionIds.push(session.id);
      totalChars += Math.min(block.length, remaining);
    }

    return {
      text: blocks.join("\n\n---\n\n"),
      sessionIds,
    };
  }
}

function formatMessage(message: AgentMessage): string {
  return `${message.role.toUpperCase()}:\n${messageContentToText(message.content)}`;
}

function messageContentToText(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => part.text ?? JSON.stringify(part)).join("\n");
}

function clipText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 34))}\n[truncated for reflection context]`;
}

function extractReflectionSummary(events: readonly AnyHarnessEvent[]): string {
  const summaries = events
    .filter((event): event is Extract<AnyHarnessEvent, { type: typeof MESSAGE_END }> =>
      event.type === MESSAGE_END && event.data.message.role === "assistant",
    )
    .map((event) => event.data.message.content.trim())
    .filter(Boolean);
  const summary = summaries.at(-1) ?? "Reflection completed.";
  return clipText(summary, 1_000);
}
