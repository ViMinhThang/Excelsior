import type { AgentMessage } from "@excelsior/core";
import { getSetting } from "@excelsior/agent-storage";
import { makeEvent, type AnyAgentEvent } from "../../runtime/events.js";
import { HISTORY_COMPACTED } from "../../runtime/eventNames.js";
import { estimateTokens } from "./tokenizer.js";
import { runLocalCompaction } from "./compactor.js";

export type CompactionTriggerMode = "manual" | "auto";

type SettingsReader = (name: string) => string | null | undefined;

export interface AutoCompactionDecision {
  enabled: boolean;
  estimatedTokens: number;
  limit: number;
  scope: string;
  shouldCompact: boolean;
}

export interface MaybeAutoCompactConversationOptions {
  getHistory: () => readonly AgentMessage[];
  setLoading: (isLoading: boolean) => void;
  compactCurrentSession?: (triggerMode: CompactionTriggerMode) => Promise<void>;
  readSetting?: SettingsReader;
}

export interface CompactProjectedConversationOptions {
  sessionId: string | null;
  history: readonly AgentMessage[];
  persistedEventCount: number;
  triggerMode: CompactionTriggerMode;
  activeRunId?: string;
  recordEvent: (sessionId: string, event: AnyAgentEvent) => Promise<void>;
  reloadCurrentSessionEvents: () => Promise<void>;
  createRunId?: () => string;
}

export function evaluateAutoCompaction(
  history: readonly AgentMessage[],
  readSetting: SettingsReader = getSetting,
): AutoCompactionDecision {
  const enabled = readSetting("AUTO_COMPACT_ENABLED") !== "false";
  const limitStr = readSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT");
  const limit = limitStr ? parseInt(limitStr, 10) : 253_000;
  const scope = readSetting("MODEL_AUTO_COMPACT_TOKEN_LIMIT_SCOPE") || "Total";

  if (!enabled || history.length === 0) {
    return {
      enabled,
      estimatedTokens: 0,
      limit,
      scope,
      shouldCompact: false,
    };
  }

  const messagesForScope = getMessagesForScope(history, scope);
  const totalText = messagesForScope.map(messageToText).join("\n");
  const estimatedTokens = estimateTokens(totalText);

  return {
    enabled,
    estimatedTokens,
    limit,
    scope,
    shouldCompact: estimatedTokens > limit,
  };
}

export async function maybeAutoCompactConversation({
  getHistory,
  setLoading,
  compactCurrentSession,
  readSetting = getSetting,
}: MaybeAutoCompactConversationOptions): Promise<void> {
  const decision = evaluateAutoCompaction(getHistory(), readSetting);
  if (!decision.shouldCompact) return;

  setLoading(true);
  try {
    if (compactCurrentSession) {
      await compactCurrentSession("auto");
    }
  } finally {
    setLoading(false);
  }
}

export async function compactProjectedConversation({
  sessionId,
  history,
  persistedEventCount,
  triggerMode,
  activeRunId,
  recordEvent,
  reloadCurrentSessionEvents,
  createRunId = () => `run_${Date.now()}`,
}: CompactProjectedConversationOptions): Promise<void> {
  if (!sessionId || history.length === 0) return;

  const summary = await runLocalCompaction(history);
  const event = makeEvent(activeRunId || createRunId(), HISTORY_COMPACTED, {
    summary,
    compactedEventCount: persistedEventCount,
    triggerMode,
  }, persistedEventCount + 1);

  await recordEvent(sessionId, event as AnyAgentEvent);
  await reloadCurrentSessionEvents();
}

function getMessagesForScope(
  history: readonly AgentMessage[],
  scope: string,
): readonly AgentMessage[] {
  if (scope !== "BodyAfterPrefix") return history;

  const firstNonSystemIndex = history.findIndex((msg) => msg.role !== "system");
  if (firstNonSystemIndex === -1) return history;
  return history.slice(firstNonSystemIndex);
}

function messageToText(message: AgentMessage): string {
  return typeof message.content === "string"
    ? message.content
    : message.content.map((part) => part.text).join("\n");
}
