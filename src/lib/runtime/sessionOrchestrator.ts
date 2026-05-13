import type { ToolLoopAgent } from "ai";
import { AgentSession } from "./agentSession.js";
import { AnyAgentEvent } from "../eventTypes.js";
import { streamAgentResponse } from "./agentStream.js";
import { Unsubscribe } from "./bus.js";

export interface AgentFactory {
  (
    systemPrompt?: string,
    extraTools?: Record<string, unknown>,
  ): ToolLoopAgent<any, any>;
}

export interface SessionRunConfig {
  messages: Array<{ role: string; content: string }>;
  createAgent: AgentFactory;
  signal?: AbortSignal;
  onEvent?: (event: AnyAgentEvent, allEvents: AnyAgentEvent[]) => void;
}

export interface RunHandle {
  cancel(): void;
  readonly done: Promise<AnyAgentEvent[]>;
}

/**
 * Stateless orchestrator for agent session runs.
 * Does NOT store session state — each startRun returns an independent RunHandle.
 *
 * @see src/application/chatService.ts:44-49 for the consumer that calls startRun
 * @see src/features/session/agentManager.ts:97 for the facade that wraps this
 */
export class SessionOrchestrator {
  startRun(session: AgentSession, config: SessionRunConfig): RunHandle {
    const allEvents: AnyAgentEvent[] = session
      .getSnapshot()
      .filter((e) => e.type !== "session-start");

    let unsub: Unsubscribe | null = session.bus.on("event", (event) => {
      if (event.type !== "session-start") {
        allEvents.push(event);
      }
      config.onEvent?.(event, allEvents);
    });

    const agent = config.createAgent();

    const done = streamAgentResponse(
      agent,
      config.messages,
      session,
      config.signal,
    )
      .then(() => {
        unsub?.();
        unsub = null;
        return allEvents;
      })
      .catch((err: unknown) => {
        unsub?.();
        unsub = null;
        const error = err as Error;
        if (error.name !== "AbortError" && !error.message?.includes("abort")) {
          session.emit("error", { message: error.message });
          return allEvents;
        }
        throw err;
      });

    const handle: RunHandle = {
      cancel() {
        session.cancel();
        unsub?.();
        unsub = null;
      },
      done,
    };

    return handle;
  }
}
