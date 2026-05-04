import { generateText, type LanguageModel } from "ai";

import { getTools } from "../../../tools/index.js";
import { normalizeProviderError } from "../errors.js";
import type { CallOptions } from "./options.js";

interface RunnerArgs {
  model: LanguageModel;
  systemPrompt: string;
  prompt: string;
  cwd: string;
  options: CallOptions;
  maxSteps?: number;
  tools?: string[];
  signal?: AbortSignal;
  supportsTools: boolean;
}

export async function runTurn(args: RunnerArgs): Promise<string> {
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
      temperature: options.temperature,
      topP: options.topP,
      maxOutputTokens: options.maxOutputTokens,
      maxRetries: options.maxRetries,
      providerOptions: options.providerOptions,
    } as any);

    return text.trim();
  } catch (error) {
    throw normalizeProviderError(error);
  }
}
