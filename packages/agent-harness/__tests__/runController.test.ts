import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AGENT_END,
  AGENT_START,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TURN_END,
  TURN_START,
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventEmitter,
} from "../src/events.js";
import { ProviderRegistry, ToolRegistry } from "../src/registries.js";
import { RunController } from "../src/runController.js";

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

    await new RunController().run({
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
      },
      providers,
      tools: new ToolRegistry(),
      toolContext: {
        workspaceRoot: process.cwd(),
        mode: "act",
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
        sendSubAgent: async () => "",
      },
      signal: new AbortController().signal,
      emit,
    });

    expect(events.map((event) => event.type)).toEqual([
      AGENT_START,
      TURN_START,
      MESSAGE_START,
      MESSAGE_UPDATE,
      MESSAGE_UPDATE,
      MESSAGE_END,
      TURN_END,
      AGENT_END,
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
      capabilities: [],
      execute: async () => ({ content: "fileA.txt, fileB.txt" }),
    });

    // Simulate steering message queued mid-run
    const steeringQueue = ["Wait, prioritize file B"];

    await new RunController().run({
      messages: [{ role: "user", content: "do search" }],
      systemPrompt: "test system prompt",
      settings: {
        deepseekApiKey: "test",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
      },
      providers,
      tools,
      toolContext: {
        workspaceRoot: process.cwd(),
        mode: "act",
        confirm: async (request) => ({ callId: request.toolName, approved: true }),
        askQuestion: async () => ({
          callId: "question",
          answer: "",
          isManual: true,
          cancelled: true,
        }),
        sendSubAgent: async () => "",
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
});
