/**
 * runAgentLoop orchestrates the step-by-step agent execution loop.
 *
 * Lifecycle and Execution Flow:
 * 1. Emits `TURN_START` to initialize the run context and hierarchy boundaries.
 * 2. Runs one model step at a time through `runModelStep`.
 * 3. Appends the step's assistant/tool messages to the active conversation.
 * 4. Drains steering messages between tool-loop steps.
 * 5. Stops when the model has no tool calls, a step ends early, or the configured loop limit is reached.
 * 6. Emits `TURN_END`.
 */
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@excelsior/core";
import {
  normalizeAgentToolLoopSteps,
} from "@excelsior/core";
import {
  TURN_END,
  TURN_START,
  type HarnessEventEmitter,
} from "../events.js";
import { RunEventWriter } from "../context/RunEventWriter.js";
import { runModelStep } from "./runModelStep.js";
import type { ProviderRegistry, ToolRegistry } from "../registries.js";
import type {
  HarnessSettings,
  ToolExecutionContext,
} from "../types.js";

export async function runAgentLoop(input: {
  messages: readonly AgentMessage[];
  systemPrompt: string;
  settings: HarnessSettings;
  providers: ProviderRegistry;
  tools: ToolRegistry;
  toolContext: ToolExecutionContext;
  signal: AbortSignal;
  emit: HarnessEventEmitter;
  getSteeringMessages?: () => string[];
}): Promise<void> {
  input.emit(TURN_START, {});

  let endedEarly = false;
  const runPrefix = randomUUID().slice(0, 8);
  const writer = new RunEventWriter(input.emit);

  const stepLimit = resolveStepLimit(input.settings.agentToolLoopSteps);

  let activeMessages = [...input.messages];
  let stepCount = 0;

  while (true) {
    const step = await runModelStep({
      messages: activeMessages,
      systemPrompt: input.systemPrompt,
      settings: input.settings,
      providers: input.providers,
      tools: input.tools,
      toolContext: input.toolContext,
      signal: input.signal,
      emit: input.emit,
      writer,
      runPrefix,
    });

    activeMessages.push(...step.messages);

    if (step.status !== "completed") {
      endedEarly = true;
      break;
    }

    activeMessages.push(...drainSteeringMessages(input.getSteeringMessages));

    if (!step.hasToolCalls) {
      break;
    }

    stepCount++;
    if (stepLimit !== undefined && stepCount >= stepLimit) {
      writer.emitNotice(
        `Agent stopped after reaching the configured ${stepLimit}-step tool-loop limit.`,
      );
      break;
    }
  }

  const endState = { cancelled: endedEarly };
  input.emit(TURN_END, endState);
}

function resolveStepLimit(rawSteps: HarnessSettings["agentToolLoopSteps"]): number | undefined {
  const normalizedSteps = normalizeAgentToolLoopSteps(rawSteps);
  if (normalizedSteps === "unlimited") return undefined;
  const parsed = Number(normalizedSteps);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function drainSteeringMessages(getSteeringMessages?: () => string[]): AgentMessage[] {
  if (!getSteeringMessages) return [];
  return getSteeringMessages().map((content) => ({
    role: "user",
    content,
  }));
}
