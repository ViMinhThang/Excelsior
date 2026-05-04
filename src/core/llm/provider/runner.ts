import { generateText, type LanguageModel } from "ai";

import { getTools } from "../../../tools/index.js";
import { normalizeProviderError } from "../errors.js";
import type { CallOptions } from "./options.js";

export async function runTurn(args: {
  model: LanguageModel;
  systemPrompt: string;
  prompt: string;
  cwd: string;
  options: CallOptions;
  maxSteps?: number;
  tools?: string[] | undefined;
  signal?: AbortSignal | undefined;
  supportsTools: boolean;
}): Promise<string> {
  const { model, systemPrompt, prompt, cwd, options, maxSteps = 5, tools, signal, supportsTools } = args;

  try {
    const abortSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(options.timeout)])
      : AbortSignal.timeout(options.timeout);

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      tools: supportsTools ? getTools(cwd, tools) : undefined,
      maxSteps: supportsTools ? maxSteps : 1,
      abortSignal,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.topP !== undefined && { topP: options.topP }),
      ...(options.maxOutputTokens !== undefined && { maxOutputTokens: options.maxOutputTokens }),
      ...(options.maxRetries !== undefined && { maxRetries: options.maxRetries }),
      ...(Object.keys(options.providerOptions).length > 0 && { providerOptions: options.providerOptions }),
    } as any);

    return text.trim();
  } catch (error) {
    throw normalizeProviderError(error);
  }
}
