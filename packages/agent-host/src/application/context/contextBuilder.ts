import type { AgentMessage } from "@excelsior/core";

export interface ContextBuilderOptions {
  recentMessageCount?: number;
  normalMessageCharLimit?: number;
  toolMessageCharLimit?: number;
  compactedHistoryCharLimit?: number;
  compactedEntryCharLimit?: number;
}

export const DEFAULT_CONTEXT_BUILDER_OPTIONS = {
  recentMessageCount: 16,
  normalMessageCharLimit: 12_000,
  toolMessageCharLimit: 6_000,
  compactedHistoryCharLimit: 12_000,
  compactedEntryCharLimit: 1_000,
} as const;

type ResolvedContextBuilderOptions = Required<ContextBuilderOptions>;

export function buildContextMessages(
  history: readonly AgentMessage[],
  currentUserContent: string,
  options: ContextBuilderOptions = {},
): AgentMessage[] {
  const config = resolveOptions(options);
  const recentStart = Math.max(0, history.length - config.recentMessageCount);
  const olderMessages = history.slice(0, recentStart);
  const recentMessages = history
    .slice(recentStart)
    .map((message) => compactMessage(message, config));

  return [
    ...(olderMessages.length > 0
      ? [buildCompactedHistoryMessage(olderMessages, config)]
      : []),
    ...recentMessages,
    { role: "user", content: currentUserContent },
  ];
}

function resolveOptions(
  options: ContextBuilderOptions,
): ResolvedContextBuilderOptions {
  return {
    ...DEFAULT_CONTEXT_BUILDER_OPTIONS,
    ...options,
  };
}

function compactMessage(
  message: AgentMessage,
  options: ResolvedContextBuilderOptions,
): AgentMessage {
  const content = normalizeContent(message.content);
  const limit = isToolContextMessage(message, content)
    ? options.toolMessageCharLimit
    : options.normalMessageCharLimit;

  return {
    ...message,
    content: truncateMiddle(content, limit),
  };
}

function buildCompactedHistoryMessage(
  messages: readonly AgentMessage[],
  options: ResolvedContextBuilderOptions,
): AgentMessage {
  const entries = messages.map((message, index) => {
    const content = normalizeContent(message.content);
    const label = isToolContextMessage(message, content)
      ? "TOOL_RESULT"
      : message.role.toUpperCase();
    return [
      `${index + 1}. ${label}`,
      truncateMiddle(content, options.compactedEntryCharLimit),
    ].join("\n");
  });

  const content = [
    "Previous conversation compacted for context.",
    "Older messages are preserved below as chronological role-labeled excerpts.",
    "",
    ...entries,
  ].join("\n\n");

  return {
    role: "system",
    content: truncateMiddle(content, options.compactedHistoryCharLimit),
  };
}

function normalizeContent(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;

  const text = content
    .map((part) => part.text)
    .filter((part) => part.length > 0)
    .join("\n");

  if (text) return text;

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function isToolContextMessage(message: AgentMessage, content: string): boolean {
  return message.role === "tool" || content.startsWith("[Tool:");
}

function truncateMiddle(content: string, limit: number): string {
  if (content.length <= limit) return content;
  if (limit <= 0) return "";

  let marker = "\n[... omitted content ...]\n";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const available = Math.max(0, limit - marker.length);
    const headLength = Math.ceil(available / 2);
    const tailLength = Math.floor(available / 2);
    const omitted = content.length - headLength - tailLength;
    const nextMarker = `\n[... omitted ${omitted} characters ...]\n`;

    if (nextMarker.length === marker.length) {
      return [
        content.slice(0, headLength),
        nextMarker,
        tailLength > 0 ? content.slice(-tailLength) : "",
      ].join("");
    }

    marker = nextMarker;
  }

  const available = Math.max(0, limit - marker.length);
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return [
    content.slice(0, headLength),
    marker,
    tailLength > 0 ? content.slice(-tailLength) : "",
  ].join("");
}
