import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ERROR,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TURN_END,
  TURN_START,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventEmitter,
} from "../src/events.js";
import { ProviderRegistry, ToolRegistry } from "../src/registries/registries.js";
import { runAgentLoop } from "../src/run/RunController.js";
import { runModelStep } from "../src/run/runModelStep.js";
import { RunEventWriter } from "../src/run/RunEventWriter.js";

describe("RunController", () => {
  it("emits a complete run lifecycle for streamed assistant text", async () => {
    const events: AnyHarnessEvent[] = [];
    let sequence = 0;
    const emit: HarnessEventEmitter = (type, data, options) => {
      const event = makeHarnessEvent({
        workspaceId: "ws_test",
        sessionId: "ses_test",
        runId: "run_test",
        turnId: options?.turnId ?? "turn_test",
        sequence: ++sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
      });
      events.push(event as AnyHarnessEvent);
      return event;
    };

    const providers = new ProviderRegistry();
    providers.register({
      id: "deepseek",
      displayName: "Fake",
      modelId: "fake-model",
      createModel: () => new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: "Hello" },
              { type: "text-delta", id: "text-1", delta: " world" },
              { type: "text-end", id: "text-1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                logprobs: undefined,
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 2, text: 2, reasoning: undefined },
                },
              },
            ],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        }),
      }),
    });

    await runAgentLoop({
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
      },
      providers,
      tools: new ToolRegistry(),
      toolEnv: {
        workspaceRoot: process.cwd(),
        mode: "act",
        emit,
        settings: {
          deepseekApiKey: "test",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
          autoReflectionEnabled: false,
        },
        backupDir: process.cwd(),
      },
      toolActions: {
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
      },
      signal: new AbortController().signal,
      emit,
    });

    expect(events.map((event) => event.type)).toEqual([
      TURN_START,
      MESSAGE_START,
      MESSAGE_UPDATE,
      MESSAGE_UPDATE,
      MESSAGE_END,
      TURN_END,
    ]);
    expect(events.find((event) => event.type === MESSAGE_END)?.data).toMatchObject({
      message: { role: "assistant", content: "Hello world" },
    });
  });

  it("injects user steering messages mid-run loop correctly", async () => {
    const events: AnyHarnessEvent[] = [];
    let sequence = 0;
    const emit: HarnessEventEmitter = (type, data, options) => {
      const event = makeHarnessEvent({
        workspaceId: "ws_test",
        sessionId: "ses_test",
        runId: "run_test",
        turnId: options?.turnId ?? "turn_test",
        sequence: ++sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
      });
      events.push(event as AnyHarnessEvent);
      return event;
    };

    const providers = new ProviderRegistry();
    providers.register({
      id: "deepseek",
      displayName: "Fake",
      modelId: "fake-model",
      createModel: () => new MockLanguageModelV3({
        doStream: async ({ prompt }: any) => {
          // Check if any user message contains our steering keyword
          const hasSteering = prompt.some(
            (msg: any) =>
              msg.role === "user" &&
              msg.content.some(
                (part: any) =>
                  part.type === "text" &&
                  part.text.includes("prioritize file B"),
              ),
          );

          if (hasSteering) {
            return {
              stream: simulateReadableStream({
                chunks: [
                  { type: "text-start", id: "text-2" },
                  { type: "text-delta", id: "text-2", delta: "Okay, prioritizing file B" },
                  { type: "text-end", id: "text-2" },
                  {
                    type: "finish",
                    finishReason: { unified: "stop", raw: undefined },
                    logprobs: undefined,
                    usage: {
                      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
                      outputTokens: { total: 5, text: 5, reasoning: undefined },
                    },
                  },
                ],
                initialDelayInMs: null,
                chunkDelayInMs: null,
              }),
            };
          }

          // Initial step: output a tool call to "ls"
          return {
            stream: simulateReadableStream({
              chunks: [
                {
                  type: "tool-call",
                  toolCallId: "call-1",
                  toolName: "ls",
                  input: "{}",
                },
                {
                  type: "finish",
                  finishReason: { unified: "stop", raw: undefined },
                  logprobs: undefined,
                  usage: {
                    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 2, text: 2, reasoning: undefined },
                  },
                },
              ],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        },
      }),
    });

    const tools = new ToolRegistry();
    // Register a dummy "ls" tool that returns immediately
    tools.register({
      name: "ls",
      description: "mock ls",
      inputSchema: z.object({}),
      execute: async () => ({ content: "fileA.txt, fileB.txt" }),
    });

    // Simulate steering message queued mid-run
    const steeringQueue = ["Wait, prioritize file B"];

    await runAgentLoop({
      messages: [{ role: "user", content: "do search" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
      },
      providers,
      tools,
      toolEnv: {
        workspaceRoot: process.cwd(),
        mode: "act",
        emit,
        settings: {
          deepseekApiKey: "test",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
          autoReflectionEnabled: false,
        },
        backupDir: process.cwd(),
      },
      toolActions: {
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
      },
      signal: new AbortController().signal,
      emit,
      getSteeringMessages: () => {
        const msgs = [...steeringQueue];
        steeringQueue.length = 0; // Clear queue
        return msgs;
      },
    });

    // Expect the assistant message block with prioritizing text to be emitted
    const assistantMsgs = events
      .filter((e) => e.type === MESSAGE_END && (e.data as any).message?.role === "assistant")
      .map((e) => (e.data as any).message?.content);

    expect(assistantMsgs).toContain("Okay, prioritizing file B");
  });

  it("finalizes partial tool input when the model stream fails before execution", async () => {
    const events: AnyHarnessEvent[] = [];
    let sequence = 0;
    const emit: HarnessEventEmitter = (type, data, options) => {
      const event = makeHarnessEvent({
        workspaceId: "ws_test",
        sessionId: "ses_test",
        runId: "run_test",
        turnId: options?.turnId ?? "turn_test",
        sequence: ++sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
      });
      events.push(event as AnyHarnessEvent);
      return event;
    };

    const providers = new ProviderRegistry();
    providers.register({
      id: "deepseek",
      displayName: "Fake",
      modelId: "fake-model",
      createModel: () => new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "tool-input-start", id: "call-write", toolName: "write" },
              {
                type: "tool-input-delta",
                id: "call-write",
                delta: "{\"filePath\":\"report.html\",\"content\":\"<html>",
              },
              {
                type: "error",
                error: new SyntaxError("Unterminated string in JSON at position 554"),
              },
              {
                type: "finish",
                finishReason: { unified: "error", raw: undefined },
                logprobs: undefined,
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        }),
      }),
    });

    let executed = false;
    const tools = new ToolRegistry();
    tools.register({
      name: "write",
      description: "mock write",
      inputSchema: z.object({
        filePath: z.string(),
        content: z.string(),
      }),
      execute: async () => {
        executed = true;
        return { content: "wrote file" };
      },
    });

    await runAgentLoop({
      messages: [{ role: "user", content: "write a report" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
      },
      providers,
      tools,
      toolEnv: {
        workspaceRoot: process.cwd(),
        mode: "act",
        emit,
        settings: {
          deepseekApiKey: "test",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
          autoReflectionEnabled: false,
        },
        backupDir: process.cwd(),
      },
      toolActions: {
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
      },
      signal: new AbortController().signal,
      emit,
    });

    const types = events.map((event) => event.type);
    expect(types).toContain(TOOL_EXECUTION_START);
    expect(types).toContain(TOOL_EXECUTION_UPDATE);
    expect(types).toContain(ERROR);
    expect(types).toContain(TOOL_EXECUTION_END);
    expect(executed).toBe(false);

    const toolEnd = events.find((event) => event.type === TOOL_EXECUTION_END);
    expect(toolEnd?.data).toMatchObject({
      toolCallId: "call-write",
      toolName: "write",
      isError: true,
    });
    expect(toolEnd?.data.result).toContain("Unterminated string in JSON");
    expect(types.indexOf(TOOL_EXECUTION_END)).toBeGreaterThan(types.indexOf(ERROR));
  });

  it("coalesces frequent streamed tool input deltas before notifying", async () => {
    const events: AnyHarnessEvent[] = [];
    let sequence = 0;
    const emit: HarnessEventEmitter = (type, data, options) => {
      const event = makeHarnessEvent({
        workspaceId: "ws_test",
        sessionId: "ses_test",
        runId: "run_test",
        turnId: options?.turnId ?? "turn_test",
        sequence: ++sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
      });
      events.push(event as AnyHarnessEvent);
      return event;
    };

    const chunks = [
      "{\"filePath\":\"report.html\",",
      "\"content\":\"<html>",
      "\\n<body>",
      "\\n<h1>Report</h1>",
      "\\n</body></html>\"}",
    ];

    const providers = new ProviderRegistry();
    providers.register({
      id: "deepseek",
      displayName: "Fake",
      modelId: "fake-model",
      createModel: () => new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "tool-input-start", id: "call-write", toolName: "write" },
              ...chunks.map((delta) => ({
                type: "tool-input-delta" as const,
                id: "call-write",
                delta,
              })),
              {
                type: "tool-call",
                toolCallId: "call-write",
                toolName: "write",
                input: chunks.join(""),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                logprobs: undefined,
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        }),
      }),
    });

    const tools = new ToolRegistry();
    tools.register({
      name: "write",
      description: "mock write",
      inputSchema: z.object({
        filePath: z.string(),
        content: z.string(),
      }),
      execute: async () => ({ content: "wrote file" }),
    });

    await runAgentLoop({
      messages: [{ role: "user", content: "write a report" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "1",
        autoReflectionEnabled: false,
      },
      providers,
      tools,
      toolEnv: {
        workspaceRoot: process.cwd(),
        mode: "act",
        emit,
        settings: {
          deepseekApiKey: "test",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
          autoReflectionEnabled: false,
        },
        backupDir: process.cwd(),
      },
      toolActions: {
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
      },
      signal: new AbortController().signal,
      emit,
    });

    const updates = events.filter((event) => event.type === TOOL_EXECUTION_UPDATE);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data.delta).toBe(chunks.join(""));
  });

  it("emits nothing for a step cancelled before the model starts", async () => {
    const events: AnyHarnessEvent[] = [];
    let sequence = 0;
    const emit: HarnessEventEmitter = (type, data, options) => {
      const event = makeHarnessEvent({
        workspaceId: "ws_test",
        sessionId: "ses_test",
        runId: "run_test",
        turnId: options?.turnId ?? "turn_test",
        sequence: ++sequence,
        type,
        data,
        relatedToolCallId: options?.relatedToolCallId,
        parentEventId: options?.parentEventId,
      });
      events.push(event as AnyHarnessEvent);
      return event;
    };

    const controller = new AbortController();
    controller.abort();

    const result = await runModelStep({
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
        autoReflectionEnabled: false,
      },
      providers: new ProviderRegistry(),
      tools: new ToolRegistry(),
      toolEnv: {
        workspaceRoot: process.cwd(),
        mode: "act",
        emit,
        settings: {
          deepseekApiKey: "test",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
          autoReflectionEnabled: false,
        },
        backupDir: process.cwd(),
      },
      toolActions: {
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
      },
      signal: controller.signal,
      emit,
      writer: new RunEventWriter(emit),
      runPrefix: "cancelled",
    });

    expect(result.status).toBe("cancelled");
    expect(result.hasToolCalls).toBe(false);
    expect(events).toEqual([]);
  });
});
