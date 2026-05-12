import type { ToolLoopAgent } from "ai";
import { AgentSession } from "./agentSession.js";
import { AnyAgentEvent } from "../eventTypes.js";
import { streamAgentResponse } from "./agentStream.js";

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

export interface SessionRunResult {
  events: AnyAgentEvent[];
  onComplete: Promise<AnyAgentEvent[]>;
}

export class SessionOrchestrator {
  private currentSession: AgentSession | null = null;

  startRun(session: AgentSession, config: SessionRunConfig): SessionRunResult {
    this.currentSession = session;

    const allEvents: AnyAgentEvent[] = session.getSnapshot().filter(
      (e) => e.type !== "session-start"
    );
    const unsub = session.bus.on("event", (event) => {
      if (event.type !== "session-start") {
        allEvents.push(event);
      }
      config.onEvent?.(event, allEvents);
    });

    const agent = config.createAgent();

    const onComplete = streamAgentResponse(
      agent,
      config.messages,
      session,
      config.signal,
    )
      .then(() => {
        unsub();
        this.currentSession = null;
        return allEvents;
      })
      .catch((err: unknown) => {
        unsub();
        this.currentSession = null;
        const error = err as Error;
        if (error.name !== "AbortError" && !error.message?.includes("abort")) {
          session.emit("error", { message: error.message });
          return allEvents;
        }
        throw err;
      });

    return { events: allEvents, onComplete };
  }

  cancel(): void {
    this.currentSession?.cancel();
    this.currentSession = null;
  }
}
