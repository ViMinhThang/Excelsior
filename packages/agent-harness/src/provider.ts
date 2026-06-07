import { createDeepSeek } from "@ai-sdk/deepseek";
import type { HarnessProvider, HarnessSettings } from "./types.js";

const DEEPSEEK_MODEL_ID = "deepseek-v4-flash";

export function createDeepSeekProvider(): HarnessProvider {
  return {
    id: "deepseek",
    displayName: "DeepSeek",
    modelId: DEEPSEEK_MODEL_ID,
    createModel(settings: HarnessSettings) {
      const apiKey = settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is not configured.");
      }
      return createDeepSeek({ apiKey })(DEEPSEEK_MODEL_ID);
    },
  };
}
