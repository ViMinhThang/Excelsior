import { createDeepSeek } from "@ai-sdk/deepseek";
import type { HarnessProvider, HarnessSettings } from "./types.js";

export function createDeepSeekProvider(): HarnessProvider {
  return {
    id: "deepseek",
    displayName: "DeepSeek",
    createModel(settings: HarnessSettings) {
      const apiKey = settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is not configured.");
      }
      return createDeepSeek({ apiKey })("deepseek-v4-flash");
    },
  };
}
