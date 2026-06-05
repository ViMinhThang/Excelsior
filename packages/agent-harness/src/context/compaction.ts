import { generateText } from "ai";
import { projectEventsToMessages } from "../projection.js";
import type { AnyHarnessEvent } from "../events.js";
import type { ProviderRegistry } from "../registries.js";
import type { HarnessSettings } from "../types.js";

export interface CompactionSummaryOptions {
  providers?: ProviderRegistry;
  settings?: HarnessSettings;
  customPrompt?: string;
}

export async function buildCompactionSummary(
  events: readonly AnyHarnessEvent[],
  options: CompactionSummaryOptions = {},
): Promise<string> {
  const localHistoryText = projectEventsToMessages(events)
    .map((message) => `${message.role.toUpperCase()}: ${typeof message.content === "string" ? message.content : ""}`)
    .join("\n");

  const providers = options.providers;
  const settings = options.settings;
  if (providers && settings) {
    try {
      const model = providers.get().createModel(settings);
      const system = options.customPrompt ?? "Summarize the key achievements, choices made, and current state of the conversation below in a clear and concise summary:";
      const result = await generateText({
        model,
        system,
        prompt: localHistoryText,
      });
      if (result.text.trim()) {
        return result.text.trim();
      }
    } catch (err) {
      // Fallback to local history slicing on error
    }
  }

  return localHistoryText;
}

export function buildCompactionNotice(summary: string): string {
  return `Previous conversation compacted:\n${summary}`;
}
