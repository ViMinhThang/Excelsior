import { generateText } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { getSetting } from "@excelsior/agent-storage";
import { AgentMessage } from "@excelsior/core";
import { normalizeMessageContent } from "./messageUtils.js";

export const SUMMARIZATION_PROMPT = `You are a conversation summarizer. 
Analyze the conversation history provided below and produce a highly dense, chronological, bullet-point summary of the user's intent, the key decisions/milestones achieved, and the current state of the workspace.
Keep the summary under 500 words. Focus strictly on facts and actionable context. 
Do not include any boilerplate introductory or concluding remarks. Just provide the summary.`;

/**
 * Filter out stale developer/system messages that shouldn't be included in the summarization.
 */
export function shouldKeepCompactedHistoryItem(message: AgentMessage): boolean {
  if (message.role === "system") {
    // Retain previous summaries if they exist, but drop transient instructions / templates.
    return typeof message.content === "string" && message.content.includes("Previous conversation compacted");
  }
  return true;
}

/**
 * Executes a local LLM compaction step to summarize the conversation history.
 */
export async function runLocalCompaction(
  history: readonly AgentMessage[],
  options?: { apiKey?: string },
): Promise<string> {
  const apiKey = options?.apiKey || getSetting("DEEPSEEK_API_KEY") || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  const deepseek = createDeepSeek({ apiKey });
  const model = deepseek("deepseek-v4-flash");

  const messagesToSummarize = history.filter(shouldKeepCompactedHistoryItem);

  const formattedHistory = messagesToSummarize
    .map((msg) => `${msg.role.toUpperCase()}: ${normalizeMessageContent(msg.content)}`)
    .join("\n\n");

  const response = await generateText({
    model,
    prompt: `${SUMMARIZATION_PROMPT}\n\nCONVERSATION HISTORY:\n\n${formattedHistory}`,
  });

  return response.text.trim();
}
