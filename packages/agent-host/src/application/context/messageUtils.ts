import type { AgentMessage } from "@excelsior/core";

/**
 * Normalizes message content into a standard plain-text string.
 * Handles both string and array-of-parts representations.
 */
export function normalizeMessageContent(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => part.text)
      .filter((text) => typeof text === "string" && text.length > 0)
      .join("\n");
  }
  return content ? String(content) : "";
}
