import { ToolLoopAgent, type ModelMessage, tool } from "ai";
import { z } from "zod";
import { SkillsManager } from "./skills/SkillsManager.js";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFileTools } from "./tools/index.js";
import { getSetting } from "@excelsior/agent-storage";
import { buildSystemPrompt } from "./prompt.js";
import type { ToolContext } from "./tools/core/context.js";
import type { StreamCapableAgent, AgentEventEmitter } from "../runtime/events.js";
import type { AgentMessage } from "@excelsior/core";
import { normalizeMessageContent } from "../application/context/messageUtils.js";
import {
  StreamPart,
  getTextDelta,
  getToolName,
  getToolArgs,
  getToolResult,
} from "../runtime/streamTypes.js";
import { withRetry, isTransientError } from "../runtime/retry.js";
import {
  RUN_START,
  RUN_END,
  TEXT_DELTA,
  TOOL_CALL_START,
  TOOL_CALL_END,
  ERROR,
} from "../runtime/eventNames.js";

interface Streamable {
  stream(input: {
    messages: ModelMessage[];
    abortSignal?: AbortSignal;
  }): PromiseLike<{ fullStream: AsyncIterable<unknown> }>;
}

export class ExcelsiorAgent implements StreamCapableAgent {
  constructor(private readonly agent: Streamable) {}

  async stream(input: {
    messages: AgentMessage[];
    signal: AbortSignal;
    emit: AgentEventEmitter;
  }): Promise<void> {
    const { messages, signal, emit } = input;
    let isCancelled = false;

    emit(RUN_START, {});

    try {
      const stream = await withRetry(
        async () =>
          this.agent.stream({
            messages: toModelMessages(messages),
            abortSignal: signal,
          }),
        {
          signal,
          maxRetries: 3,
          baseDelayMs: 1000,
          onRetry: (error, attempt) => {
            emit(TEXT_DELTA, {
              delta: `\nRetry ${attempt}/3  API error: ${error.message} - retrying...\n`,
            });
          },
        },
      );

      for await (const rawPart of stream.fullStream) {
        if (signal.aborted) {
          isCancelled = true;
          break;
        }

        const part = rawPart as StreamPart;

        if (part.type === "text-delta") {
          const delta = getTextDelta(part);
          emit(TEXT_DELTA, { delta });
        } else if (part.type === "tool-call") {
          const toolName = getToolName(part);
          const toolArgs = getToolArgs(part);
          const toolCallId = part.toolCallId;
          emit(
            TOOL_CALL_START,
            { toolName, toolArgs, toolCallId },
            { relatedToolCallId: toolCallId },
          );
        } else if (part.type === "tool-result" || part.type === "tool-error") {
          const toolCallId = part.toolCallId;
          const result = getToolResult(part);
          const status = part.type === "tool-error" ? "error" : "success";
          emit(
            TOOL_CALL_END,
            {
              toolCallId,
              result,
              status,
              toolName: getToolName(part),
              toolArgs: getToolArgs(part),
            },
            { relatedToolCallId: toolCallId },
          );
        }
      }

      emit(RUN_END, { cancelled: isCancelled });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === "AbortError" || err.message.includes("abort")) {
        emit(RUN_END, { cancelled: true });
        return;
      }

      if (isTransientError(err)) {
        emit(TEXT_DELTA, {
          delta: `\n[Error] API request failed after retries: ${err.message}\n`,
        });
      }
      emit(ERROR, { message: err.message ?? String(error) });
      emit(RUN_END, { cancelled: true });
    }
  }
}

export function createAgent(
  instructions?: string,
  extraTools?: Record<string, unknown>,
  ctx?: ToolContext,
): StreamCapableAgent {
  const systemPrompt = buildSystemPrompt(ctx?.mode);
  const apiKey = getSetting("DEEPSEEK_API_KEY");
  const deepseek = createDeepSeek({
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
  });
  const model = deepseek("deepseek-v4-flash");

  const finalInstructions = instructions
    ? `${systemPrompt}\n\n---\n${instructions}\n---`
    : systemPrompt;

  const skillsManager = new SkillsManager(ctx?.workspaceRoot);
  skillsManager.discoverSkills();
  const skills = skillsManager.getSkills();

  const dynamicSkillTools: Record<string, unknown> = {};
  for (const skill of skills) {
    const sanitizedName = skill.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const toolName = `skill_${sanitizedName}`;
    dynamicSkillTools[toolName] = tool({
      description: skill.description,
      inputSchema: z.object({}),
      execute: async () => {
        const body = skillsManager.getSkillBody(skill.name);
        return body || `Skill ${skill.name} not found or disabled.`;
      },
    });
  }

  let dynamicInstructions = finalInstructions;
  if (skills.length > 0) {
    const skillsList = skills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join("\n");
    dynamicInstructions += `\n\n---\n## Available Agent Skills\nYou have access to the following specialized engineering and productivity skills. To load the detailed instructions for a skill, execute its corresponding tool \`skill_<name>\` (e.g. \`skill_diagnose\`).\n\n${skillsList}\n---`;
  }

  const agent = new ToolLoopAgent({
    model,
    instructions: dynamicInstructions,
    tools: {
      ...createFileTools(ctx),
      ...dynamicSkillTools,
      ...extraTools,
    },
  });

  return new ExcelsiorAgent(agent);
}

function toModelMessages(messages: readonly AgentMessage[]): ModelMessage[] {
  return messages.map(toModelMessage);
}

function toModelMessage(message: AgentMessage): ModelMessage {
  switch (message.role) {
    case "system":
      return { role: "system", content: normalizeMessageContent(message.content) };
    case "user":
      return {
        role: "user",
        content: toTextContent(message.content),
      };
    case "assistant": {
      const textContent = toTextContent(message.content);
      const toolCalls =
        message.tool_calls?.map((toolCall) => ({
          type: "tool-call" as const,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: parseToolInput(toolCall.function.arguments),
        })) ?? [];

      if (toolCalls.length === 0) {
        return { role: "assistant", content: textContent };
      }

      return {
        role: "assistant",
        content: [
          ...(typeof textContent === "string" && textContent.length > 0
            ? [{ type: "text" as const, text: textContent }]
            : Array.isArray(textContent)
              ? textContent
              : []),
          ...toolCalls,
        ],
      };
    }
    case "tool":
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.tool_call_id ?? "tool-call",
            toolName: "tool",
            output: {
              type: "text",
              value: normalizeMessageContent(message.content),
            },
          },
        ],
      };
  }
}

function toTextContent(
  content: AgentMessage["content"],
): string | Array<{ type: "text"; text: string }> {
  if (typeof content === "string") return content;
  return content.map((part) => ({ type: "text", text: part.text }));
}

function parseToolInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
