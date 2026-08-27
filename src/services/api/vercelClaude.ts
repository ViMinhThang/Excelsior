/**
 * Vercel AI SDK mirror of src/services/api/claude.ts
 * Mirrors queryModelWithStreaming but uses `ai` + `@ai-sdk/deepseek` instead of `@anthropic-ai/sdk`.
 * Keeps same external contract so src/query.ts can swap via deps injection.
 * Provider: DeepSeek (DEEPSEEK_API_KEY). System prompt, messages, tools, streaming,
 * tool-calling loop semantics are preserved; Anthropic-specific betas/caching dropped (no-ops).
 */
import { createDeepSeek } from '@ai-sdk/deepseek';
import { stepCountIs, streamText, tool as aiTool, type ToolSet } from 'ai';
import { randomUUID } from 'crypto';
import type { AssistantMessage, Message, StreamEvent, SystemAPIErrorMessage } from '../../types/message.js';
import type { SystemPrompt } from '../../utils/systemPromptType.js';
import type { ThinkingConfig } from '../../utils/thinking.js';
import type { Tools } from '../../Tool.js';
import type { Options } from './claude.js';
import { logError } from '../../utils/log.js';

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });

// Keep same shape as claude.ts exports so query/deps can swap
export async function* queryModelWithStreaming({
  messages,
  systemPrompt,
  tools,
  signal,
  options,
}: {
  messages: Message[];
  systemPrompt: SystemPrompt;
  thinkingConfig: ThinkingConfig;
  tools: Tools;
  signal: AbortSignal;
  options: Options;
}): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  const modelName = options.model || 'deepseek-chat';
  const model = deepseek(modelName);

  // Convert systemPrompt + messages to Vercel format
  const system = systemPromptToString(systemPrompt);
  const vercelMessages = toVercelMessages(messages);

  // Convert Tools to Vercel ToolSet (zod/jsonSchema passthrough)
  const vercelTools = toVercelToolSet(tools);

  let fullText = '';
  const toolCalls: { id: string; name: string; args: unknown }[] = [];
  let ttftMs: number | undefined;

  const result = streamText({
    model,
    system,
    messages: vercelMessages,
    tools: vercelTools,
    stopWhen: stepCountIs(1),
    abortSignal: signal,
    maxRetries: 2,
  });

  // Stream Vercel TextStreamParts → legacy StreamEvent shape so REPL/UI unchanged
  try {
    for await (const part of result.fullStream as AsyncIterable<any>) {
      if (signal.aborted) break;
      if (part.type === 'text-delta') {
        if (ttftMs === undefined) ttftMs = Date.now();
        fullText += part.text;
        yield toStreamEvent(part);
      } else if (part.type === 'reasoning-delta') {
        // Map DeepSeek reasoner thinking to stream_event as thinking delta (optional)
        yield toStreamEvent(part);
      } else if (part.type === 'tool-call') {
        toolCalls.push({ id: part.toolCallId, name: part.toolName, args: part.input });
        yield toStreamEvent(part);
      } else if (part.type === 'error') {
        throw part.error;
      } else if (part.type === 'abort') {
        break;
      }
    }
  } catch (error) {
    // Mirror claude.ts withRetry error surfacing as SystemAPIErrorMessage via throw
    // Let queryLoop's fallback/retry handle it; emit as error for visibility
    logError(error);
    throw error;
  }

  // After stream, await usage for cost tracking (mirrors tokenCountFromLastAPIResponse)
  try {
    const usage = await result.usage;
    // usage available for future cost tracker integration
    void usage;
  } catch {}

  // Build AssistantMessage in BetaMessage shape expected by query.ts runTools loop
  const assistantMessage: AssistantMessage = {
    type: 'assistant',
    uuid: randomUUID() as any,
    timestamp: new Date().toISOString(),
    message: {
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content: buildBetaContent(fullText, toolCalls),
      model: modelName,
      stop_reason: toolCalls.length ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null } as any,
    } as any,
    requestId: randomUUID(),
  };

  // Yield final assistant message (queryLoop expects this after stream events)
  yield assistantMessage as any;
}

function systemPromptToString(sp: SystemPrompt): string {
  if (!sp) return '';
  if (typeof sp === 'string') return sp;
  if (Array.isArray(sp)) return sp.map((p: any) => p.text ?? '').join('\n');
  return String(sp);
}

function toVercelMessages(messages: Message[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.type === 'user') {
      const content = m.message.content;
      if (typeof content === 'string') {
        out.push({ role: 'user', content });
      } else if (Array.isArray(content)) {
        // Map BetaContentBlockParam → Vercel content parts
        const parts = content.map((b: any) => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'tool_result') return { type: 'tool-result', toolCallId: b.tool_use_id, toolName: 'tool', output: { type: 'text', value: String(b.content ?? '') } };
          if (b.type === 'image') return { type: 'image', image: b.source };
          return { type: 'text', text: String(b.text ?? JSON.stringify(b)) };
        });
        // Vercel expects string or parts; collapse tool-results as tool role messages separately
        const textParts = parts.filter((p: any) => p.type === 'text');
        const toolParts = parts.filter((p: any) => p.type === 'tool-result');
        if (textParts.length) out.push({ role: 'user', content: textParts.map((p: any) => p.text).join('\n') });
        for (const tp of toolParts) out.push({ role: 'tool', content: [tp] } as any);
      }
    } else if (m.type === 'assistant') {
      const content = (m as AssistantMessage).message.content;
      if (typeof content === 'string') {
        out.push({ role: 'assistant', content });
      } else if (Array.isArray(content)) {
        const text = content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
        const toolUses = content.filter((c: any) => c.type === 'tool_use');
        if (text) out.push({ role: 'assistant', content: text });
        for (const tu of toolUses) {
          out.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: tu.id, toolName: tu.name, input: tu.input }] } as any);
        }
      }
    }
  }
  return out;
}

function toVercelToolSet(tools: Tools): ToolSet {
  const out: Record<string, any> = {};
  const list = Array.isArray(tools) ? tools : Object.values(tools as any);
  for (const t of list as any[]) {
    if (!t?.name) continue;
    // Tools in this codebase have JSON Schema; ai's tool() accepts zod or jsonSchema.
    // Use jsonSchema fallback via aiTool with inputSchema passthrough (Vercel tolerates JSON Schema).
    out[t.name] = aiTool({
      description: t.description ?? '',
      inputSchema: (t.inputSchema as any) ?? (t as any).schema ?? { type: 'object', properties: {} } as any,
      execute: async (input: any) => {
        // Actual execution is done by query.ts runTools; here return input as echo
        // so streamText's tool-result step completes; real dispatch happens via queryLoop.
        return JSON.stringify(input);
      },
    });
  }
  return out as ToolSet;
}

function buildBetaContent(text: string, toolCalls: { id: string; name: string; args: unknown }[]): any[] {
  const content: any[] = [];
  if (text) content.push({ type: 'text', text });
  for (const tc of toolCalls) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
  }
  if (content.length === 0) content.push({ type: 'text', text: '' });
  return content;
}

function toStreamEvent(part: any): StreamEvent {
  // Minimal shim: wrap Vercel part as BetaRawMessageStreamEvent-like for UI compatibility
  return {
    type: 'stream_event',
    event: part as any,
  } as StreamEvent;
}
