# Vercel AI SDK Migration Plan — DeepSeek + streamText (no @anthropic-ai/sdk)

## 1. Goal (per answers: Keep DeepSeek, streamText, nuke @anthropic-ai/sdk)

Replace the current core (`src/services/api/claude.ts` + `src/services/api/client.ts` + `src/query.ts` loop) which uses `@anthropic-ai/sdk` (`Anthropic` client, `BetaMessage`, `BetaRawMessageStreamEvent`, `Stream<BetaRawMessageStreamEvent>`) with Vercel AI SDK (`ai` + `@ai-sdk/deepseek`) using `streamText` + `createDeepSeek({apiKey: DEEPSEEK_API_KEY})`. No code copied from `packages/engine` — analyzed only for patterns.

## 2. Current implementation (observed: src/query.ts:219, src/services/api/claude.ts:1, src/types/message.ts:72, src/services/api/client.ts:1)

- **Transport**: `src/services/api/client.ts` builds `Anthropic` client per provider (Anthropic direct, Bedrock, Vertex, Foundry) with OAuth/API-key helper, proxy, AWS region. `src/services/api/claude.ts:760+` calls `client.beta.messages.stream({model, messages, system, tools, betas, max_tokens, thinking, ...})` returning `Stream<BetaRawMessageStreamEvent>`.
- **Loop**: `src/query.ts:219 query()` → `queryLoop()` is an `AsyncGenerator<StreamEvent|Message, Terminal>` with infinite `while(true)` iterating turns. Each iteration builds `QueryConfig` (growthbook/gates), handles compact/token-budget, calls `queryLLM()` (in claude.ts) which yields `StreamEvent {type:'stream_event', event: BetaRawMessageStreamEvent}`. Between iterations: executes tool calls via `runTools`/`StreamingToolExecutor`/`toolOrchestration`, handles `canUseTool`, permission, stop hooks, reactive compact, fallbacks.
- **Messages**: `src/types/message.ts:72 AssistantMessage {message: BetaMessage}` where `BetaMessage.content: BetaContentBlock[]` (text, thinking, tool_use, redacted_thinking). `UserMessage` wraps `ToolResultBlockParam`. Streaming events forwarded as `StreamEvent` to REPL/UI.
- **Side effects**: Telemetry (now nuked), cost/tokens (`src/cost-tracker.ts`, `src/utils/tokens.ts`), fingerprinting, caching (`cache_control`), betas (prompt caching, effort, structured outputs, context1m, etc.).

## 3. Target architecture (Vercel AI SDK)

```
UI/REPL → query() (async generator) → queryVercelModel() [replaces queryLLM]
          → streamText({model: deepseek(modelName), system, messages, tools, stopWhen: stepCountIs(1), abortSignal})
               ↘ fullStream: AsyncIterable<TextStreamPart> → map to StreamEvent-compatible yields
          → tool loop: ai's tool.execute vs existing runTools — harmonize
```

- **Provider**: `createDeepSeek({apiKey: process.env.DEEPSEEK_API_KEY, baseURL?})` from `@ai-sdk/deepseek`. Keep `DEEPSEEK_API_KEY` env (already used in engine). Add `modelName` from `meta.llm.modelName` / `getRuntimeMainLoopModel()`; DeepSeek models: `deepseek-chat`, `deepseek-reasoner`. No Bedrock/Vertex/Foundry — out of scope for DeepSeek.
- **Message conversion**: Remove `assistantMessageToMessageParam` / `userMessageToMessageParam` that emit `MessageParam` for Anthropic. Add `toVercelMessages(messages: Message[]): ModelMessage[]` (Vercel SDK's `ModelMessage` = `{role:'system'|'user'|'assistant'|'tool', content: string | ContentPart[]}`) and `system` string extracted from `SystemPrompt`. Tool results become `{role:'tool', content: [{type:'tool-result', toolName, toolCallId, output}]}` instead of `BetaToolResultBlockParam`.
- **Tools**: Current `Tool` defs (`src/Tool.ts: Tool {name, description, inputSchema (JSON Schema), handler}`) map to `ai`'s `tool({description, inputSchema: zodSchema, execute})`. Need Zod conversion (most tools already have Zod; add shim for JSON Schema → Zod or keep raw). `streamText` will invoke `execute` automatically; we intercept to keep existing permission/capability flow.

## 4. Mapping Anthropic SDK → Vercel SDK

| Current (@anthropic-ai/sdk) | Vercel `ai` (DeepSeek) | Notes |
|---|---|---|
| `new Anthropic({apiKey, baseURL, ...})` | `createDeepSeek({apiKey})` + `deepseek('deepseek-chat')` | Drop multi-provider branching |
| `BetaToolChoiceAuto/Tool`, `BetaToolUnion` | `toolChoice: 'auto' | 'required'` via `ai` (DeepSeek supports) | Simplify |
| `BetaContentBlock` (thinking, tool_use) | `TextStreamPart`: `text-delta`, `reasoning-delta`, `tool-call`, `tool-result` | Map `tool_use`→`tool-call`, `thinking`→`reasoning-delta` |
| `Stream<BetaRawMessageStreamEvent>`: `content_block_delta` etc. | `result.fullStream: AsyncIterable<TextStreamPart>` | Translate in adapter |
| `BetaMessage.usage: {input_tokens, output_tokens}` | `result.usage: Promise<{inputTokens, outputTokens, totalTokens}>` | Await after stream |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_BEDROCK_*` | `DEEPSEEK_API_KEY` only | Remove AWS/Vertex creds path |
| Prompt caching (`cache_control`) + betas | Not supported by DeepSeek — drop or no-op | Document breaking change |
| `thinkingConfig` (max_thinking_tokens) | DeepSeek reasoner exposes reasoning; use `reasoning-delta` | Partial parity |

## 5. File changes

1. **Add** `src/services/api/vercelClient.ts` — tiny provider factory:
   ```ts
   import { createDeepSeek } from '@ai-sdk/deepseek';
   export const deepseekProvider = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
   export const getDeepSeekModel = (name: string) => deepseekProvider(name || 'deepseek-chat');
   ```
2. **Add** `src/services/api/vercelQuery.ts` — new `queryVercelModel()`:
   - Input: `{messages, systemPrompt, tools, signal, modelName}`
   - Converts messages via `toVercelMessages`, system via `systemPromptToString`
   - Calls `streamText({model, system, messages, tools: toVercelTools(tools), stopWhen: stepCountIs(1), abortSignal: signal, maxRetries: 2})`
   - Iterates `result.fullStream`, yields existing `StreamEvent` shapes (adaptor) or new `VercelStreamEvent` if UI updated.
   - Returns usage/cost for `addToTotalSessionCost`.
3. **Modify** `src/query.ts`:
   - Swap import `queryLLM` → `queryVercelModel`
   - Remove `thinkingConfig`, `cache_control`, beta header plumbing
   - Keep loop, `runTools`, `handleStopHooks`, compact, tokenBudget — unchanged
   - Fix `Message` type: make `AssistantMessage.message` provider-agnostic (replace `BetaMessage` with local `AssistantContent = {type:'text'|'tool_use'|'reasoning',...}` or union).
4. **Modify** `src/types/message.ts`:
   - Remove `import ... from '@anthropic-ai/sdk/...'`; define own `ContentBlock = {type:'text', text}|{type:'tool_use', id, name, input}|{type:'tool_result', ...}|{type:'reasoning', text}`.
   - Keep `StreamEvent` but generalize `event: unknown` or `VercelStreamPart`.
5. **Delete/replace** `src/services/api/claude.ts` + `src/services/api/client.ts` (Anthropic-specific). Keep file as re-export shim for transition or delete. Remove `assistantMessageToMessageParam` etc.
6. **Update** `src/utils/api.ts` (`toolToAPISchema`) to emit Vercel tool schema instead of Anthropic `BetaToolUnion`.
7. **Package**: Ensure root `package.json` has `ai@^6` + `@ai-sdk/deepseek@^2` (today only `packages/engine` has them; promote to root or keep isolated). Remove `@anthropic-ai/sdk` from deps (`package.json`, `bun.lock`).
8. **Errors/retries**: Replace `withRetry` that catches `APIError` with `ai`'s retry (`maxRetries`) + simple `APIError` mapping.

## 6. Tool calling with streamText

```ts
const toVercelTools = (tools: Tool[]): ToolSet =>
  Object.fromEntries(tools.map(t => [t.name, tool({
    description: t.description,
    inputSchema: t.inputSchema as ZodType, // or jsonSchema() shim
    execute: async (input, { toolCallId }) => {
      // preserve existing permission: call canUseTool, capabilityFactory, runTools
      // mutate via toolUseContext, emit run-tool-start/end for transcript
      return await executeTool(t.name, input, toolCallId);
    }
  })]));
```

- Use `stopWhen: stepCountIs(1)` so each `queryVercelModel` call is one turn (mirrors current one-stream-per-loop); `streamText` will stop after first tool-call batch or text, returning control to `queryLoop` for tool execution (same as now).
- Streaming: forward `text-delta` + `reasoning-delta` as `StreamEvent` to UI; `tool-call` sets `hadToolCall=true`.

## 7. Streaming event translation

Create `vercelToStreamEvent(part: TextStreamPart): StreamEvent | null`:
- `text-delta` → `{type:'stream_event', event:{type:'content_block_delta', delta:{type:'text_delta', text}}}`
- `tool-call` → same + `content_block_start {type:'tool_use'}`
- `tool-result` → not emitted by `fullStream` (we execute); ignore
- `reasoning-delta` → optional thinking UI

This keeps `src/screens/REPL.tsx` + `src/components` unchanged initially.

## 8. What to drop (DeepSeek parity gaps)

- Prompt caching, betas, `context1m`, `effort`, MCP tool deltas, `extendedThinking`, `X-Api-Key` OAuth dance — all Anthropic-specific. Either stub (no-ops) or remove. Document that DeepSeek path disables them.
- Multi-provider auth (Bedrock/Vertex) — removed.
- Cost calculation (`calculateUSDCost` assumes Anthropic pricing) — replace with DeepSeek pricing table.

## 9. Verification

- `npm run typecheck`, `npm run build`, `vitest` on `src/query.test.ts` (mock `streamText` via `vi.mock('ai')`).
- Manual smoke: `DEEPSEEK_API_KEY=... npm run dev` (Bun) — check tool calling loop, abort, token usage, cost panel.
- Regression: ensure `sessionStore` transcript still round-trips (new `ContentBlock` union).

## 10. Rollout steps

1. Land stubs for `vercelClient`/`vercelQuery` behind `feature('VERCEL_DEEPSEEK')` flag, keeping old `claude.ts` path.
2. Flip flag in dev, run dual-path integration tests.
3. Remove `@anthropic-ai/sdk`, delete `client.ts`/`claude.ts` legacy, make Vercel path default.
4. Update docs/`CONTEXT.md` vocabulary: `Anthropic SDK` → `Vercel AI SDK (DeepSeek provider)`.
