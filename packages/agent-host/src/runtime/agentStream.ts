import type { AgentMessage } from "@excelsior/core";
import type { RunEventOverrides } from "@excelsior/run-runtime";
import type { AgentEventDataMap, AgentEventType } from "./events.js";

export type AgentEventEmitter = <T extends AgentEventType>(
  type: T,
  data: AgentEventDataMap[T],
  overrides?: RunEventOverrides,
) => void;

export interface StreamCapableAgent {
  stream(input: {
    messages: AgentMessage[];
    signal: AbortSignal;
    emit: AgentEventEmitter;
  }): Promise<void>;
}

export interface StreamAgentResponseConfig {
  agent: StreamCapableAgent;
  messages: AgentMessage[];
  signal: AbortSignal;
  emit: AgentEventEmitter;
}

export async function streamAgentResponse({
  agent,
  messages,
  signal,
  emit,
}: StreamAgentResponseConfig): Promise<void> {
  await agent.stream({ messages, signal, emit });
}
