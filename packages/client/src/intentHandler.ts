import type { AgentHostIntent, AgentHostDispatchResult } from "./hostContract.js";

/** Handler for a single intent type. */
export interface IntentHandler<T extends AgentHostIntent["type"] = AgentHostIntent["type"]> {
  readonly type: T;
  handle(intent: Extract<AgentHostIntent, { type: T }>): Promise<AgentHostDispatchResult> | AgentHostDispatchResult;
}

/** Middleware wraps intent dispatch. Receives the intent and a `next` to call downstream. */
export type IntentMiddleware = (
  intent: AgentHostIntent,
  next: () => Promise<AgentHostDispatchResult>,
) => Promise<AgentHostDispatchResult>;
