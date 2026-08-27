import { randomUUID } from "node:crypto";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { stepCountIs, streamText, tool as aiTool, type TextStreamPart, type ToolSet } from "ai";
import { normalizeAgentToolLoopSteps, type AgentMessage, type SendOptions } from "@excelsior/protocol";
import { buildAiHistory } from "./aiHistory.js";
import type { CapabilityContextFactory } from "./capabilities.js";
import type { MetaState, Mutate } from "./mutate.js";
import { toModelMessages } from "./modelMessages.js";
import type { RunStore } from "./runStore.js";
import type { SessionStore } from "./sessionStore.js";
import { TOOL_DEFINITIONS, type ToolDefinition } from "./tools.js";

const DEFAULT_MAX_STEPS = 100;
const DEFAULT_MAX_RETRIES = 2;

export interface TurnExecutor {
  start(content: string, options?: SendOptions): void;
  abort(turnId: string): void;
}

interface ExecutorDeps {
  store: SessionStore;
  runStore: RunStore;
  meta: MetaState;
  mutate: Mutate;
  capabilityFactory: CapabilityContextFactory;
  emitError(message: string): void;
}

function systemPrompt(rootPath: string, mode: string): string {
  return [
    "You are Excelsior, a local coding agent running inside the workspace.",
    `Workspace root: ${rootPath}`,
    `Current mode: ${mode}. In plan mode you only read and propose; you never modify the workspace. In act mode you may apply changes with approval.`,
    "Use tools only when necessary to inspect or modify files or run commands requested by the user.",
    "Do not invoke tools in an endless loop. Once you have sufficient information or have answered the user, stop calling tools and output your response directly.",
    "When you need the user to decide something, use the askQuestion tool.",
  ].join("\n");
}

function stepLimit(agentToolLoopSteps: string): number {
  const normalized = normalizeAgentToolLoopSteps(agentToolLoopSteps);
  if (normalized === "unlimited") return DEFAULT_MAX_STEPS;
  return Number(normalized);
}

export function createTurnExecutor(deps: ExecutorDeps): TurnExecutor {
  const { store, runStore, meta, mutate, capabilityFactory, emitError } = deps;
  const abortControllers = new Map<string, AbortController>();
  const provider = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  const isActive = (turn: { id: string }): boolean =>
    runStore.activeTurn?.id === turn.id && runStore.activeTurn.status === "running";


  async function runTurn(turn: { id: string; sessionId: string }, signal: AbortSignal): Promise<void> {
    try {
      const maxSteps = stepLimit(meta.settings.agentToolLoopSteps);
      for (let stepCount = 0; stepCount < maxSteps; stepCount++) {
        if (signal.aborted || !isActive(turn)) return;
        const hadToolCalls = await runModelStep(turn, signal);
        if (signal.aborted || !isActive(turn)) return;
        if (!hadToolCalls) break;
      }
      if (isActive(turn)) {
        mutate({ kind: "run-commit", turnId: turn.id });
      }
    } catch (error) {
      if (signal.aborted) return;
      if (isActive(turn)) {
        const message = error instanceof Error ? error.message : String(error);
        mutate({ kind: "run-fail", turnId: turn.id, error: message });
      }
    } finally {
      abortControllers.delete(turn.id);
    }
  }

  async function runModelStep(
    turn: { id: string; sessionId: string },
    signal: AbortSignal,
  ): Promise<boolean> {
    const session = store.load(turn.sessionId);
    if (!session) return false;
    const messages = buildAiHistory(session, runStore.activeTurn);
    const model = provider(meta.llm.modelName);
    let hadToolCall = false;

    const toAiTool = (definition: ToolDefinition, turnId: string) =>
      aiTool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: async (input, { toolCallId }) => {
          hadToolCall = true;
          const cap = capabilityFactory(toolCallId);
          cap.onOutput = (delta: string) =>
            mutate({ kind: "run-tool-update", callId: toolCallId, result: delta });
          mutate({
            kind: "run-tool-start",
            turnId,
            call: { id: toolCallId, toolName: definition.name, args: input, status: "executing" },
          });
          try {
            const result = await definition.execute(input, cap);
            mutate({ kind: "run-tool-end", callId: toolCallId, result: result.content, isError: result.isError });
            return result.content;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            mutate({ kind: "run-tool-end", callId: toolCallId, result: message, isError: true });
            return message;
          }
        },
      });

    const tools = Object.fromEntries(
      TOOL_DEFINITIONS.map((definition) => [definition.name, toAiTool(definition, turn.id)]),
    ) as ToolSet;

    const result = streamText({
      model,
      system: systemPrompt(meta.workspace.rootPath, meta.mode),
      messages: toModelMessages(messages),
      tools,
      stopWhen: stepCountIs(1),
      abortSignal: signal,
      maxRetries: DEFAULT_MAX_RETRIES,
    });

    const stream = result.fullStream as AsyncIterable<TextStreamPart<ToolSet>>;
    for await (const part of stream) {
      if (part.type === "text-delta") {
        mutate({ kind: "run-text", turnId: turn.id, content: part.text });
      } else if (part.type === "tool-call") {
        hadToolCall = true;
      } else if (part.type === "abort") {
        break;
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    return hadToolCall;
  }

  return {
    start(content, options) {
      const sessionId = meta.currentSessionId;
      if (!sessionId) {
        emitError("no active session");
        return;
      }
      if (runStore.isActive()) {
        emitError("a run is already active");
        return;
      }
      if (!process.env.DEEPSEEK_API_KEY) {
        emitError("DeepSeek API key is not set. Set the DEEPSEEK_API_KEY environment variable.");
        return;
      }
      const turn = {
        id: `turn_${randomUUID()}`,
        sessionId,
        status: "running" as const,
        userContent: content,
        displayContent: options?.displayContent,
        steps: [],
        blocks: [],
        startedAt: Date.now(),
      };
      const controller = new AbortController();
      abortControllers.set(turn.id, controller);
      mutate({ kind: "run-begin", turn });
      void runTurn(turn, controller.signal);
    },
    abort(turnId) {
      abortControllers.get(turnId)?.abort();
    },
  };
}

export type { AgentMessage };