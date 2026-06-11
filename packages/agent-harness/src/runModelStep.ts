import {
  stepCountIs,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import type { AgentMessage } from "@excelsior/core";
import { RunEventWriter } from "./context/RunEventWriter.js";
import { toModelMessages } from "./context/index.js";
import type { HarnessEventEmitter } from "./events.js";
import type { ProviderRegistry, ToolRegistry } from "./registries.js";
import type {
  HarnessSettings,
  ToolExecutionContext,
} from "./types.js";
import {
  RunStepRecorder,
  stringifyError,
  type RunStepResult,
} from "./runStepRecorder.js";

export async function runModelStep(input: {
  messages: readonly AgentMessage[];
  systemPrompt: string;
  settings: HarnessSettings;
  providers: ProviderRegistry;
  tools: ToolRegistry;
  toolContext: ToolExecutionContext;
  signal: AbortSignal;
  emit: HarnessEventEmitter;
  writer: RunEventWriter;
  runPrefix: string;
}): Promise<RunStepResult> {
  const recorder = new RunStepRecorder({
    emit: input.emit,
    writer: input.writer,
    messageIdForTextPart: (partId) => `msg_${input.runPrefix}_${partId}`,
  });

  try {
    if (input.signal.aborted) {
      recorder.cancel();
      return recorder.finish();
    }

    const model = input.providers.get().createModel(input.settings);
    const result = streamText({
      model,
      system: input.systemPrompt,
      messages: toModelMessages(input.messages),
      tools: input.tools.toToolSet(input.toolContext),
      stopWhen: stepCountIs(1),
      abortSignal: input.signal,
      maxRetries: 3,
    });

    for await (const part of result.fullStream as AsyncIterable<TextStreamPart<ToolSet>>) {
      if (input.signal.aborted) {
        recorder.cancel();
        break;
      }
      recorder.accept(part);
      if (part.type === "abort" || part.type === "error") break;
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === "AbortError" || input.signal.aborted) {
      recorder.cancel();
    } else {
      recorder.fail(stringifyError(err));
    }
  }

  return recorder.finish();
}
